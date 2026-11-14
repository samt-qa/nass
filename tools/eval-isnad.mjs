// Measures splitIsnad (Dart) against spec/vectors/isnad.json.
// Usage: node tools/eval-isnad.mjs [dev|test] [--show]   (default: dev)
// "test" is the held-out v0.2 test set (300-499): run it once, after the design is frozen.
// Results are also broken down by sample group (see tools/gen-isnad-vectors.mjs).
import { dart, readVectors } from "./lib.mjs";

const split = process.argv[2] === "test" ? "test" : "dev";
const show = process.argv.includes("--show");
const cases = readVectors("isnad").cases.filter((c) => c.split === split);
const out = dart(cases.map((c) => ({ op: "splitIsnad", text: c.input })));
const group = (id) => {
  const n = Number(id.slice(-3));
  return n < 100 ? "v0.1 dev" : n < 200 ? "v0.1 test" : n < 300 ? "v0.2 dev" : "v0.2 test";
};
const byWork = {};
const byGroup = {};
let ok = 0;
cases.forEach((c, k) => {
  const r = out[k];
  const start = r.isnad === "" ? -1 : c.input.length - r.matn.length;
  const good = c.acceptMatnStart.includes(start);
  const w = (byWork[c.source.work] ??= [0, 0]);
  const g = (byGroup[group(c.id)] ??= [0, 0]);
  w[1]++;
  g[1]++;
  if (good) { ok++; w[0]++; g[0]++; }
  else if (show) {
    const exp = c.input.slice(c.acceptMatnStart[0]).split(" ").slice(0, 4).join(" ");
    const got = start < 0 ? "(no split)" : c.input.slice(start).split(" ").slice(0, 4).join(" ");
    console.log(`${c.id}  expected «${exp}»  got «${got}»  conf=${r.confidence}`);
  }
});
console.log(`${split}: ${ok}/${cases.length} = ${((100 * ok) / cases.length).toFixed(1)}%`);
for (const [w, [a, b]] of Object.entries(byGroup)) console.log(`  ${w}: ${a}/${b}`);
for (const [w, [a, b]] of Object.entries(byWork)) console.log(`  ${w}: ${a}/${b}`);
