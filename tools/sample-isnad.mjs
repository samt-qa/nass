#!/usr/bin/env node
// Appends the next random draw to tools/corpus/isnad-sample.json. Earlier draws are never
// touched or redrawn; each round is keyed by the sample size it starts from.
//   0-199    v0.1 sample (one-off draw, before this script)
//   200-499  v0.2 round: 50 per book  (200-299 dev, 300-499 test in v0.2)
//   500-799  v0.3 round: 50 per book  (held-out test in v0.3)
// Each new hadith is drawn from the six books, interleaved by book, none already in the sample.
// Usage: node tools/sample-isnad.mjs   (needs tools/corpus, see docs/corpus.md)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, BOOKS, readHadith, rng } from "./lib.mjs";

const ROUNDS = { 200: { seed: 20261115, perBook: 50 }, 500: { seed: 20261116, perBook: 50 } };
const PATH = join(root, "tools", "corpus", "isnad-sample.json");
const sample = JSON.parse(readFileSync(PATH, "utf8"));
const round = ROUNDS[sample.length];
if (!round) throw new Error(`no round defined for a sample of ${sample.length}`);

const r = rng(round.seed);
const taken = new Set(sample.map((h) => `${h.file}#${h.n}`));
const perBook = BOOKS.map(({ file, work }) => {
  const rows = readHadith(file).filter((h) => h.text.trim().split(/\s+/).length >= 12 && !taken.has(`${file}#${h.n}`));
  const picked = [];
  while (picked.length < round.perBook) {
    const h = rows[Math.floor(r() * rows.length)];
    const key = `${file}#${h.n}`;
    if (taken.has(key)) continue;
    taken.add(key);
    picked.push({ work, file, n: h.n, text: h.text });
  }
  return picked;
});
for (let i = 0; i < round.perBook; i++) for (const b of perBook) sample.push(b[i]);
writeFileSync(PATH, JSON.stringify(sample, null, 1) + "\n");
console.log(`isnad-sample.json: ${sample.length} hadiths`);
