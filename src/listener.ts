import "dotenv/config";
import { ethers } from "ethers";
import { load, save } from "./cache.js";
import abiRaw from "../PostBoard.json" assert { type: "json" };

const { RPC_URL, CONTRACT_ADDRESS, START_BLOCK } = process.env;
if (!RPC_URL || !CONTRACT_ADDRESS || !START_BLOCK) {
  throw new Error("Missing env vars. Check .env");
}

const iface = new ethers.Interface(abiRaw as any);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const snapshot = load();

async function sync() {
  const from = snapshot.lastBlock || Number(START_BLOCK);
  const to = await provider.getBlockNumber();
  console.log(`🔎  Querying logs ${from} → ${to}`);

  const logs = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock: from,
    toBlock: to
  });

  logs.forEach((log) => {
    try {
      const parsed = iface.parseLog(log);
      const name = parsed.name;

      if (name === "PostCreated") {
        const [id, author, irysTxIds, caption] = parsed.args;
        snapshot.posts[id.toString()] = {
          id: id.toString(),
          author,
          caption,
          irysTxIds,
          timestamp: log.blockNumber,
          likes: 0,
          totalTips: "0",
          deleted: false,
          comments: []
        };
        console.log(`📝  PostCreated #${id}`);
      }

      if (name === "CommentAdded") {
        const [id, commenter, text] = parsed.args;
        const post = snapshot.posts[id.toString()];
        if (post) {
          post.comments.push({
            commenter,
            text,
            timestamp: log.blockNumber
          });
          console.log(`💬  Comment on #${id}`);
        }
      }

      if (name === "PostLiked") {
        const [id] = parsed.args;
        const post = snapshot.posts[id.toString()];
        if (post) {
          post.likes += 1;
          console.log(`❤️  Like on #${id}`);
        }
      }

      if (name === "PostTipped") {
        const [id, , amount] = parsed.args;
        const post = snapshot.posts[id.toString()];
        if (post) {
          post.totalTips = (
            BigInt(post.totalTips) + amount
          ).toString();
          console.log(`💸  Tip on #${id}`);
        }
      }

      if (name === "PostDeleted") {
        const [id] = parsed.args;
        const post = snapshot.posts[id.toString()];
        if (post) {
          post.deleted = true;
          console.log(`❌  PostDeleted #${id}`);
        }
      }
    } catch (e) {
      console.error("Failed to parse log", e);
    }
  });

  snapshot.lastBlock = to;
  save(snapshot);
}

sync().catch(console.error);
