import { ethers, Log } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { loadCache, saveCache } from './cache';

dotenv.config();

const RPC_URL = process.env.RPC_URL!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const ABI_PATH = path.join(__dirname, '..', 'PostBoard.json');
const ABI = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));

interface IndexedEvent {
  name: string;
  args: Record<string, any>;
  blockNumber: number;
  txHash: string;
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

const CACHE_FILE = path.join(__dirname, '..', 'snapshots', 'events.json');
const cache = loadCache(CACHE_FILE);

// ============ Update this to include the events you care about ============
const EVENTS = ['PostCreated', 'PostLiked', 'CommentAdded', 'PostTipped'];

async function main() {
  console.log('📡 Starting event listener...');

  for (const eventName of EVENTS) {
    contract.on(eventName, async (...args) => {
      const event = args[args.length - 1] as Log;
      const parsed = contract.interface.parseLog(event);

      if (!parsed) return;

      const evt: IndexedEvent = {
        name: parsed.name,
        args: Object.fromEntries(Object.entries(parsed.args)),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
      };

      // Save event if not already cached
      const id = `${evt.name}_${evt.txHash}_${evt.blockNumber}`;
      if (!cache[id]) {
        cache[id] = evt;
        saveCache(CACHE_FILE, cache);
        console.log(`🧠 Cached event: ${evt.name} @ block ${evt.blockNumber}`);
      }
    });
  }
}

main().catch((err) => {
  console.error('❌ Listener crashed:', err);
  process.exit(1);
});
