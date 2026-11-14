// Builds spec/vectors/isnad.json from the hand labels in tools/isnad-labels.mjs.
// Usage: node tools/gen-isnad-vectors.mjs [--show]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root, DATASET, readVectors, writeVectors, dart } from "./lib.mjs";
import { LABELS } from "./isnad-labels.mjs";

// Keep each case's review status across regenerations. A case is "approved" only while its
// label (input and accepted boundaries) is unchanged; any change sends it back to "pending".
const previous = new Map();
try { for (const c of readVectors("isnad").cases) previous.set(c.id, c); } catch {}
const reviewOf = (id, input, accept) => {
  const p = previous.get(id);
  return p && p.review === "approved" && p.input === input && JSON.stringify(p.acceptMatnStart) === JSON.stringify(accept)
    ? "approved" : "pending";
};

const sample = JSON.parse(readFileSync(join(root, "tools", "corpus", "isnad-sample.json"), "utf8"));
const show = process.argv.includes("--show");
const TAIL_WORDS = 25; // words of matn kept after the boundary (inputs are excerpts)

/** Offset (UTF-16) of the first word-boundary occurrence of `anchor` in `text`, or -1. */
function find(text, anchor) {
  let from = 0;
  for (;;) {
    const i = text.indexOf(anchor, from);
    if (i < 0) return -1;
    const before = i === 0 || text[i - 1] === " ";
    const after = i + anchor.length === text.length || text[i + anchor.length] === " ";
    if (before && after) return i;
    from = i + 1;
  }
}

// Indices (tools/corpus/isnad-sample.json):
//   0-99    v0.1 dev     -> split "dev"
//   100-199 v0.1 test    -> split "dev" since 0.2 (its errors guided the 0.2 changes); ids keep "test"
//   200-299 v0.2 dev     -> split "dev"
//   300-499 v0.2 test    -> split "test" (held out)
const idOf = (idx) => `isnad-${idx < 100 || (idx >= 200 && idx < 300) ? "dev" : "test"}-${String(idx).padStart(3, "0")}`;
const splitOf = (idx) => (idx >= 300 ? "test" : "dev");

const cases = [];
const errors = [];
for (const [idx, primary, ...alts] of LABELS) {
  const h = sample[idx];
  const text = h.text.replace(/\s+/g, " ").trim();
  const start = find(text, primary);
  if (start < 0) { errors.push(`${idx}: anchor not found: ${primary}`); continue; }
  // Excerpt: everything up to the furthest accepted boundary plus TAIL_WORDS words of matn.
  const accept = [start];
  for (const a of alts) {
    const s = find(text, a);
    if (s < 0) { errors.push(`${idx}: alt not found: ${a}`); continue; }
    accept.push(s);
  }
  const last = Math.max(...accept);
  const input = text.slice(0, last) + text.slice(last).split(" ").slice(0, TAIL_WORDS).join(" ");
  const tail = text.slice(start).split(" ");
  const isnad = input.slice(0, start).trim();
  if (show) console.log(`${idx}\t…${isnad.split(" ").slice(-6).join(" ")} ║ ${tail.slice(0, 5).join(" ")}`);
  cases.push({
    id: idOf(idx),
    note: `Isnad/matn boundary in ${h.work} #${h.n} (excerpt).`,
    split: splitOf(idx),
    review: reviewOf(idOf(idx), input, accept),
    source: { work: h.work, ref: String(h.n), dataset: DATASET, verified: true, excerpt: true },
    input,
    expected: { isnad, matn: input.slice(start) },
    acceptMatnStart: accept,
  });
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
// Output of the reference implementation (Dart). Every package must reproduce it exactly;
// it is NOT the ground truth (that is acceptMatnStart).
const ref = dart(cases.map((c) => ({ op: "splitIsnad", text: c.input })));
cases.forEach((c, k) => {
  const r = ref[k];
  c.reference = {
    matnStart: r.isnad === "" ? -1 : c.input.length - r.matn.length,
    confidence: r.confidence,
    narrators: r.narrators,
  };
});
writeVectors("isnad", {
  file: "isnad",
  specVersion: "0.2",
  status: "draft",
  description: "Isnad/matn boundaries hand-labelled per SPEC §8.1. 'dev' cases guided the design (since 0.2 this includes the v0.1 test cases, ids isnad-test-100..199); 'test' cases (300-499) are held out. A split is correct when the matn starts at any offset in acceptMatnStart (UTF-16). 'reference' is the output of the reference implementation, which every package must reproduce exactly (matnStart -1 = no split).",
  cases,
});
console.log(`isnad.json: ${cases.length} cases`);
