import OpenAI from "openai";
import { worldDescription } from "./worldbuilding";
import { faker } from "@faker-js/faker";
import { Character } from "..";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({
  // baseURL: "http://localhost:11434/v1",
  // apiKey: "ollama",
  baseURL: "https://api.anthropic.com/v1/",
  apiKey: process.env.CLAUDE_API_KEY,
});

const model = "claude-3-5-sonnet-20241022";
const chatModel = "claude-3-5-haiku-20241022"

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export const getRandomAge = (min: number, max: number) => {
  if (min > max) {
    throw new Error("Minimum age cannot be greater than maximum age.");
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getGender = () => {
  const genderOptions = ["male", "female"];
  const randomGender =
    genderOptions[Math.floor(Math.random() * genderOptions.length)];
  return randomGender;
};

export const getRandomCharacterName = (gender: string) => {
  if (gender === "male" || gender === "female") {
    return `${faker.person.firstName(gender)} ${faker.person.lastName(gender)}`;
  } else {
    throw new Error(`Invalid gender: ${gender}`);
  }
};

export const generateCustomBackstory = async (
  characterName: string,
  gender: string,
  age: number
) => {
  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a master game designer. Your job is to create rich character backstories based on user input. Respond with only the backstory — no extra commentary or framing.

✅ Example of a good response:
CHARACTER NAME was born in YEAR in a DETAILS of Helix...

❌ Do not include any preamble like:
"Oh, what a great idea! Let me create a backstory..."`,
        },
        {
          role: "user",
          content: `Please create a backstory for ${characterName} who is ${gender} and is ${age} years old. The backstory should take into account a story set in this world: ${worldDescription} Only reply with the backstory, nothing else or you will destroy the game. Limit your response to 500 characters.`,
        },
      ],
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const getRandomHonesty = () => {
  const honestyOptions = [
    "always honest",
    "usually honest but tells white lies",
    "playfully dishonest but tells the truth when it matters",
    "usually lying",
  ];
  const randomHonesty =
    honestyOptions[Math.floor(Math.random() * honestyOptions.length)];
  return randomHonesty;
};

export const generateCrime = async () => {
  const character1Gender = getGender();
  const character2Gender = getGender();
  const character1 = getRandomCharacterName(character1Gender);
  const character2 = getRandomCharacterName(character2Gender);

  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: `You are a master murder mystery game designer. Your job is to write a complete crime story in one or two plain sentences, using 500 characters or fewer.

The story must clearly include:

    Who committed the murder

    What they did

    Why they did it

Example:
Karen stabbed her husband Mark after discovering he had secretly drained their savings to pay off a mistress. She did it in a fit of rage.

Rules:

    The motive must be simple and obvious, like money, jealousy, or revenge.

    No detectives, investigations, or aftermath.

    No twins or mistaken identity.

    Use plain, everyday language.

    Output only the story itself. No extra text.

    Stop once the motive is explained.`,
      },
      {
        role: "user",
        content: `In this world: ${worldDescription}. Then there was the crime.
Write a short, complete story about a crime involving ${character1}, a ${character1Gender}, and ${character2}, a ${character2Gender}. Be sure to include who committed the crime and why, following the format and rules.`,
      },
    ],
  });

  return completion.choices[0].message.content;
};

export const generatePublicCrimeInfo = async (crimeDetails: string) => {
  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: `You are an award winning game designer who needs to maintain mystery about a murder that has been committed so that players have enough details to start asking questions. The user will provide the full crime details, but you need to respond with a *one-sentence* description about the crime that doesn't reveal the murderer or motive. Just the basic facts.
  
  Your summary **must** follow these rules:
  - ✅ Mention the place of the crime.
  - ✅ Mention the victim.
  - ✅ Mention how the victim was found or died.
  - ❌ Do NOT mention any suspects, motives, or clues.
  - ❌ Do NOT name the criminal.
  - ❌ Do NOT include speculation, suspicions, or context that suggests motive or access.
  - ❌ Avoid dramatic or emotional language.
  
  The summary should be neutral, like a short news blurb or police bulletin. Do not make up details that are not included in the full crime details provided by the user.
  `,
      },
      {
        role: "user",
        content: `Here are the full crime details for internal context only (do NOT include information that helps solve the mystery): ${crimeDetails}`,
      },
    ],
  });

  return completion.choices[0].message.content;
};

export const getCrimeDetails = async (crimeDetails: string) => {
  const prompt = `Given the following crime summary, extract the structured details below:

Crime Summary:
${crimeDetails}

Please return the following information in JSON format:
{
  "victims": Comma separated list of any victims,
  "criminal": "Name of the criminal",
  "motive": "Short explanation of the motive"
}
`;

  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: `Please only respond with what the user has requested. Do not add a preamble or any additional text. 
            GOOD RESPONSE: 

            {
                "victims": Comma separated list of any victims,
                "criminal": "Name of the criminal",
                "motive": "Short explanation of the motive"
            }

            BAD RESPONSE: 

            Here's the information you provided in the form of ....
            `,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return completion.choices[0].message.content;
};

export const giveCharacterCrimeMemory = async (
  crime: string,
  characterDetails: Character
) => {
  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: `You are ${characterDetails.characterName}'s BRAIN. More details about YOU: ${characterDetails.backstory} 
        Your job is to create a memory or fact that ${characterDetails.characterName} will know about a crime the user is providing you. Your memory should include a person named in the original crime, a place, or an action related to the crime. The information should be materially relevant to the crime. It should include HOW the character knows this thing. DO NOT respond with a preamble or extra text. Respond by starting with "You remember" and then provide just the clue/memory info. The user will provide the crime details. DO NOT REVEAL WHO THE KILLER IS IN YOUR MEMORY. SUSPICIONS ARE FINE IF YOU CAN BACK THEM UP. Your response should be in a structured text form and should include both the memory as well as metadata about the memory like this: 

                    memory: THE MEMORY YOU GENERATE,
                    metadata: METADATA ABOUT MEMORY GOES HERE
                `,
      },
      {
        role: "user",
        content: crime,
      },
    ],
  });

  return completion.choices[0].message.content;
};

export const chatWithCharacter = async (
  controller: ReadableStreamDefaultController,
  characterDetails: Character,
  memories: string,
  crime: string,
  messages: Message[]
) => {
  try {
    // Create a copy of the messages array to avoid mutating the original
    const updatedMessages = [...messages];
    // Add system message to the beginning
    updatedMessages.unshift({
      role: "system",
      content: `You are aware of the crime: ${crime} You are ${
      characterDetails.characterName
      }. You are ${characterDetails.age} years old. You are ${
      characterDetails.gender
      }. You are NOT an investigator in the crime unless your backstory says you are. You are answering questions about the crime. This is your backstory: ${
      characterDetails.backstory
      }. You live in this world: ${worldDescription}. ${
      memories.length > 0
      ? `You remember the following: ${memories}`
      : `You don't have memories of this specific question and should respond with something that indicates you don't know.`
      }. Please respond to the user and NEVER break character. Do not add anything that is not a response in character and do not ever admit to being an AI. If you don't know the answer to a user input say you don't know. Do not make up new character names that are not part of your memory or the crime.`,
    });
    
    // For debugging
    console.log(
      "Messages being sent to OpenAI:",
      JSON.stringify(updatedMessages)
    );
    
    const completion = await client.chat.completions.create({
      model: chatModel,
      messages: updatedMessages,
      stream: true,
    });
    
    // Process the streaming response
    for await (const chunk of completion) {
      if (chunk.choices && chunk.choices.length > 0) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          // Send the chunk as a Server-Sent Event
          const data = `data: ${JSON.stringify({ content })}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
      }
    }
    
    // Send an event to indicate the stream is complete
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
  } catch (error: any) {
    // Handle errors by sending them to the client
    console.error("Error in AI chat:", error);
    
    // Create a user-friendly error message
    let errorMessage = "An error occurred while processing your request.";
    
    if (error.code === 'overloaded_error') {
      errorMessage = "OpenAI servers are currently overloaded. Please try again in a few moments.";
    } else if (error.message) {
      // Use the error message from the API if available
      errorMessage = `Error: ${error.message}`;
    }
    
    // Send the error to the client
    const errorData = `data: ${JSON.stringify({ 
      error: true, 
      message: errorMessage,
      code: error.code || 'unknown_error'
    })}\n\n`;
    
    controller.enqueue(new TextEncoder().encode(errorData));
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
  }
};

export const verifyMotive = async (motive: string, crimeMotive: string) => {
  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: `Please only provide a score from 0 - 1 where 1 is the highest perfect possible result. You are scoring based on how accurate the user player's motive is compared to provided motive. Do not include a preamble or extra text. Just the floating point number.
            
            A 1 is a perfect score. This should only be applied if the motive provided by the user is a perfect match to the correct motive However, that is very unlikely. So you should compare the user's intent and understanding of the motive rather than a word for word comparison.

            EXAMPLE MOTIVE: Jealousy fueld by need for control.

            EXAMPLE HIGH RATING MOTIVE BY USER: She was jealous and wanted control for herself.

            EXAMPLE LOW RATING MOTIVE BY USER: She was in love with Ben but he didn't want her.
            `,
      },
      {
        role: "user",
        content: `Please rate the motive I have discovered, ${motive}, with the actual motive, ${crimeMotive}, and provide a score from 0 to 1 based on how close my motive matches up with the crime motive. 1 is the best score.`,
      },
    ],
  });

  return completion.choices[0].message.content;
};
