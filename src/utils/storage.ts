import { Context } from "hono";
import { PinataSDK } from "pinata";

export const getPinata = (c: Context) => {
  return new PinataSDK({
    pinataJwt: c.env.PINATA_JWT,
    pinataGateway: c.env.PINATA_GATEWAY_URL,
  });
};

export const MEMORIES_GROUP_ID = "0195d492-0622-71ef-adb7-47f17092a0ce";
export const CHARACTER_DETAILS_GROUP_ID =
  "5d6d809c-405b-4530-a345-30d9f22d6b5e";
