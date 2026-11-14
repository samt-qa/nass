// Reports minified + gzipped size of the ESM bundle (PRD §6.4: < 8 KB gzip).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const buf = readFileSync(new URL("../dist/index.js", import.meta.url));
const gz = gzipSync(buf, { level: 9 }).length;
console.log(`dist/index.js: ${(buf.length / 1024).toFixed(1)} KB min, ${(gz / 1024).toFixed(2)} KB gzip`);
if (gz > 8 * 1024) { console.error("Bundle exceeds 8 KB gzip"); process.exit(1); }
