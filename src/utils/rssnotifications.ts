import { getRSSNotifcationDetailsForAllPlayers } from "./rssdb";
import { SendFrameNotificationResult } from "./types";

const appUrl = "";

function splitArrayIntoChunks(tokenArray: string[], maxChunkSize = 100) {
  const result = [];

  for (let i = 0; i < tokenArray.length; i += maxChunkSize) {
    const chunk = tokenArray.slice(i, i + maxChunkSize);
    result.push(chunk);
  }

  return result;
}

export async function bulkSendFrameNotification({
  url,
  tokens,
  title,
  body,
}: {
  url: string;
  tokens: string[];
  title: string;
  body: string;
}): Promise<SendFrameNotificationResult> {
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
    return { state: "error", error: responseJson };
  }
}

export const sendNotifications = async (title: string, body: string) => {
  try {
    const notifDetails = await getRSSNotifcationDetailsForAllPlayers();
    const urlToUse: string =
      notifDetails && notifDetails[0] ? notifDetails[0].notification_url : "";
    const notificationTokens = notifDetails
      ? notifDetails.map((n: any) => n.notification_token)
      : [];
    if (notificationTokens.length > 100) {
      const notifChunks = splitArrayIntoChunks(notificationTokens);
      for (const chunk of notifChunks) {
        //  Send notifications to all
        await bulkSendFrameNotification({
          url: urlToUse,
          tokens: chunk,
          title: title,
          body: body,
        });
      }
    } else {
      await bulkSendFrameNotification({
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
