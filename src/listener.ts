import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { loadCache, saveCache } from "./cache";

const ABI_PATH = path.join(__dirname, "..", "abis", "PostBoard.json");
const ABI = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(
  process.env.PROXY_ADDRESS!,
  ABI,
  provider
);

// the first block containing your proxy’s deploy tx
const START_BLOCK = 7455;

// ─────────────────────────────────────────────────────────────

interface IndexedEvent {
  name: string;
  args: Record<string, any>;
  blockNumber: number;
  txHash: string;
}

const SNAPSHOT_FILE = path.join(__dirname, "..", "snapshots", "posts.json");
const cache: Record<string, IndexedEvent> = loadCache();

// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("📡  IRYS Testnet event listener started…");

  const from = cache.__lastBlock ?? START_BLOCK;
  const to   = await provider.getBlockNumber();

  console.log(`🔎  Syncing ${from} → ${to}`);

  const logs = await contract.queryFilter("*", from, to);
  const indexed: IndexedEvent[] = [];

  for (const log of logs) {
    if (cache[log.transactionHash]) continue; // dedupe

    const parsed = contract.interface.parseLog(log);
    if (!parsed) {
      console.warn("⚠️  Un‑parsable log, skipping");
      continue;
    }

    const { name, args } = parsed;
    console.log(`📌  [${log.blockNumber}] ${name}`);

    const evt: IndexedEvent = {
      name,
      args: Object.fromEntries(
        parsed.eventFragment.inputs.map((inp, i) => [inp.name, args[i]])
      ),
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
    };

    cache[log.transactionHash] = evt;
    indexed.push(evt);
  }

  // write snapshot
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(indexed, null, 2));
  console.log(`💾  Snapshot saved → snapshots/posts.json`);

  // update last processed block & cache file
  cache.__lastBlock = to;
  saveCache();
  console.log("✅  Cache updated.");
}

main().catch((e) => {
  console.error("🚨  Listener failed:", e);
  process.exit(1);
});
