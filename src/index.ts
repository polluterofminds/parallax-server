import { Hono } from "hono";
import {
  chatWithCharacter,
  generateCrime,
  generateCustomBackstory,
  generatePublicCrimeInfo,
  getCrimeDetails,
  getGender,
  getRandomAge,
  getRandomCharacterName,
  getRandomHonesty,
  giveCharacterCrimeMemory,
  verifyMotive,
} from "./utils/ai";
import { totalCharacters } from "./utils/worldbuilding";
import {
  CHARACTER_DETAILS_GROUP_ID,
  getPinata,
  MEMORIES_GROUP_ID,
} from "./utils/storage";
import short from "short-uuid";
import { compareAnswers } from "./utils/solve";
import { VectorQueryMatch } from "pinata";

type Bindings = {
  PINATA_JWT: string;
  PINATA_GATEWAY_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
};

type Scores = {
  criminal: number;
  victims: number;
  motive: number;
  total: number;
};

export type Character = {
  characterId: string;
  characterName: string;
  gender: string;
  age: number;
  backstory: string;
  honesty: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/chat", async (c) => {
  try {
    const { text, characterId, crime } = await c.req.json();

    const pinata = getPinata(c);

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
      memory: `${characterDetails?.characterName || ""} - ${text}`,
    });
    //  Find nearest memory/memories
    const nearest: any = await pinata.files.private.queryVectors({
      groupId: MEMORIES_GROUP_ID,
      query: `${characterDetails?.characterName || ""} - ${text}`,
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

    const answer = await chatWithCharacter(
      characterDetails,
      memoryToUse,
      crime,
      text
    );

    return c.json({ data: answer }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/solve", async (c) => {
  try {
    const { userSolution } = await c.req.json();
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

    let motiveScore = scores.motive;

    if (motiveScore < 0.6) {
      const crimeResults = await pinata.files.private
        .list()
        .keyvalues({ fullCrime: "true" });
      if (crimeResults && crimeResults.files[0]) {
        const crimeFileData = await pinata.gateways.private.get(
          crimeResults.files[0].cid
        );
        const rawFile: any = crimeFileData.data;

        const aiScore: any = await verifyMotive(userSolution.motive, rawFile);

        try {
          scores.motive = parseFloat(aiScore);
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
      //  Update smart contract

      //  Send frame notifications

      //  Reset game - This should either call a function or an endpoint to reset the game but be non-blocking to this response
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

    return c.json(
      {
        data: {
          status: "right",
          message:
            "Congrats! You've solved the crime. Mint your reward for free.",
        },
      },
      200
    );
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 500);
  }
});

app.post("/generate-character-data", async (c) => {
  try {
    const pinata = getPinata(c);

    const NUM_CHARACTERS = totalCharacters;

    const characters = await Promise.all(
      Array.from({ length: NUM_CHARACTERS }).map(async () => {
        const gender = getGender();
        const age = getRandomAge(19, 65);
        const name = getRandomCharacterName(gender);
        const backstory = await generateCustomBackstory(name!, gender, age);
        const honesty = "always honest"; // Hard coding this for now because it didn't add value to the game

        const uploadObject: Character = {
          characterId: short.generate(),
          characterName: name,
          gender,
          age,
          backstory: backstory!,
          honesty: `${name} is ${honesty}`,
        };

        await pinata.upload.public
          .json(uploadObject)
          .group(CHARACTER_DETAILS_GROUP_ID)
          .name(name!)
          .keyvalues({
            characterId: uploadObject.characterId,
            parallax_character: "true",
          });

        return uploadObject;
      })
    );

    //  Create the secret
    const mysteryCrime = await generateCrime();
    console.log({ mysteryCrime });

    //  Upload the crime info to Pinata
    const crimeFile = new File([mysteryCrime!], "parallax_crime.txt", {
      type: "text/plain",
    });
    await pinata.upload.private
      .file(crimeFile)
      .name("Parallax Full Crime")
      .keyvalues({ fullCrime: "true" });

    const publicInfo = await generatePublicCrimeInfo(mysteryCrime!);
    console.log({ publicInfo });
    const publicFile = new File([publicInfo!], "parallax_crime_public.txt", {
      type: "text/plain",
    });
    await pinata.upload.public
      .file(publicFile)
      .name("Parallax Public Crime Info")
      .keyvalues({ publicCrime: "true" });

    //  Get verifiable details
    let tryAgain = true;
    while (tryAgain) {
      const details = await getCrimeDetails(mysteryCrime!);
      try {
        const parsed = JSON.parse(details!);
        if (!parsed.victims || !parsed.criminal || !parsed.motive) {
          throw new Error("Incorrect JSON");
        } else {
          console.log(parsed);

          await pinata.upload.private
            .json(parsed)
            .keyvalues({ parallax_solution: "true" });
          tryAgain = false;
        }

        //  This is the text we will use semantic search against to solve the crime
      } catch (error) {
        console.log("Error with details: ", details);
        console.log(error);
      }
    }

    //  Give the characters memories
    for (const character of characters) {
      try {
        console.log(character.characterName);
        const memory = await giveCharacterCrimeMemory(mysteryCrime!, character);
        const blob1 = new Blob(
          [`${character.characterName} memory details: ${memory!}`],
          { type: "text/plain" }
        );
        const file1 = new File([blob1], `${character.characterName}-memory-1`, {
          type: "text/plain",
        });
        await pinata.upload.private
          .file(file1)
          .group(MEMORIES_GROUP_ID)
          .vectorize();

        const memory2 = await giveCharacterCrimeMemory(
          mysteryCrime!,
          character
        );
        const blob2 = new Blob(
          [`${character.characterName} memory details: ${memory2!}`],
          { type: "text/plain" }
        );
        const file2 = new File([blob2], `${character.characterName}-memory-2`, {
          type: "text/plain",
        });
        await pinata.upload.private
          .file(file2)
          .group(MEMORIES_GROUP_ID)
          .vectorize();
      } catch (error) {
        console.log("Error for character: ", character.characterName);
        console.log(error);
      }
    }

    return c.json({ data: "Success" }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Server error" }, 500);
  }
});

export default app;
