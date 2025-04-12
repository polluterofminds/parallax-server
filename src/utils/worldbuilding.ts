import { Context } from "hono";
import {
  CHARACTER_DETAILS_GROUP_ID,
  getPinata,
  MEMORIES_GROUP_ID,
} from "./storage";
import {
  analyzeCrimeAndDistributeInformation,
  generateCrime,
  generateCustomBackstory,
  generatePublicCrimeInfo,
  getCrimeDetails,
  getGender,
  getRandomAge,
  getRandomCharacterName,
} from "./ai";
import { Character } from "..";
import shortUUID from "short-uuid";
import dotenv from "dotenv";
import { FileListItem } from "pinata/dist";
import { setCaseInfo } from "./contract";
import fs from "fs";
import { getSupabase } from "./db";

dotenv.config();

export const worldDescription =
  "The year is 2125, the world is not only more insular, countries are insular. States have become neighborhoods. Rules are determined by each neighborhood. Trans-neighborhood travel is often banned and trans-global travel can only happen the through deals brokered across multiple territories and with the backing of the few tech companies that can provide air travel. Yet, through it all, the neighborhood of Helix has built a community of openness and trust. Its citizens know each other, socialize with each other, and are happy.";

export const removeOldCaseData = async (c: Context) => {
  try {
    const pinata = getPinata(c);
    console.log("Removing any old case files...");
    //  First we remove old files
    const oldCharacters = await pinata.files.public
      .list()
      .keyvalues({ parallax_character: "true" });
    if (oldCharacters && oldCharacters.files) {
      await pinata.files.public.delete(
        oldCharacters.files.map((c: FileListItem) => c.id)
      );
    }

    console.log("Removing old memories...");
    //  Then we remove the old memories
    const oldMemories = await pinata.files.private
      .list()
      .group(MEMORIES_GROUP_ID);

    if (oldMemories && oldMemories.files) {
      await pinata.files.private.delete(
        oldMemories.files.map((c: FileListItem) => c.id)
      );
    }

    console.log("removing public crime info...");
    //  Then we remove the public crime details
    const publicCrimeDetails = await pinata.files.public
      .list()
      .keyvalues({ publicCrime: "true" });

    if (publicCrimeDetails && publicCrimeDetails.files) {
      await pinata.files.public.delete(
        publicCrimeDetails.files.map((c: FileListItem) => c.id)
      );
    }

    console.log("Removing private crime details...");
    //  Then we delete the private crime details
    const privateCrimeDetails = await pinata.files.private
      .list()
      .keyvalues({ fullCrime: "true" });

    if (privateCrimeDetails && privateCrimeDetails.files) {
      await pinata.files.private.delete(
        privateCrimeDetails.files.map((c: FileListItem) => c.id)
      );
    }

    console.log("Removing motive file...");
    //  Finally we delete the motive file
    const motiveDetails = await pinata.files.private
      .list()
      .keyvalues({ parallax_solution: "true" });

    if (motiveDetails && motiveDetails.files) {
      await pinata.files.private.delete(
        motiveDetails.files.map((c: FileListItem) => c.id)
      );
    }
  } catch (error) {
    console.log("Error removing data: ", error);
    throw error;
  }
};

export const totalCharacters = 10;

export const generateCharacters = async (c: Context) => {
  try {
    const localCharacters = JSON.parse(
      fs.readFileSync("./characters.json", "utf-8")
    );

    if (localCharacters && localCharacters.length > 0) {
      return localCharacters;
    }

    const pinata = getPinata(c);

    const NUM_CHARACTERS = totalCharacters;

    const characters: Character[] = [];

    for (let i = 0; i < NUM_CHARACTERS; i++) {
      // Add a delay between requests to respect rate limits
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }

      const gender = getGender();
      const age = getRandomAge(19, 65);
      const name = getRandomCharacterName(gender);
      const backstory = await generateCustomBackstory(name!, gender, age);
      const honesty = "always honest"; // Hard coding this for now because it didn't add value to the game

      const uploadObject: Character = {
        characterId: shortUUID.generate(),
        characterName: name,
        gender,
        age,
        backstory: backstory!,
        honesty: `${name} is ${honesty}`,
      };

      // Upload one at a time
      await pinata.upload.public
        .json(uploadObject)
        .group(CHARACTER_DETAILS_GROUP_ID)
        .name(name!)
        .keyvalues({
          characterId: uploadObject.characterId,
          parallax_character: "true",
        });

      characters.push(uploadObject);

      // Optional: log progress
      console.log(`Generated character ${i + 1}/${NUM_CHARACTERS}: ${name}`);
    }

    fs.writeFileSync("characters.json", JSON.stringify(characters));
    return characters;
  } catch (error) {
    console.log("Error generating characters ", error);
    throw error;
  }
};

export const giveCharactersMemories = async (
  c: Context,
  characters: Character[],
  mysteryCrime: string
) => {
  const pinata = getPinata(c);
  try {
    console.log("Analyzing crime and distributing information...");

    // Analyze the crime and distribute information
    const { crimeAnalysis, clueDistribution, characterMemories } =
      await analyzeCrimeAndDistributeInformation(mysteryCrime, characters);

    // Save the memory data for each character
    for (const charMemories of characterMemories) {
      const character = characters.find(
        (c) => c.characterName === charMemories.character
      );
      if (!character) continue;

      try {
        console.log(`Processing memories for: ${character.characterName}`);

        // Create a file for each memory
        for (let i = 0; i < charMemories.memories.length; i++) {
          const memoryData = charMemories.memories[i];

          const memoryContent = `${
            character.characterName
          } memory details: ${memoryData.memory!}`;

          const blob = new Blob([memoryContent], { type: "text/plain" });

          const file = new File(
            [blob],
            `${character.characterName}-memory-${i + 1}`,
            {
              type: "text/plain",
            }
          );

          // Uncomment when ready to save to database
          // await pinata.upload.private
          //   .file(file)
          //   .group(MEMORIES_GROUP_ID)
          //   .vectorize();

          console.log(`Saved memory ${i + 1} for ${character.characterName}`);
        }
      } catch (error) {
        console.log("Error for character: ", character.characterName);
        console.log(error);
      }
    }

    return {
      crimeAnalysis,
      clueDistribution,
      characterMemories,
    };
  } catch (error) {
    console.log("Memory generation error: ", error);
    throw error;
  }
};

export const createNewCase = async (c: Context) => {
  try {
    const pinata = getPinata(c);
    const supabase = getSupabase(c);

    console.log("Setting new case");

    let { data: episodes, error } = await supabase
      .from("episodes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Supabase error: ", error);
      throw error;
    }

    const episode = episodes && episodes[0] ? episodes[0] : null;

    if (!episode) {
      throw new Error("No episode found");
    }

    const newCaseNumber = episode.case_number + 1;

    const { data, error: insertError } = await supabase
      .from("episodes")
      .insert([{ case_number: newCaseNumber, duration: 7 }]);

    if (insertError) {
      console.log("Supabase error: ", insertError);
      throw insertError;
    }

    console.log("Removing old data...");
    await removeOldCaseData(c);

    const characters = await generateCharacters(c);

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
    const publicCrimeRes = await pinata.upload.public
      .file(publicFile)
      .name("Parallax Public Crime Info")
      .keyvalues({ publicCrime: "true" });

    const publicCrimeHash = publicCrimeRes.cid;

    console.log("setting case file...");

    await setCaseInfo(c, `ipfs://${publicCrimeHash}`);

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
      } catch (error) {
        console.log("Error with details: ", details);
        console.log(error);
      }
    }

    //  Give the characters memories
    await giveCharactersMemories(c, characters, mysteryCrime!);

    return "success";
  } catch (error) {
    console.error(error);
    throw error;
  }
};
