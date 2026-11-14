// Measures splitIsnad (Dart) against spec/vectors/isnad.json.
// Usage: node tools/eval-isnad.mjs [dev|test] [--show]   (default: dev)
import { dart, readVectors } from "./lib.mjs";

const split = process.argv[2] === "test" ? "test" : "dev";
const show = process.argv.includes("--show");
const cases = readVectors("isnad").cases.filter((c) => c.split === split);
const out = dart(cases.map((c) => ({ op: "splitIsnad", text: c.input })));
const byWork = {};
let ok = 0;
cases.forEach((c, k) => {
  const r = out[k];
  const start = r.isnad === "" ? -1 : c.input.length - r.matn.length;
  const good = c.acceptMatnStart.includes(start);
  const w = (byWork[c.source.work] ??= [0, 0]);
  w[1]++;
  if (good) { ok++; w[0]++; }
  else if (show) {
    const exp = c.input.slice(c.acceptMatnStart[0]).split(" ").slice(0, 4).join(" ");
    const got = start < 0 ? "(no split)" : c.input.slice(start).split(" ").slice(0, 4).join(" ");
    console.log(`${c.id}  expected «${exp}»  got «${got}»  conf=${r.confidence}`);
  }
});
console.log(`${split}: ${ok}/${cases.length} = ${((100 * ok) / cases.length).toFixed(1)}%`);
for (const [w, [a, b]] of Object.entries(byWork)) console.log(`  ${w}: ${a}/${b}`);
