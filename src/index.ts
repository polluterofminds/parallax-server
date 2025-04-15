import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { chatWithCharacter, verifyMotive } from "./utils/ai";
import { createNewCase } from "./utils/worldbuilding";
import { getPinata, MEMORIES_GROUP_ID } from "./utils/storage";
import { compareAnswers } from "./utils/solve";
import { VectorQueryMatch } from "pinata";
import dotenv from "dotenv";
import { createAppClient, viemConnector } from "@farcaster/auth-client";
import { jwtDecode } from "jwt-decode";
import {
  deleteUserNotificationDetails,
  getSupabase,
  getUserNotificationDetails,
  isCaseOver,
  setUserNotificationDetails,
} from "./utils/db";
import {
  createVerifyAppKeyWithHub,
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";
import { sendFrameNotification } from "./utils/notifs";
import { gameOver, hasPlayerDeposited, initEventListeners, submitSolution } from "./utils/contract";
import { Bindings } from "./utils/types";

//  @ts-expect-error no types needed
import cron from "node-cron";
import { getUserByVerifiedAddress } from "./utils/farcaster";

const bypassRoutes = ["/webhooks"];

const appClient = createAppClient({
  relay: "https://relay.farcaster.xyz",
  ethereum: viemConnector(),
});

// Load environment variables
dotenv.config();

// Get environment variables
const env: Bindings = {
  PINATA_JWT: process.env.PINATA_JWT || "",
  PINATA_GATEWAY_URL: process.env.PINATA_GATEWAY_URL || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY || "",
  WEBSOCKET_RPC_URL: process.env.WEBSOCKET_RPC_URL || "",
  RPC_URL: process.env.RPC_URL || "",
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || "",
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || "",
  PRIVATE_KEY: process.env.PRIVATE_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || ""
};

export type Character = {
  characterId: string;
  characterName: string;
  gender: string;
  age: number;
  backstory: string;
  honesty: string;
};

declare module "hono" {
  interface ContextVariableMap {
    fid: number;
    address: string;
  }
}

const app = new Hono();

app.use(cors());

// Middleware to inject environment bindings
app.use("*", async (c, next) => {
  c.env = env;
  const path = c.req.path;
  if (bypassRoutes.some((route) => path.startsWith(route))) {
    // Skip authentication for whitelisted routes
    return await next();
  }

  try {
    const token = c.req.header("fc-auth-token");

    if (!token) {
      return c.json({ message: "Unauthorized - not token provided" }, 401);
    }

    if (token !== "TEST") {
      const decodedToken: any = jwtDecode(token);

      const { signature, message, nonce, address } = decodedToken;
      console.log({ signature, message, nonce, address });

      if (!signature || !message || !nonce) {
        console.log("Invalid token payload");
        return c.json({ message: "Unauthorized" }, 401);
      }

      const { data, success, fid } = await appClient.verifySignInMessage({
        nonce: nonce,
        domain: "48d7-66-68-201-142.ngrok-free.app",
        message: message,
        signature: signature,
      });

      if (!success) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      // Add fid and make it available in all requests
      c.set("fid", fid);
      c.set("address", address);
    } else {
      c.set("fid", 0);
    }

    await next();
  } catch (error) {
    console.log("JWT verification error:", error);
    return c.json({ message: "Unauthorized - Invalid token" }, 401);
  }
});

app.post("/webhooks", async (c) => {
  try {
    const requestJson = await c.req.json();
    console.log(requestJson);
    const verifier = createVerifyAppKeyWithHub(
      "https://hub.farcaster.standardcrypto.vc:2281"
    );
    const data = await parseWebhookEvent(requestJson, verifier);
    const fid = data.fid;
    const event = data.event;
    switch (event.event) {
      case "frame_added":
        if (event.notificationDetails) {
          await setUserNotificationDetails(c, fid, event.notificationDetails);
          await sendFrameNotification(c, {
            fid,
            title: "Welcome to Parallax",
            body: "With the frame installed, you have an advantage!",
          });
        } else {
          await deleteUserNotificationDetails(c, fid);
        }
        break;
      case "frame_removed":
        await deleteUserNotificationDetails(c, fid);

        break;
      case "notifications_enabled":
        await setUserNotificationDetails(c, fid, event.notificationDetails);

        break;
      case "notifications_disabled":
        await deleteUserNotificationDetails(c, fid);

        break;
    }

    return c.json({ message: "Success" }, 200);
  } catch (e: unknown) {
    const error = e as ParseWebhookEvent.ErrorType;

    switch (error.name) {
      default:
      case "VerifyJsonFarcasterSignature.InvalidDataError":
      case "VerifyJsonFarcasterSignature.InvalidEventDataError":
        // The request data is invalid
        return c.json({ message: "Request data is invalid" }, 400);
      case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
        // The app key is invalid
        return c.json({ message: "Invalid API key" }, 401);
      case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
        // Internal error verifying the app key (caller may want to try again)
        return c.json({ message: "Internal error" }, 400);
    }
  }
});

app.get("/", (c) => {
  return c.text("Hello Hono on Railway!");
});

app.get("/episode", async (c) => {
  try {
    const supabase = getSupabase(c);

    let { data: episodes, error } = await supabase
      .from("episodes")
      .select("*")
      .limit(2)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const episode = episodes && episodes[0] ? episodes[0] : null;
    return c.json({ data: episode }, 200);
  } catch (error) {
    console.log(error);
  }
});

app.get("/deposit-status", async (c) => {
  try {
    const address = c.req.query("address");
    const fid = c.get("fid");
    
    if(!address) {
      return c.json({ message: "No wallet address" }, 400);
    }

    // const userInfo = await getUserByVerifiedAddress(c, address);
    // const user = userInfo;
    // console.log(user);

    const depositStatus = await hasPlayerDeposited(c, address);
    console.log({depositStatus});
    return c.json({ data: depositStatus });
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
})

app.get("/solution_attempts", async (c) => {
  try {
    const fid = c.get("fid");
    const supabase = getSupabase(c);
    let { data: episodes, error: episodesError } = await supabase
      .from("episodes")
      .select("*")
      .limit(2)
      .order("created_at", { ascending: false });

    if (episodesError) {
      throw episodesError;
    }

    const episode = episodes && episodes[0] ? episodes[0] : null;

    let { data: solution_attempts, error: solutionError } = await supabase
      .from("solution_attempts")
      .select("*")
      .eq("fid", fid);

    if (solutionError) {
      console.log("Supabase solution error", solutionError);
    }

    const solutionAttempts = solution_attempts?.length || 0;

    let { data: solution_payments, error } = await supabase
      .from("solution_payments")
      .select("*")
      .eq("fid", fid)
      .eq("case_number", episode.case_number);

      if(error) {
        throw error;
      }

      console.log(solution_payments)
    return c.json({ data: { solutionAttempts, payment: solution_payments && solution_payments.length > 0 ? true : false } }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/solution_attempts", async (c) => {
  try {
    const fid = c.get("fid");
    const supabase = getSupabase(c);
    let { data: episodes, error: episodesError } = await supabase
      .from("episodes")
      .select("*")
      .limit(2)
      .order("created_at", { ascending: false });

    if (episodesError) {
      throw episodesError;
    }

    const episode = episodes && episodes[0] ? episodes[0] : null;

    if (!episode) {
      return c.json({ message: "No current case found" }, 404);
    }

    const { data, error } = await supabase
      .from("solution_payments")
      .insert([{ fid: fid, case_number: episode.case_number, has_paid: true }])
      .select();

    if (error) {
      throw error;
    }

    return c.json({ message: "Success" }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.get("/users/me", async (c) => {
  try {
    const fid = c.get("fid");
    //  If no FID, we are in test mode
    if (!fid) {
      return c.json(
        {
          profile: {
            fid: "4823",
            username: "polluterofminds",
            displayName: "Justin Hunter",
            frameAdded: true,
          },
        },
        200
      );
    }
    const res = await fetch(
      `https://hub.pinata.cloud/v1/userDataByFid?fid=${fid}`
    );
    const data = await res.json();
    const userDataMessages = data.messages.map((d: any) => d.data);

    const profile = {
      fid: fid,
      username: userDataMessages.find(
        (d: any) => d.userDataBody.type === "USER_DATA_TYPE_USERNAME"
      ).userDataBody.value,
      displayName:
        userDataMessages.find(
          (d: any) => d.userDataBody.type === "USER_DATA_TYPE_DISPLAY"
        ).userDataBody.value || "",
      frameAdded: false,
    };

    const userNotificationDetails = await getUserNotificationDetails(c, fid);
    if (userNotificationDetails && userNotificationDetails.notification_token) {
      profile.frameAdded = true;
    }

    return c.json({ profile }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.get("/chat/:characterId", async (c) => {
  try {
    const characterId = c.req.param("characterId");
    console.log({ characterId });
    const pinata = getPinata(c);

    const conversationFiles = await pinata.files.private.list().keyvalues({
      characterId,
      conversation: "true",
      fid: c.get("fid").toString(),
    });

    if (!conversationFiles.files || conversationFiles.files.length === 0) {
      return c.json({ messages: [] }, 200);
    }

    // Get the most recent conversation file
    const file = conversationFiles.files[0];
    const data = await pinata.gateways.private.get(file.cid);

    return c.json({ messages: data.data }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server Error" }, 500);
  }
});

app.post("/chat", async (c) => {
  try {
    const { messages, characterId, crime } = await c.req.json();

    const pinata = getPinata(c);

    await pinata.upload.private.json(messages).keyvalues({
      characterId,
      conversation: "true",
      fid: c.get("fid").toString(),
    });

    console.log("Uploaded messages...");

    const characterDetailFiles = await pinata.files.public
      .list()
      .keyvalues({ characterId, parallax_character: "true" });

    console.log("Got the character details file...");
    const file =
      characterDetailFiles.files && characterDetailFiles.files[0]
        ? characterDetailFiles.files[0]
        : null;
    if (!file) {
      return c.json({ message: "Character details not found " }, 404);
    }
    const rawData: any = await pinata.gateways.public.get(file.cid);
    const characterDetails: Character = rawData.data;
    
    let memoryToUse = ""
    const files = await pinata.files.private.list().name(`${characterDetails.characterName}-memory`)    
    if(files.files && files.files[0]) {
      const rawMemory = await pinata.gateways.private.get(files.files[0].cid);
      memoryToUse = rawMemory.data as string;
    }

    // Set up streaming response
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    // Create a new readable stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await chatWithCharacter(
            controller,
            characterDetails,
            memoryToUse,
            crime,
            messages
          );
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return c.body(stream);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/storage/chat/:characterId", async (c) => {
  try {
    const { messages } = await c.req.json();
    const characterId = c.req.param("characterId");

    const pinata = getPinata(c);

    await pinata.upload.private.json(messages).keyvalues({
      characterId,
      conversation: "true",
      fid: c.get("fid").toString(),
    });

    return c.json({ data: "success" }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/solve", async (c) => {
  try {
    //  Get case info
    const supabase = getSupabase(c);

    let { data: episodes, error } = await supabase
      .from("episodes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Supabase error: ", error);
      throw error;
    }

    const episode = episodes && episodes[0] ? episodes[0] : null;

    if (episode) {
      //  Check if duration has passed
      const createdAt = new Date(episode.created_at);

      console.log("Created at:", createdAt.toISOString());

      // Convert duration from days to milliseconds
      // This is likely the issue - we need to convert based on what your duration represents
      const durationInMs = episode.duration * 24 * 60 * 60 * 1000; // Duration in days to ms

      // Add the duration to the created_at timestamp
      const expirationTime = new Date(createdAt.getTime() + durationInMs);

      console.log("Expiration time:", expirationTime.toISOString());

      // Get current time
      const currentTime = new Date();
      console.log("Current time:", currentTime.toISOString());

      if (currentTime > expirationTime) {
        return c.json({ message: "The episode has ended" }, 400);
      }
    } else {
      return c.json({ message: "No episode found" }, 400);
    }

    const { userSolution, address } = await c.req.json();

    const fid = c.get("fid");

    //  Check if the user has attempted multiple solutions
    const caseNumber = episode.case_number;

    let { data: solution_attempts, error: solutionError } = await supabase
      .from("solution_attempts")
      .select("*")
      .eq("fid", fid);

    if (solutionError) {
      console.log("Supabase solution error", solutionError);
    }

    const solutionAttempts = solution_attempts?.length || 0;

    if (solutionAttempts > 1) {
      return c.json(
        { message: "You've already tried to solve this case two times" },
        401
      );
    }

    //  Check for payment onchain if solution attempts is equal to 1 before allowing attempt

    const pinata = getPinata(c);
    const solutionFileDetails = await pinata.files.private
      .list()
      .keyvalues({ parallax_solution: "true" });
    const data = solutionFileDetails.files[0];
    const cid = data.cid;

    const raw: any = await pinata.gateways.private.get(cid);
    console.log(raw.data);
    console.log(typeof raw.data);
    const scores = compareAnswers(raw.data as any, userSolution);
    console.log("Original Scores:");
    console.log(scores);
    let motiveScore = scores.motive;

    if (motiveScore < 0.6) {
      const crimeResults = await pinata.files.private
        .list()
        .keyvalues({ fullCrime: "true" });
      if (crimeResults && crimeResults.files[0]) {
        console.log(userSolution.motive, raw.data.motive);
        const aiScore: any = await verifyMotive(
          userSolution.motive,
          raw.data.motive
        );
        console.log("AI score");
        try {
          scores.motive = parseFloat(aiScore);
          console.log("New Scores:");
          console.log(scores);
        } catch (error) {
          console.log(error);
        }
      }
    }

    //  Write solution attempt

    const { data: solutionWriteData, error: solutionWriteError } =
      await supabase
        .from("solution_attempts")
        .insert([{ fid: fid, case_number: caseNumber }])
        .select();

    if (solutionWriteError) {
      console.log("Error writing to supabase solution attempt: ", error);
      throw error;
    }

    if (
      scores.total < 0.8 ||
      scores.victims < 0.8 ||
      scores.criminal < 0.8 ||
      scores.motive < 0.6
    ) {
      return c.json(
        {
          data: {
            status: "wrong",
            criminal:
              scores.criminal >= 0.8
                ? "You got the criminal correct!"
                : "You didn't get the criminal correct :(",
            victims:
              scores.victims >= 0.8
                ? "You got the victims right"
                : "You didn't get the victims right :(",
            motive:
              scores.motive >= 0.6
                ? "You built a solid case and the motive will hold up in court!"
                : "That motive has no chance of holding up in court.",
          },
        },
        200
      );
    }

    await submitSolution(c, address);

    return c.json(
      {
        data: {
          status: "right",
          message: "Congrats! You've solved the crime. Let's see how others do!",
        },
      },
      200
    );
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.get("/case-file", async (c) => {
  try {
    const pinata = getPinata(c);
    const files = await pinata.files.public
      .list()
      .keyvalues({ publicCrime: "true" });
    if (!files.files) {
      return c.json({ message: "No crime data found" }, 404);
    }

    const fileInfo = files.files[0];
    const data = await pinata.gateways.public.get(fileInfo.cid);
    const crime = data.data;

    const characterData = await pinata.files.public
      .list()
      .keyvalues({ parallax_character: "true" });
    if (!characterData.files) {
      return c.json({ message: "No characters found" }, 404);
    }

    const characters = characterData.files;
    console.log(characters);
    return c.json({ characters, crime });
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server Error" }, 500);
  }
});

app.post("/new-case", async (c) => {
  await createNewCase(c);
  return c.json({ data: "Success" });
});

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server is running on port ${port}`);

initEventListeners(env);

cron.schedule('0 * * * *', async () => {
  try {
    console.log("Checking if case is over...")
    const over = await isCaseOver(env);
    console.log("Case over? ", over);
    if(over) {
      const c: any = {
        env
      }
      await gameOver(c);      
    }
  } catch (error) {
    console.log("Cron error");
    console.log(error);
  }
});

serve({
  fetch: app.fetch,
  port: port,
});
