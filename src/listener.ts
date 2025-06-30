import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs/promises"; // Use promises for async file operations
import path from "path";

// Define types for better type safety
interface IndexedEvent {
  name: string;
  args: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
}

interface Cache {
  __lastBlock?: number;
  [txHash: string]: IndexedEvent | number | undefined;
}

// Cache file path
const CACHE_FILE = path.join(__dirname, "..", "snapshots", "cache.json");
const SNAPSHOT_FILE = path.join(__dirname, "..", "snapshots", "posts.json");
const ABI_PATH = path.join(__dirname, "..", "abis", "PostBoard.json");

// Load ABI
let ABI: any;
try {
  ABI = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
} catch (error) {
  console.error("🚨 Failed to load ABI:", error);
  process.exit(1);
}

// Validate environment variables
if (!process.env.RPC_URL || !process.env.PROXY_ADDRESS) {
  console.error("🚨 Missing required environment variables: RPC_URL or PROXY_ADDRESS");
  process.exit(1);
}

// Initialize provider and contract
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(process.env.PROXY_ADDRESS, ABI, provider);

// The first block containing your proxy’s deploy tx
const START_BLOCK = 7455;
const MAX_BLOCK_RANGE = 1000; // Prevent RPC overload

// Cache management
async function loadCache(): Promise<Cache> {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(data) as Cache;
  } catch (error) {
    console.warn("⚠️ Cache file not found or invalid, starting fresh");
    return {};
  }
}

async function saveCache(cache: Cache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error("🚨 Failed to save cache:", error);
    throw error;
  }
}

async function main() {
  console.log("📡 IRYS Testnet event listener started…");

  // Load cache
  const cache: Cache = await loadCache();
  const latestBlock = await provider.getBlockNumber();
  let fromBlock = cache.__lastBlock ?? START_BLOCK;

  // Ensure fromBlock is valid
  if (fromBlock < START_BLOCK) {
    console.warn(`⚠️ Invalid cache.__lastBlock (${fromBlock}), resetting to START_BLOCK`);
    fromBlock = START_BLOCK;
  }

  if (fromBlock > latestBlock) {
    console.log("✅ No new blocks to process.");
    return;
  }

  console.log(`🔎 Syncing ${fromBlock} → ${latestBlock}`);

  const indexed: IndexedEvent[] = [];

  // Process blocks in chunks to avoid RPC limits
  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, latestBlock);

    try {
      const logs = await contract.queryFilter("*", fromBlock, toBlock);
      for (const log of logs) {
        if (cache[log.transactionHash]) continue; // Dedupe

        const parsed = contract.interface.parseLog(log);
        if (!parsed) {
          console.warn(`⚠️ Un-parsable log at tx ${log.transactionHash}, skipping`);
          continue;
        }

        const { name, args } = parsed;
        console.log(`📌 [${log.blockNumber}] ${name}`);

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
    } catch (error) {
      console.error(`🚨 Error fetching logs for blocks ${fromBlock}-${toBlock}:`, error);
      throw error;
    }

    fromBlock = toBlock + 1;
  }

  // Write snapshot
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(indexed, null, 2));
    console.log(`💾 Snapshot saved → ${SNAPSHOT_FILE}`);
  } catch (error) {
    console.error("🚨 Failed to save snapshot:", error);
    throw error;
  }

  // Update and save cache
  cache.__lastBlock = latestBlock;
  await saveCache(cache);
  console.log("✅ Cache updated.");
}

main().catch((error) => {
  console.error("🚨 Listener failed:", error);
  process.exit(1);
});
