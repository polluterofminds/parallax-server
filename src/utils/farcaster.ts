import { Context } from "hono";

export const getUserByVerifiedAddress = async (c: Context, address: string) => {
  try {
    const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}&address_types=verified_address`;
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "false",
        "x-api-key": c.env.NEYNAR_API_KEY,
      },
    };

    const userRes = await fetch(url, options);
    return await userRes.json();
  } catch (error) {
    console.log("Neynar error: ", error);
    throw error;
  }
};
