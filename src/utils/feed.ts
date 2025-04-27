import { createPublicClient, http, getContract, type Address } from "viem";
import { baseSepolia } from "viem/chains"
import { abi } from "./feed-abi";
const Parser = require("rss-parser");

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "fullContent"],
      ["dc:creator", "author"],
      ["content:encodedSnippet", "fullContentSnippet"],
    ],
  },
});

const CONTRACT_ADDRESS = "0xb8B66933f14c1087046d0b6Ff83Db5495eFD1454";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.ALCHEMY_URL),
});

const contract = getContract({
  address: CONTRACT_ADDRESS,
  abi: abi,
  client: publicClient,
});

// Function to standardize a parsed feed item
const standardizeFeedItem = (item: any, feedTitle = "") => {
  return {
    title: item.title || "",
    link: item.link || item.guid || "",
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    content: item.content || item.fullContent || item.description || "",
    contentSnippet: item.contentSnippet || item.fullContentSnippet || "",
    guid: item.guid || item.link || "",
    isoDate: item.isoDate || new Date(item.pubDate || "").toISOString(),
    author: item.author || item.creator || feedTitle,
    categories: item.categories || [],
  };
};

export const validateFeed = async (url: string) => {
  try {
    const feed = await parser.parseURL(url);

    if (feed && (feed.items || feed.entries)) {
      return {
        isValid: true,
        feedData: {
          title: feed.title,
          description: feed.description,
          link: feed.link,
          itemCount: feed.items?.length || 0,
        },
      };
    } else {
      return {
        isValid: false,
        error: "URL parsed but no feed items found",
      };
    }
  } catch (error) {
    console.log(error);
    return {
      isValid: false,
      error: "Error parsing feed",
    };
  }
};
const parseFeed = async (url: string) => {
  try {
    const feed = await parser.parseURL(url);
    const standardizedItems = feed.items.map((item: any) =>
      standardizeFeedItem(item, feed.title || "")
    );

    return {
      title: feed.title || "",
      description: feed.description || "",
      link: feed.link || url,
      items: standardizedItems,
    };
  } catch (error) {
    console.error(`Error parsing feed ${url}:`, error);
    throw error;
  }
};

export const fetchAllFeeds = async () => {
  try {
    console.log("Fetching feeds from contract...");
    //  @ts-expect-error
    const [fids, allFeedUrls] = await contract.read.getAllFeeds();
    console.log({fids});
    const feedsData = fids.map((fid: number, index: number) => ({
      fid: Number(fid),
      feedUrls: allFeedUrls[index],
    }));

    const feedsWithContent = await Promise.all(
      feedsData.map(async (feed: any) => {
        try {
          const parsedFeeds = await Promise.all(
            feed.feedUrls.map(async (url: string) => {
              try {
                console.log(`Parsing feed: ${url}`);
                return await parseFeed(url);
              } catch (err) {
                console.error(`Failed to parse ${url}:`, err);
                return null;
              }
            })
          );

          const validFeeds = parsedFeeds.filter((feed) => feed !== null);

          return {
            ...feed,
            feedContents: validFeeds,
          };
        } catch (err) {
          console.error(`Error processing feeds for FID ${feed.fid}:`, err);
          return {
            ...feed,
            feedContents: [],
          };
        }
      })
    );

    console.log("Feeds with content:", feedsWithContent);
    return feedsWithContent;
  } catch (error) {
    console.error("Error fetching all feeds:", error);
    throw error;
  }
};

export const getFeedDetails = async (url: string) => {
  const feedInfo = await parseFeed(url);
  return feedInfo;
};
