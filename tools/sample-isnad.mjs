#!/usr/bin/env node
// Appends a new random draw to tools/corpus/isnad-sample.json (v0.2 sample).
// Indices 0-199 are the v0.1 sample and are never touched or redrawn.
// The new draw: 300 hadiths, 50 per book, interleaved by book, none already in the sample.
//   200-299  dev2   (used while improving splitIsnad)
//   300-499  test2  (held out, measured once)
// Usage: node tools/sample-isnad.mjs   (needs tools/corpus, see docs/corpus.md)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, BOOKS, readHadith, rng } from "./lib.mjs";

const PATH = join(root, "tools", "corpus", "isnad-sample.json");
const PER_BOOK = 50;
const sample = JSON.parse(readFileSync(PATH, "utf8"));
if (sample.length !== 200) throw new Error(`expected the 200-case v0.1 sample, found ${sample.length}`);

const r = rng(20261115);
const taken = new Set(sample.map((h) => `${h.file}#${h.n}`));
const perBook = BOOKS.map(({ file, work }) => {
  const rows = readHadith(file).filter((h) => h.text.trim().split(/\s+/).length >= 12 && !taken.has(`${file}#${h.n}`));
  const picked = [];
  while (picked.length < PER_BOOK) {
    const h = rows[Math.floor(r() * rows.length)];
    const key = `${file}#${h.n}`;
    if (taken.has(key)) continue;
    taken.add(key);
    picked.push({ work, file, n: h.n, text: h.text });
  }
  return picked;
});
for (let i = 0; i < PER_BOOK; i++) for (const b of perBook) sample.push(b[i]);
writeFileSync(PATH, JSON.stringify(sample, null, 1) +"\n");
console.log(`isnad-sample.json: ${sample.length} hadiths`);
