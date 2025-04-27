export const abi = [
    {
      inputs: [],
      stateMutability: "nonpayable",
      type: "constructor",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "uint256",
          name: "fid",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "string",
          name: "feedUrl",
          type: "string",
        },
      ],
      name: "FeedAdded",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "uint256",
          name: "fid",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "string",
          name: "feedUrl",
          type: "string",
        },
      ],
      name: "FeedRemoved",
      type: "event",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "fid",
          type: "uint256",
        },
        {
          internalType: "string",
          name: "feedUrl",
          type: "string",
        },
      ],
      name: "addFeed",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [],
      name: "getAllFeeds",
      outputs: [
        {
          internalType: "uint256[]",
          name: "",
          type: "uint256[]",
        },
        {
          internalType: "string[][]",
          name: "",
          type: "string[][]",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "getAllFids",
      outputs: [
        {
          internalType: "uint256[]",
          name: "",
          type: "uint256[]",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "fid",
          type: "uint256",
        },
      ],
      name: "getFeedsByFid",
      outputs: [
        {
          internalType: "string[]",
          name: "",
          type: "string[]",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "owner",
      outputs: [
        {
          internalType: "address",
          name: "",
          type: "address",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "fid",
          type: "uint256",
        },
        {
          internalType: "string",
          name: "feedUrl",
          type: "string",
        },
      ],
      name: "removeFeed",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];
  