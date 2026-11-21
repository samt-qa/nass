// Builds the benchmark input shared by all four packages: the vocalized Sahih
// al-Bukhari hadith texts (Open-Hadith-Data, mushakkala) in file order, joined
// by "\n", truncated to exactly 1 Mi (1,048,576) UTF-16 code units. The last
// hadith is cut mid-text; if the cut would split a surrogate pair it moves one
// unit earlier. Writes tools/corpus/bench-bukhari-1m.txt (UTF-8, no BOM).
// Needs the corpus: node tools/fetch-corpus.mjs
// Usage: node tools/bench-text.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, readHadith, VOCALIZED } from "./lib.mjs";

const LIMIT = 1 << 20;
const parts = [];
let units = 0;
for (const { text } of readHadith(VOCALIZED.file)) {
  if (units >= LIMIT) break;
  parts.push(text);
  units += text.length + (parts.length > 1 ? 1 : 0);
}
if (units < LIMIT) throw new Error(`corpus too small: ${units} UTF-16 units`);
let text = parts.join("\n");
let end = LIMIT;
const c = text.charCodeAt(end - 1);
if (c >= 0xd800 && c <= 0xdbff) end--; // don't split a surrogate pair
text = text.slice(0, end);

const out = join(root, "tools", "corpus", "bench-bukhari-1m.txt");
writeFileSync(out, text, "utf8");
console.log(`wrote ${out}`);
console.log(`${text.length} UTF-16 units, ${Buffer.byteLength(text, "utf8")} bytes (UTF-8), ${parts.length} hadiths (last one truncated)`);
