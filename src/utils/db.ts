import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { Context } from "hono";
import { FrameNotificationDetails } from "@farcaster/frame-sdk";

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
