import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(__dirname, "..", "snapshots", "cache.json");

let memoryCache: Record<string, any> = {};

export const loadCache = () => {
  if (fs.existsSync(CACHE_FILE)) {
    memoryCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  }
  return memoryCache;
};

export const saveCache = () => {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));
};

export const getCache = () => memoryCache;
