import fs from 'fs';

export function loadCache(filepath: string): Record<string, any> {
  if (fs.existsSync(filepath)) {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  }
  return {};
}

export function saveCache(filepath: string, data: Record<string, any>): void {
  fs.mkdirSync(require('path').dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}
