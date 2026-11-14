// Independent oracle for spec/SPEC.md, used only to produce expected values
// for generated test vectors. It deliberately shares NO code with the packages:
// it uses native NFC and regular expressions where the packages use a
// table-driven single pass. Agreement between the two is the point.
// It needs Node with Unicode 17 (same pin as tools/gen-tables.mjs).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = JSON.parse(readFileSync(join(root, "spec", "tables.json"), "utf8"));
if (process.versions.unicode !== T.unicodeVersion) throw new Error("Unicode version mismatch");

const ch = (c) => String.fromCodePoint(c);
const esc = (c) => "\\u{" + c.toString(16) + "}";
const cls = (ranges) => "[" + ranges.map(([a, b]) => (a === b ? esc(a) : esc(a) + "-" + esc(b))).join("") + "]";
const mapOf = (pairs) => new Map(pairs.map(([k, v]) => [ch(k), Array.isArray(v) ? String.fromCodePoint(...v) : ch(v)]));

const RE_INVIS = new RegExp(cls(T.invisibleAlways), "gu");
const RE_TATWEEL = new RegExp(cls(T.tatweel), "gu");
const ARABIC = new RegExp(cls(T.arabic), "u");
const NEAR = new Set(T.invisibleNearArabic.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => ch(a + i))));
const RE_MARKS = new RegExp(cls(T.marks), "gu");
const RE_WS = new RegExp(cls(T.whitespace), "gu");
const RE_EXTRA = new RegExp(cls(T.extraSeparators), "gu");
const PRES = mapOf(T.presentation);
const PRES_S = mapOf(T.presentationSearch);
const LETTERS = mapOf(T.letterMap);
const DIGITS = mapOf(T.digitMap);
const SEPS = mapOf(T.digitSeparators);
const LOOSE = mapOf(T.looseMap);
const RE_LOOSE_REMOVE = new RegExp(cls(T.looseRemove), "gu");

const collapse = (s) => s.replace(/ +/g, " ").trim();
const replaceChars = (s, map) => [...s].map((c) => map.get(c) ?? c).join("");

function clean(text) {
  let s = text.replace(RE_INVIS, "");
  // ZWJ/ZWNJ next to Arabic: nearest non-invisible original char on each side.
  const out = [];
  const a = [...s];
  for (let i = 0; i < a.length; i++) {
    if (NEAR.has(a[i])) {
      let p = i - 1;
      while (p >= 0 && NEAR.has(a[p])) p--;
      let j = i + 1;
      while (j < a.length && NEAR.has(a[j])) j++;
      if ((p >= 0 && ARABIC.test(a[p])) || (j < a.length && ARABIC.test(a[j]))) continue;
    }
    out.push(a[i]);
  }
  s = replaceChars(out.join("").replace(RE_TATWEEL, ""), PRES).replace(RE_WS, " ");
  return collapse(s.normalize("NFC"));
}

function phraseRegex(always, afterAllah) {
  const byLen = (l) => [...l].sort((x, y) => y.split(" ").length - x.split(" ").length);
  const alt = byLen(always).join("|");
  const after = byLen(afterAllah).join("|");
  return new RegExp(`(?<=^| )(?:(?:${alt})|(?<=(?:^| )الله )(?:${after}))(?= |$)`, "gu");
}
const RE_HON = phraseRegex(T.honorificsAlways, T.honorificsAfterAllah);
const looseText = (s) => replaceChars(s.replace(RE_LOOSE_REMOVE, ""), LOOSE);
const RE_HON_LOOSE = phraseRegex(T.honorificsAlways.map(looseText), T.honorificsAfterAllah.map(looseText));

export function normalize(text, level = "search", honorifics = "keep") {
  let s = clean(text);
  if (level === "clean") return s;
  // S1
  s = [...s].map((c) => {
    if (!PRES_S.has(c)) return c;
    return honorifics === "strip" && c !== "﷽" ? " " : PRES_S.get(c);
  }).join("");
  // S2, S3
  s = replaceChars(s.replace(RE_MARKS, ""), LETTERS);
  // S4 separators between digits (decided on the pre-digit-mapping text)
  const DIG = "[0-9٠-٩۰-۹]";
  s = s.replace(new RegExp(`(?<=${DIG})[٫٬.,](?=${DIG})`, "gu"), (m) => "\u0000" + SEPS.get(m));
  s = replaceChars(s, DIGITS);
  // S5 (the \0 marker protects kept separators; '%' is a symbol)
  s = s.replace(/\u0000(.)|(\p{P})/gu, (m, kept, p) => (kept ? kept : p === "%" ? "%" : " "))
       .replace(RE_EXTRA, " ");
  // S6
  s = s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  if (level === "loose") s = looseText(s);
  s = collapse(s);
  if (honorifics === "strip") s = collapse(s.replace(level === "loose" ? RE_HON_LOOSE : RE_HON, ""));
  return s;
}

// nameKey, written independently from SPEC §7.
export function nameKey(name) {
  const w = normalize(name, "search", "strip").split(" ").filter(Boolean);
  while (w.length > 1 && T.trailingTitles.includes(w[w.length - 1])) w.pop();
  const kunya = new Map();
  for (let i = 0; i < T.kunya.length; i++) kunya.set(T.kunya[i][0], T.kunya[i][1]);
  const mapped = w.map((x, i) =>
    kunya.get(x) ??
    (x === "ذا" && T.dhaFollowers.includes(w[i + 1]) ? "ذو" :
      T.ibn.includes(x) ? "بن" : T.bint.includes(x) ? "بنت" : x));
  const joined = mapped.join(" ").replace(/(^| )عبد (\S+)/g, "$1عبد$2");
  return normalize(joined, "loose");
}
