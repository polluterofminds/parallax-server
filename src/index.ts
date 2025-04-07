import { Context, Hono, Next } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
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
  setUserNotificationDetails,
} from "./utils/db";
import {
  createVerifyAppKeyWithHub,
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";
import { sendFrameNotification } from "./utils/notifs";
import { gameOver, initEventListeners } from "./utils/contract";
import { Bindings } from "./utils/types";

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
  PRIVATE_KEY: process.env.PRIVATE_KEY || ""
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
        domain: "parallax.cool",
        message: message,
        signature: signature,
      });

      console.log(data);

      if (!success) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      // Add fid and make it available in all requests
      c.set("fid", fid);
      c.set("address", address);
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
    const verifier = createVerifyAppKeyWithHub('https://hub.farcaster.standardcrypto.vc:2281')
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

app.get("/users/me", async (c) => {
  try {
    const fid = c.get("fid");
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
    console.log({characterId})
    const pinata = getPinata(c);

    const conversationFiles = await pinata.files.private
      .list()
      .keyvalues({ characterId, conversation: "true", fid: c.get("fid").toString() });

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
      fid: c.get("fid").toString()
    })

    const characterDetailFiles = await pinata.files.public
      .list()
      .keyvalues({ characterId, parallax_character: "true" });
    const file =
      characterDetailFiles.files && characterDetailFiles.files[0]
        ? characterDetailFiles.files[0]
        : null;
    if (!file) {
      return c.json({ message: "Character details not found " }, 404);
    }
    const rawData: any = await pinata.gateways.public.get(file.cid);
    const characterDetails: Character = rawData.data;
    console.log({
      memory: `${characterDetails?.characterName || ""} - ${
        messages[messages.length - 1].content
      }`,
    });
    // Find nearest memory/memories
    const nearest: any = await pinata.files.private.queryVectors({
      groupId: MEMORIES_GROUP_ID,
      query: `${characterDetails?.characterName || ""} - ${
        messages[messages.length - 1].content
      }`,
    });

    console.log(nearest);
    const matches = nearest.matches.filter(
      (m: VectorQueryMatch) => m.score >= 0.5
    );
    console.log(matches);
    let memoryToUse = "";
    if (matches && matches.length > 0) {
      const data = await pinata.gateways.private.get(matches[0].cid);
      const raw: any = data.data;
      memoryToUse = raw.includes(characterDetails.characterName) ? raw : "";
    }
    console.log(memoryToUse.length);

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
      fid: c.get("fid").toString()
    })

    return c.json({ data: "success" }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
})

app.post("/solve", async (c) => {
  try {
    const { userSolution } = await c.req.json();
    
    const fid = c.get("fid");
    const address = c.get("address");

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
        const aiScore: any = await verifyMotive(userSolution.motive, raw.data.motive);
        console.log("AI score")
        try {
          scores.motive = parseFloat(aiScore);
          console.log("New Scores:");
          console.log(scores);
        } catch (error) {
          console.log(error);
        }
      }
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

    //  Update smart contract
    const result = await gameOver(c, address);
    console.log("Winner contract tx result: ", result)

    return c.json(
      {
        data: {
          status: "right",
          message:
            "Congrats! You've solved the crime. You just won the pot!"
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

serve({
  fetch: app.fetch,
  port: port,
});
