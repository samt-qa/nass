// Reports minified + gzipped size of each ESM entry together with the chunks it
// imports. The core entry must stay under 8 KB gzip (PRD §6.4); "@samt/nass/isnad"
// is reported separately.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url);
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(new URL(file, dist), "utf8");
  for (const m of src.matchAll(/from\s*"\.\/([^"]+)"/g)) closure(m[1], seen);
  return seen;
}
let failed = false;
for (const [entry, limit] of [["index.js", 8], ["isnad.js", null]]) {
  const files = [...closure(entry)];
  const buf = Buffer.concat(files.map((f) => readFileSync(new URL(f, dist))));
  const gz = gzipSync(buf, { level: 9 }).length / 1024;
  console.log(`${entry} (+${files.length - 1} chunk): ${(buf.length / 1024).toFixed(1)} KB min, ${gz.toFixed(2)} KB gzip`);
  if (limit && gz > limit) { console.error(`${entry} exceeds ${limit} KB gzip`); failed = true; }
}
if (failed) process.exit(1);
