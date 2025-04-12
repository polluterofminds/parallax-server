import { Context } from "hono";
import { ethers } from "ethers";
import { abi } from "./abi";
import { sendNotificationsToAllPlayers } from "./notifs";
import { Bindings } from "./types";
import { getUserByVerifiedAddress } from "./farcaster";
import { createNewCase } from "./worldbuilding";

export function initEventListeners(env: Bindings) {
  const c: any = {
    env,
  };
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const wsProvider = new ethers.WebSocketProvider(env.WEBSOCKET_RPC_URL);

  const contract = new ethers.Contract(env.CONTRACT_ADDRESS, abi, provider);
  const wsContract = new ethers.Contract(
    c.env.CONTRACT_ADDRESS,
    abi,
    wsProvider
  );

  console.log("Initialized event listeners")

  // Listen for PlayerDeposited events
  wsContract.on(
    "PlayerDeposited",
    async (player, amount, caseNumber, event) => {
      //  Need to find the Farcaster user info based on player address
      try {
        console.log(
          `Player Deposited: ${player} deposited ${ethers.formatUnits(
            amount,
            6
          )} USDC in case ${caseNumber}`
        );
        const user = await getUserByVerifiedAddress(c, player);
        const userInfo = user[player];
        const username = userInfo.username;
        console.log("New player joined: " + username);
        //  Get all active players
        // await sendNotificationsToAllPlayers(
        //   c,
        //   "A new detecive has joined the investigation!",
        //   `${username} has joined!`
        // );
      } catch (error) {
        console.log(`PlayerDeposited error: `, error);
      }
    }
  );

  // Listen for CaseStatusChanged events
  wsContract.on("CaseStatusChanged", async (caseNumber, status, event) => {
    const statusMap = ["Pending", "Active", "Completed"];
    if (statusMap[status] === "Active") {
      //  Send notification that the investigation has begun
      // await sendNotificationsToAllPlayers(
      //   c,
      //   "A new case has started!",
      //   `Join or begin your investigation now!`
      // );
    }
    console.log(
      `Case Status Changed: Case ${caseNumber} status is now ${statusMap[status]}`
    );
  });

  // Listen for CaseEnded events
  wsContract.on("CaseEnded", async (caseNumber, winner, prize, event) => {
    console.log(
      `Case Ended: Case ${caseNumber} won by ${winner} with prize ${ethers.formatUnits(
        prize,
        6
      )} USDC`
    );

    const user = await getUserByVerifiedAddress(c, winner);
    const userInfo = user[winner];
    const username = userInfo.username;

    // await sendNotificationsToAllPlayers(
    //   c,
    //   "The case is over!",
    //   "Winnings will be dispersed to all who solved the case."
    // );
    console.log("Creating new case");
    await createNewCase(c);
  });

  // Listen for CaseCancelled events
  wsContract.on("CaseCancelled", (caseNumber, event) => {
    console.log(`Case Cancelled: Case ${caseNumber} has been cancelled`);
  });

  // Listen for PlayerRefunded events
  wsContract.on("PlayerRefunded", (player, amount, caseNumber, event) => {
    console.log(
      `Player Refunded: ${player} refunded ${ethers.formatUnits(
        amount,
        6
      )} USDC from case ${caseNumber}`
    );
  });

  // Handle connection errors
  wsProvider.on("error", (error) => {
    console.error("WebSocket Error:", error);
    // Attempt to reconnect after a delay
    setTimeout(initEventListeners, 10000);
  });
}

export const gameOver = async (c: Context) => {
  try {
    console.log("Calling game over function on contract");
    const provider = new ethers.JsonRpcProvider(c.env.RPC_URL);
    const wallet = new ethers.Wallet(c.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(c.env.CONTRACT_ADDRESS, abi, wallet);
    const tx = await contract.gameOver();
    console.log("Game over tx: ");
    console.log(tx);
    await tx.wait();    

    console.log("Sending notifications...");
    // await sendNotificationsToAllPlayers(
    //   c,
    //   "The case is over!",
    //   "Winnings will be dispersed to all who solved the case."
    // );
    console.log("Creating new case");
    await createNewCase(c);
    return tx.hash;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const setCaseInfo = async (c: Context, ipfsString: string) => {
  try {
    console.log("Setting case info");
    const provider = new ethers.JsonRpcProvider(c.env.RPC_URL);
    const wallet = new ethers.Wallet(c.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(c.env.CONTRACT_ADDRESS, abi, wallet);
    const tx = await contract.setCaseCrimeInfo(ipfsString);
    console.log("Case info tx:");
    console.log(tx);
    await tx.wait();
    return tx;
  } catch (error) {
    console.log("New case info error");
    throw error;
  }
};
