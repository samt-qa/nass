// Fails when line coverage in an lcov file is below a minimum.
// Usage: node tools/coverage-check.mjs <lcov.info> <minPercent>
import { readFileSync } from "node:fs";

const [file, min] = process.argv.slice(2);
let found = 0, hit = 0;
for (const rec of readFileSync(file, "utf8").split("end_of_record")) {
  found += Number(rec.match(/LF:(\d+)/)?.[1] ?? 0);
  hit += Number(rec.match(/LH:(\d+)/)?.[1] ?? 0);
}
const pct = found ? (100 * hit) / found : 0;
console.log(`line coverage: ${pct.toFixed(1)}% (${hit}/${found}), minimum ${min}%`);
if (pct < Number(min)) process.exit(1);
