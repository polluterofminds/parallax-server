export type Bindings = {
  PINATA_JWT: string;
  PINATA_GATEWAY_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
  WEBSOCKET_RPC_URL: string;
  RPC_URL: string;
  CONTRACT_ADDRESS: string;
  NEYNAR_API_KEY: string;
  CLAUDE_API_KEY: string;
  PRIVATE_KEY: string;
  GEMINI_API_KEY: string;
  ALCHEMY_URL: string;
};

export type FrameNotificationDetails = {
  url: string;
  token: string;
};

export type CrimeDoc = {
  victims: string;
  criminal: string;
  motive: string;
};

export type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export type FeedData = {
  fid: number;
  feedUrls: string[];
};

export type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  guid: string;
  isoDate: string;
  author: string;
  categories: string[];
};

export type FeedContent = {
  title: string;
  description: string;
  link: string;
  items: FeedItem[];
};

export type Feed = {
  fid: number;
  feedUrls: string[];
  feedContents: FeedContent[];
};

export type FeedRecord = {
  fid: number;
  feed_url: string;
  title?: string;
  description?: string;
  site_url?: string;
};
