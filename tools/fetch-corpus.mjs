// Downloads the Open-Hadith-Data CSV files into tools/corpus (git-ignored).
// Needed by gen-vectors.mjs and differential.mjs. See docs/corpus.md.
// Usage: node tools/fetch-corpus.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib.mjs";

const BASE = "https://raw.githubusercontent.com/mhashim6/Open-Hadith-Data/master/";
const FILES = [
  "Sahih_Al-Bukhari/sahih_al-bukhari_ahadith.utf8.csv",
  "Sahih_Al-Bukhari/sahih_al-bukhari_ahadith_mushakkala_mufassala.utf8.csv",
  "Sahih_Muslim/sahih_muslim_ahadith.utf8.csv",
  "Sunan_Abu-Dawud/sunan_abu-dawud_ahadith.utf8.csv",
  "Sunan_Al-Tirmidhi/sunan_al-tirmidhi_ahadith.utf8.csv",
  "Sunan_Al-Nasai/sunan_al-nasai_ahadith.utf8.csv",
  "Sunan_Ibn-Maja/sunan_ibn-maja_ahadith.utf8.csv",
];
const dir = join(root, "tools", "corpus");
mkdirSync(dir, { recursive: true });
for (const f of FILES) {
  const out = join(dir, f.split("/").pop());
  if (existsSync(out)) continue;
  const res = await fetch(BASE + f);
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`fetched ${f}`);
}
console.log("corpus ready in tools/corpus");
