#!/usr/bin/env node
// Generates every character table from ONE source (tools/tables.src.json) plus the
// pinned Unicode Character Database (tools/ucd/, fetched on demand).
//
// Outputs:
//   spec/tables.json                         canonical, human-readable
//   packages/dart/lib/src/tables.g.dart      Dart
//   packages/js/src/tables.g.ts              TypeScript
//   packages/php/src/Tables.php              PHP
//
// Usage: node tools/gen-tables.mjs           write all outputs
//        node tools/gen-tables.mjs --check   exit 1 if any output is stale (CI)
//
// NFKC is used here, at build time, one character at a time, only to derive the
// presentation-form table. Runtime code never calls NFC/NFKC (SPEC C1/C4).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "tools", "tables.src.json"), "utf8"));
const UCD_URL = `https://www.unicode.org/Public/${src.unicodeVersion}.0/ucd/`;

if (process.versions.unicode !== src.unicodeVersion) {
  console.error(`Unicode mismatch: Node has ${process.versions.unicode}, source pins ${src.unicodeVersion}.`);
  process.exit(2);
}

async function ucd(name) {
  const dir = join(root, "tools", "ucd");
  const p = join(dir, name);
  if (!existsSync(p)) {
    mkdirSync(dir, { recursive: true });
    const res = await fetch(UCD_URL + name);
    if (!res.ok) throw new Error(`fetch ${name}: ${res.status}`);
    writeFileSync(p, await res.text());
  }
  return readFileSync(p, "utf8");
}

const cp = (h) => parseInt(h, 16);
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");

/** ["0600", ["0610","061A"]] -> sorted unique ints */
function expand(list) {
  const out = new Set();
  for (const it of list) {
    if (Array.isArray(it)) for (let c = cp(it[0]); c <= cp(it[1]); c++) out.add(c);
    else out.add(cp(it));
  }
  return [...out].sort((a, b) => a - b);
}
/** sorted ints -> [[start,end],...] */
function ranges(ints) {
  const out = [];
  for (const c of [...new Set(ints)].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && last[1] === c - 1) last[1] = c;
    else out.push([c, c]);
  }
  return out;
}
const inRanges = (rs, c) => rs.some(([a, b]) => c >= a && c <= b);
const strToCps = (s) => [...s].map((ch) => ch.codePointAt(0));

// ---------- UCD-derived tables ----------
const unicodeData = (await ucd("UnicodeData.txt")).split("\n").filter(Boolean).map((l) => l.split(";"));
const propList = await ucd("PropList.txt");

const arabicRanges = src.arabicRanges.map(([a, b]) => [cp(a), cp(b)]);
const assigned = new Set();
const punctuation = [];
const ccc = [];
const compositions = [];
for (const f of unicodeData) {
  const c = cp(f[0]);
  // UnicodeData lists large ranges as First/Last pairs; none of them are punctuation or Arabic.
  assigned.add(c);
  if (f[2].startsWith("P")) punctuation.push(c);
  if (inRanges(arabicRanges, c) && f[3] !== "0") ccc.push([c, Number(f[3])]);
  if (inRanges(arabicRanges, c) && f[5] && !f[5].startsWith("<")) {
    const parts = f[5].split(" ").map(cp);
    if (parts.length === 2) compositions.push([parts[0], parts[1], c]);
  }
}
const whitespace = [];
for (const line of propList.split("\n")) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*White_Space\b/);
  if (m) for (let c = cp(m[1]); c <= cp(m[2] ?? m[1]); c++) whitespace.push(c);
}

// ---------- presentation forms ----------
const deferred = new Set(expand(src.presentationDeferredToSearch));
const presentation = [];       // [cp, [cps]]  (clean, C4)
const presentationSearch = []; // [cp, [cps]]  (search, S1)
for (const c of expand(src.presentationRanges)) {
  if (!assigned.has(c)) continue;
  const ch = String.fromCodePoint(c);
  const mapped = ch.normalize("NFKC").replace(/^ /, ""); // drop leading space before isolated harakat
  if (mapped === ch) continue;
  (deferred.has(c) ? presentationSearch : presentation).push([c, strToCps(mapped)]);
}
for (const [h, text] of Object.entries(src.presentationManual)) {
  if (h.startsWith("$")) continue;
  presentationSearch.push([cp(h), strToCps(text)]);
}
presentationSearch.sort((a, b) => a[0] - b[0]);
const pending = [...deferred].filter((c) => assigned.has(c) && !presentationSearch.some(([k]) => k === c));
if (pending.length) throw new Error(`Deferred ligatures without expansion: ${pending.map(hex).join(", ")}`);

const pairs = (obj) => Object.entries(obj).map(([k, v]) => [cp(k), cp(v)]).sort((a, b) => a[0] - b[0]);

const T = {
  unicodeVersion: src.unicodeVersion,
  invisibleAlways: ranges(expand(src.invisibleAlways)),
  invisibleNearArabic: ranges(expand(src.invisibleNearArabic)),
  tatweel: ranges(expand(src.tatweel)),
  arabic: arabicRanges,
  marks: ranges(expand(src.marks)),
  punctuation: ranges(punctuation),
  whitespace: ranges(whitespace),
  extraSeparators: ranges(expand(src.extraSeparators)),
  ccc: ccc.sort((a, b) => a[0] - b[0]),
  compositions: compositions.sort((a, b) => a[2] - b[2]),
  presentation,
  presentationSearch,
  letterMap: pairs(src.letterMap),
  digitMap: pairs(src.digitMap),
  digitSeparators: pairs(src.digitSeparators),
  looseMap: pairs(src.looseMap),
  looseRemove: ranges(expand(src.looseRemove)),
  honorificsAlways: src.honorificsWritten.always,
  honorificsAfterAllah: src.honorificsWritten.afterAllahOnly,
  trailingTitles: src.names.trailingTitles,
  kunya: Object.entries(src.names.kunya).flatMap(([to, froms]) => froms.map((f) => [f, to])),
  dhaFollowers: src.names.dhaFollowers,
  ibn: src.names.ibn,
  bint: src.names.bint,
};

// ---------- emitters ----------
const header = (c) => `${c} GENERATED by tools/gen-tables.mjs from tools/tables.src.json + Unicode ${src.unicodeVersion} UCD. Do not edit.\n`;

const humanJson = JSON.stringify(
  {
    $comment: "GENERATED. Code points are decimal. See tools/gen-tables.mjs.",
    ...T,
    stats: { presentation: presentation.length, presentationSearch: presentationSearch.length, compositions: compositions.length, ccc: ccc.length },
  },
  (k, v) => (Array.isArray(v) && v.every((x) => typeof x === "number") ? JSON.stringify(v) : v),
  2,
).replace(/"(\[[\d,]*\])"/g, "$1") + "\n";

// Flat encodings keep the runtime parse trivial and the JS bundle small.
const flatRanges = (rs) => rs.flat();
const flatMap = (m) => m.flatMap(([k, v]) => [k, v.length, ...v]); // key, len, ...values
const flatPairs = (m) => m.flat();

const fields = {
  invisibleAlways: flatRanges(T.invisibleAlways),
  invisibleNearArabic: flatRanges(T.invisibleNearArabic),
  tatweel: flatRanges(T.tatweel),
  arabic: flatRanges(T.arabic),
  marks: flatRanges(T.marks),
  punctuation: flatRanges(T.punctuation),
  whitespace: flatRanges(T.whitespace),
  extraSeparators: flatRanges(T.extraSeparators),
  looseRemove: flatRanges(T.looseRemove),
  ccc: flatPairs(T.ccc),
  compositions: T.compositions.flat(),
  presentation: flatMap(T.presentation),
  presentationSearch: flatMap(T.presentationSearch),
  letterMap: flatPairs(T.letterMap),
  digitMap: flatPairs(T.digitMap),
  digitSeparators: flatPairs(T.digitSeparators),
  looseMap: flatPairs(T.looseMap),
};
const strFields = {
  honorificsAlways: T.honorificsAlways,
  honorificsAfterAllah: T.honorificsAfterAllah,
  trailingTitles: T.trailingTitles,
  dhaFollowers: T.dhaFollowers,
  ibn: T.ibn,
  bint: T.bint,
  kunya: T.kunya.flat(),
};

const dart =
  header("//") +
  "// ignore_for_file: constant_identifier_names\n\n" +
  Object.entries(fields).map(([k, v]) => `const List<int> ${k} = [${v.join(",")}];`).join("\n") + "\n" +
  Object.entries(strFields).map(([k, v]) => `const List<String> ${k} = [${v.map((s) => JSON.stringify(s)).join(", ")}];`).join("\n") + "\n";

const ts =
  header("//") + "\n" +
  Object.entries(fields).map(([k, v]) => `export const ${k}: readonly number[] = [${v.join(",")}];`).join("\n") + "\n" +
  Object.entries(strFields).map(([k, v]) => `export const ${k}: readonly string[] = ${JSON.stringify(v)};`).join("\n") + "\n";

const php =
  "<?php\n\n" + header("//") + "\ndeclare(strict_types=1);\n\nnamespace Samt\\Nass;\n\n/** @internal */\nfinal class Tables\n{\n" +
  Object.entries(fields).map(([k, v]) => `    public const ${snake(k)} = [${v.join(",")}];`).join("\n") + "\n" +
  Object.entries(strFields).map(([k, v]) => `    public const ${snake(k)} = [${v.map((s) => `'${s}'`).join(", ")}];`).join("\n") + "\n}\n";

function snake(k) { return k.replace(/[A-Z]/g, (m) => "_" + m).toUpperCase(); }

const outputs = [
  ["spec/tables.json", humanJson],
  ["packages/dart/lib/src/tables.g.dart", dart],
  ["packages/js/src/tables.g.ts", ts],
  ["packages/php/src/Tables.php", php],
];

let stale = 0;
for (const [rel, content] of outputs) {
  const p = join(root, rel);
  if (process.argv.includes("--check")) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.error(`stale: ${rel}`); stale++; }
  } else {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}
if (process.argv.includes("--check")) {
  if (stale) { console.error("Run: node tools/gen-tables.mjs"); process.exit(1); }
  console.log("All generated tables are up to date.");
} else {
  console.log("Wrote", outputs.map((o) => o[0]).join(", "));
  console.log({ presentation: presentation.length, presentationSearch: presentationSearch.length, compositions: compositions.length, ccc: ccc.length, punctuationRanges: T.punctuation.length });
}
