import fs from "fs";

const DIR = "snapshots";
const FILE = `${DIR}/posts.json`;

export interface Snapshot {
  lastBlock: number;
  posts: Record<string, any>;
}

// ensure directory
fs.mkdirSync(DIR, { recursive: true });

export function load(): Snapshot {
  if (fs.existsSync(FILE)) {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  }
  return { lastBlock: 0, posts: {} };
}

export function save(snapshot: Snapshot): void {
  fs.writeFileSync(FILE, JSON.stringify(snapshot, null, 2));
  console.log("💾  Snapshot saved.");
}
