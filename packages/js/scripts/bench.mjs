// Benchmark: normalize 1 Mi UTF-16 units (~2 MB UTF-8) of real, fully vocalized
// hadith text: Sahih al-Bukhari in file order, built by tools/bench-text.mjs
// (PRD §6.4: < 50 ms). Run from packages/js after `npm run build`: node scripts/bench.mjs
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalize } from "../dist/index.js";
const file = fileURLToPath(new URL("../../../tools/corpus/bench-bukhari-1m.txt", import.meta.url));
if (!existsSync(file)) {
  console.error(`missing ${file}\nrun: node tools/fetch-corpus.mjs && node tools/bench-text.mjs`);
  process.exit(1);
}
const text = readFileSync(file, "utf8");
for (const level of ["clean", "search", "loose"]) {
  for (let i = 0; i < 5; i++) normalize(text, { level });
  const runs = 10, t0 = performance.now();
  for (let i = 0; i < runs; i++) normalize(text, { level });
  console.log(`${level}: ${((performance.now() - t0) / runs).toFixed(1)} ms per ${Math.round(text.length / 1024)} K units`);
}
