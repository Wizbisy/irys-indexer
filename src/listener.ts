import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { loadCache, saveCache, getCache } from "./cache";
import dotenv from "dotenv";
dotenv.config();

const ABI_PATH = path.join(__dirname, "..", "abis", "PostBoard.json");
const ABI = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

if (!process.env.PROXY_ADDRESS) throw new Error("Missing PROXY_ADDRESS in .env");

const contract = new ethers.Contract(process.env.PROXY_ADDRESS, ABI, provider);

// Start block of proxy deployment
const START_BLOCK = 7455;

type IndexedEvent = {
  name: string;
  args: Record<string, any>;
  blockNumber: number;
  txHash: string;
};

const SNAPSHOT_FILE = path.join(__dirname, "..", "snapshots", "posts.json");

async function main() {
  console.log("📡 Starting IRYS Testnet Event Listener");

  const cache = loadCache();
  const latest = await provider.getBlockNumber();
  console.log(`🔎 Querying from block ${START_BLOCK} to ${latest}...`);

  const logs = await contract.queryFilter("*", START_BLOCK, latest);
  console.log(`🧠 Found ${logs.length} logs`);

  const indexed: IndexedEvent[] = [];

  for (const log of logs) {
    if (cache[log.transactionHash]) continue;

    try {
      const parsed = contract.interface.parseLog(log);
      const event: IndexedEvent = {
        name: parsed.name,
        args: Object.fromEntries(parsed.args.entries()),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };

      console.log(`📌 [${event.blockNumber}] ${event.name}`);
      indexed.push(event);

      cache[log.transactionHash] = event;
    } catch (err) {
      console.warn("❗ Failed to parse log:", err);
    }
  }

  // Write snapshot JSON
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(indexed, null, 2));
  console.log(`✅ Snapshot written to snapshots/posts.json`);

  saveCache();
  console.log("💾 Cache updated");
}

main().catch((err) => {
  console.error("🚨 Listener failed:", err);
  process.exit(1);
});
