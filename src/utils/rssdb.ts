import { createClient } from "@supabase/supabase-js";
import { FrameNotificationDetails } from "./types";

const supabaseUrl: string = process.env.SUPABASE_RSS_URL!;
const supabaseKey: string = process.env.SUPABASE_RSS_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const getRSSNotifcationDetailsForAllPlayers = async () => {
  let { data: notification_details, error } = await supabase
    .from("notification_details")
    .select("*");

  if (error) {
    console.log(`Supabase error: ${error}`);
    throw error;
  }

  return notification_details;
};

export const setRSSUserNotificationDetails = async (
  fid: number,
  details: FrameNotificationDetails
) => {
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

export const deleteRSSUserNotificationDetails = async (
  fid: number
) => {

  const { error } = await supabase
    .from("notification_details")
    .delete()
    .eq("fid", fid);

  if (error) {
    console.log(`Supabase error: `, error);
    throw error;
  }
};
