import { Context } from "hono";
import {
  getNotifcationDetailsForAllPlayers,
  getUserNotificationDetails,
} from "./db";

const appUrl = process.env.NEXT_PUBLIC_URL || "";

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

function splitArrayIntoChunks(tokenArray: string[], maxChunkSize = 100) {
  const result = [];

  for (let i = 0; i < tokenArray.length; i += maxChunkSize) {
    const chunk = tokenArray.slice(i, i + maxChunkSize);
    result.push(chunk);
  }

  return result;
}

export async function sendFrameNotification(
  c: Context,
  {
    fid,
    title,
    body,
  }: {
    fid: number;
    title: string;
    body: string;
  }
): Promise<SendFrameNotificationResult> {
  const notificationDetails = await getUserNotificationDetails(c, fid);

  if (!notificationDetails) {
    return { state: "no_token" };
  }

  const response = await fetch(notificationDetails.notification_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: appUrl,
      tokens: [notificationDetails.notification_token],
    }),
  });

  const responseJson = await response.json();

  if (response.status === 200) {    
    return { state: "success" };
  } else {
    // Error response
    return { state: "error", error: "Error sending notification" };
  }
}

export async function bulkSendFrameNotification(
  c: Context,
  {
    url,
    tokens,
    title,
    body,
  }: {
    url: string;
    tokens: string[];
    title: string;
    body: string;
  }
): Promise<SendFrameNotificationResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: appUrl,
      tokens: tokens,
    }),
  });

  const responseJson = await response.json();

  if (response.status === 200) {    
    return { state: "success" };
  } else {
    // Error response
    return { state: "error", error: responseJson };
  }
}

export const sendNotificationsToAllPlayers = async (c: Context, title: string, body: string) => {
  try {
    const notifDetails = await getNotifcationDetailsForAllPlayers(c);
    const urlToUse: string =
      notifDetails && notifDetails[0] ? notifDetails[0].notification_url : "";
    const notificationTokens = notifDetails
      ? notifDetails.map((n: any) => n.notification_token)
      : [];
    if (notificationTokens.length > 100) {
      const notifChunks = splitArrayIntoChunks(notificationTokens);
      for (const chunk of notifChunks) {
        //  Send notifications to all
        await bulkSendFrameNotification(c, {
          url: urlToUse,
          tokens: chunk,
          title: title,
          body: body,
        });
      }
    } else {
      await bulkSendFrameNotification(c, {
        url: urlToUse,
        tokens: notificationTokens,
        title: title,
        body: body,
      });
    }
  } catch (error) {
    console.log(error);
    throw error;
  }
};
