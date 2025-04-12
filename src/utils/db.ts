import { createClient } from "@supabase/supabase-js";
import { Context } from "hono";
import { Bindings, FrameNotificationDetails } from "./types";

export const getSupabase = (c: Context) => {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
};

export const getUserNotificationDetails = async (c: Context, fid: number) => {
  const supabase = getSupabase(c);
  let { data: frame_details, error } = await supabase
    .from("notification_details")
    .select("*")
    .eq("fid", fid);

  if (error) {
    console.log(`Supabase error: `, error);
    throw error;
  }

  return frame_details && frame_details[0] ? frame_details[0] : null;
};

export const setUserNotificationDetails = async (
  c: Context,
  fid: number,
  details: FrameNotificationDetails
) => {
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from("notification_details")
    .insert([
      {
        notification_url: details.url,
        notification_token: details.token,
        frame_added: true,
        fid: fid,
      },
    ])
    .select();

  if (error) {
    console.log(`Supabase error: `, error);
    throw error;
  }
};

export const deleteUserNotificationDetails = async (
  c: Context,
  fid: number
) => {
  const supabase = getSupabase(c);

  const { error } = await supabase
    .from("notification_details")
    .delete()
    .eq("fid", fid);

  if (error) {
    console.log(`Supabase error: `, error);
    throw error;
  }
};

export const getNotifcationDetailsForAllPlayers = async (c: Context) => {
    const supabase = getSupabase(c);
  let { data: notification_details, error } = await supabase
    .from("notification_details")
    .select("*")

    if(error) {
        console.log(`Supabase error: ${error}`);
        throw error;
    }

    return notification_details;
}

export const isCaseOver = async (env: Bindings) => {
    const c: any = {
        env
    }

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
        return true
      } else {
        return false;
      }
    } else {
      throw new Error("No episode found");
    }
}
