import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { loadCache, saveCache } from "./cache";

// ---------- constants ----------
const ABI_PATH        = path.join(__dirname, "..", "abis", "PostBoard.json");
const ABI             = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
const RPC_URL         = process.env.RPC_URL!;
const PROXY_ADDRESS   = process.env.PROXY_ADDRESS!;
const START_BLOCK     = 7455;   // first block to index
const SNAPSHOT_FILE   = path.join(__dirname, "..", "snapshots", "posts.json");

// ---------- provider & contract ----------
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(PROXY_ADDRESS, ABI, provider);

// ---------- in‑memory cache structure ----------
interface IndexedEvent {
  name: string;
  args: Record<string, any>;
  blockNumber: number;
  txHash: string;
}
type Cache = { __lastBlock?: number } & Record<string, IndexedEvent>;
const cache: Cache = loadCache() as Cache;

// ---------- main sync ----------
async function main() {
  console.log("📡  IRYS Testnet listener running…");

  const from = cache.__lastBlock ?? START_BLOCK;
  const to   = await provider.getBlockNumber();
  console.log(`🔎  Scanning blocks  ${from} → ${to}`);

  const logs = await contract.queryFilter("*", from, to);
  const indexed: IndexedEvent[] = [];

  for (const log of logs) {
    if (cache[log.transactionHash]) continue;  // skip duplicates

    const parsed = contract.interface.parseLog(log);
    if (!parsed) continue; // safety

    const evt: IndexedEvent = {
      name:        parsed.name,
      args:        parsed.args.toObject?.() ?? Object.fromEntries(parsed.args.entries()),
      blockNumber: log.blockNumber,
      txHash:      log.transactionHash,
    };

    cache[log.transactionHash] = evt;
    indexed.push(evt);
    console.log(`📌  [${evt.blockNumber}] ${evt.name}`);
  }

  // write snapshot array
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(indexed, null, 2));
  console.log("💾  Snapshot saved → snapshots/posts.json");

  // persist cache
  cache.__lastBlock = to;
  saveCache(cache);
  console.log("✅  Cache updated.");
}

main().catch((err) => {
  console.error("🚨  Listener error:", err);
  process.exit(1);
});
