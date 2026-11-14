// Shared helpers for tools/*.mjs.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Batch-call the Dart reference CLI (packages/dart/tool/cli.dart). */
export function dart(requests) {
  const exe = join(root, "packages", "dart", ".dart_tool", "nass_cli.exe");
  if (!existsSync(exe)) {
    // dart is a .bat on Windows, so go through the shell.
    execFileSync(`dart compile exe tool/cli.dart -o "${exe}"`, { cwd: join(root, "packages", "dart"), stdio: "ignore", shell: true });
  }
  const out = execFileSync(exe, { input: JSON.stringify(requests), maxBuffer: 1 << 28 });
  return JSON.parse(out.toString("utf8"));
}

/** Parse the two-column "number","text" CSV of Open-Hadith-Data. */
export function readHadith(file) {
  const raw = readFileSync(join(root, "tools", "corpus", file), "utf8");
  const rows = [];
  const re = /"(\d+)","((?:[^"]|"")*)"(?:,"(?:[^"]|"")*")?\r?\n?/g;
  let m;
  while ((m = re.exec(raw))) rows.push({ n: Number(m[1]), text: m[2].replace(/""/g, '"') });
  return rows;
}

export const BOOKS = [
  { file: "sahih_al-bukhari_ahadith.utf8.csv", work: "صحيح البخاري" },
  { file: "sahih_muslim_ahadith.utf8.csv", work: "صحيح مسلم" },
  { file: "sunan_abu-dawud_ahadith.utf8.csv", work: "سنن أبي داود" },
  { file: "sunan_al-tirmidhi_ahadith.utf8.csv", work: "جامع الترمذي" },
  { file: "sunan_al-nasai_ahadith.utf8.csv", work: "سنن النسائي" },
  { file: "sunan_ibn-maja_ahadith.utf8.csv", work: "سنن ابن ماجه" },
];
export const VOCALIZED = { file: "sahih_al-bukhari_ahadith_mushakkala_mufassala.utf8.csv", work: "صحيح البخاري" };
export const DATASET = "Open-Hadith-Data (ODbL/DbCL), github.com/mhashim6/Open-Hadith-Data";

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function readVectors(name) {
  return JSON.parse(readFileSync(join(root, "spec", "vectors", `${name}.json`), "utf8"));
}
export function writeVectors(name, doc) {
  writeFileSync(join(root, "spec", "vectors", `${name}.json`), JSON.stringify(doc, null, 2) + "\n");
}
