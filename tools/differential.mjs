#!/usr/bin/env node
// Differential test: the Dart reference vs the independent oracle, over a
// sample of six hadith books (+ vocalized Bukhari) and 20k random strings.
// Usage: node tools/differential.mjs   (needs tools/corpus, see docs/corpus.md)
import { dart, readHadith, BOOKS, VOCALIZED, rng } from "./lib.mjs";
import { normalize, nameKey } from "./oracle.mjs";

const texts = [];
for (const b of [...BOOKS, VOCALIZED]) {
  const rows = readHadith(b.file);
  for (let i = 0; i < rows.length; i += 7) texts.push(rows[i].text);
}
const r = rng(7);
const pool = [..."بسماأإآٱىيةهؤئءکیھ", " ", ..."َّٰۥۚٔـﷲﻻﷺ﷽ﷻ﵁ﻣﹰ،.,٫۝%٪١٣3‍‌‏﻿👨Az",
  " الله ", " تعالى ", " رضي الله عنه ", " عبد ", " أبي ", " ذا "];
for (let i = 0; i < 20000; i++) {
  let s = "";
  const n = Math.floor(r() * 12);
  for (let k = 0; k < n; k++) s += pool[Math.floor(r() * pool.length)];
  texts.push(s);
}
const reqs = [], exp = [];
for (const t of texts) {
  for (const level of ["clean", "search", "loose"]) for (const h of ["keep", "strip"]) {
    reqs.push({ op: "normalize", text: t, level, honorifics: h });
    exp.push(normalize(t, level, h));
  }
  if (t.length < 80) { reqs.push({ op: "nameKey", text: t }); exp.push(nameKey(t)); }
}
const got = dart(reqs);
let bad = 0;
for (let i = 0; i < got.length; i++) {
  if (got[i] !== exp[i] && bad++ < 8) {
    console.log("DIFF", JSON.stringify(reqs[i]).slice(0, 240));
    console.log("  dart  :", JSON.stringify(got[i]).slice(0, 200));
    console.log("  oracle:", JSON.stringify(exp[i]).slice(0, 200));
  }
}
console.log(`differential: ${bad} mismatches / ${got.length} comparisons`);
process.exit(bad ? 1 : 0);
