#!/usr/bin/env node
// Structural and internal-consistency checks for spec/vectors/*.json.
// It does NOT implement normalization; it catches mistakes a reviewer would miss:
//   - schema, unique ids, review flag, source on sacred text
//   - offsets: start/end length == expected length (UTF-16), monotonic, in range
//   - search: text === haystack.slice(start, end), sorted, non-overlapping
//   - search/loose outputs contain no character the level must remove or map
// Usage: node tools/check-vectors.mjs   (exit 1 on any error)

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vdir = join(root, "spec", "vectors");
const tables = JSON.parse(readFileSync(join(root, "spec", "tables.json"), "utf8"));

const cp = (h) => parseInt(h, 16);
function setOf(list) {
  const s = new Set();
  for (const it of list) {
    if (Array.isArray(it)) for (let c = cp(it[0]); c <= cp(it[1]); c++) s.add(c);
    else s.add(cp(it));
  }
  return s;
}
// Characters that must never survive the search level.
const forbiddenSearch = new Set([
  ...setOf(tables.marks), ...setOf(tables.invisibleAlways), ...setOf(tables.tatweel),
  ...Object.keys(tables.letterMap).map(cp), ...Object.keys(tables.digitMap).map(cp),
  ...Object.keys(tables.presentation).map(cp), ...setOf(tables.extraSeparators),
]);
const forbiddenLoose = new Set([
  ...forbiddenSearch, ...Object.keys(tables.looseMap).map(cp), ...setOf(tables.looseRemove),
]);

const LEVELS = new Set(["clean", "search", "loose"]);
// Likely a Quran/hadith quotation: Uthmani-only characters, or 2+ vocalized words.
const QURANIC = /[ٱۖ-ۭ࣊-ࣿ]/;
const vocalizedWords = (t) => t.split(/\s+/).filter((w) => /[ً-ْ]/.test(w)).length;
const SACRED = { test: (t) => QURANIC.test(t) || vocalizedWords(t) >= 2 };
let errors = 0, total = 0;
const err = (id, msg) => { errors++; console.error(`  ✗ ${id}: ${msg}`); };

function checkOutput(id, level, text) {
  const bad = level === "loose" ? forbiddenLoose : level === "search" ? forbiddenSearch : null;
  if (!bad || typeof text !== "string") return;
  for (const ch of text) {
    if (bad.has(ch.codePointAt(0))) {
      err(id, `output contains U+${ch.codePointAt(0).toString(16).toUpperCase()} which level "${level}" must remove/map`);
    }
  }
  if (text !== text.trim() || /  /.test(text)) err(id, "output has untrimmed or double spaces");
}

function checkSpans(id, hay, spans) {
  let prevEnd = -1;
  for (const m of spans) {
    if (!(Number.isInteger(m.start) && Number.isInteger(m.end) && m.start < m.end)) { err(id, `bad span ${JSON.stringify(m)}`); continue; }
    if (m.end > hay.length) err(id, `span end ${m.end} > haystack length ${hay.length}`);
    if (m.start < prevEnd) err(id, `spans overlap or unsorted at ${m.start}`);
    if (hay.slice(m.start, m.end) !== m.text) err(id, `text mismatch: slice is "${hay.slice(m.start, m.end)}", vector says "${m.text}"`);
    prevEnd = m.end;
  }
}

for (const f of readdirSync(vdir).filter((f) => f.endsWith(".json")).sort()) {
  const doc = JSON.parse(readFileSync(join(vdir, f), "utf8"));
  console.log(`${f}: ${doc.cases.length} cases`);
  const ids = new Set();
  for (const c of doc.cases) {
    total++;
    const id = c.id ?? "(no id)";
    if (!c.id) err(id, "missing id");
    if (ids.has(c.id)) err(id, "duplicate id");
    ids.add(c.id);
    if (!c.note) err(id, "missing note");
    if (!["pending", "approved"].includes(c.review)) err(id, `review must be pending|approved`);
    const text = c.input ?? c.haystack;
    if (typeof text === "string" && SACRED.test(text) && !c.source && !c.synthetic) err(id, "Quranic/vocalized text needs source (or synthetic: true for a constructed example)");
    if (c.source && !(c.source.work && c.source.ref && typeof c.source.verified === "boolean")) err(id, "source needs work, ref, verified");

    switch (doc.file) {
      case "normalize":
        if (!LEVELS.has(c.level)) err(id, `bad level ${c.level}`);
        checkOutput(id, c.level, c.expected);
        break;
      case "offsets": {
        if (!LEVELS.has(c.level)) err(id, `bad level ${c.level}`);
        checkOutput(id, c.level, c.expected);
        const n = c.expected.length;
        if (c.start.length !== n || c.end.length !== n) err(id, `start/end length ${c.start.length}/${c.end.length} != expected length ${n}`);
        for (let i = 0; i < Math.min(n, c.start.length, c.end.length); i++) {
          if (c.start[i] >= c.end[i]) err(id, `empty source group at ${i}`);
          if (c.end[i] > c.input.length) err(id, `end[${i}] beyond input`);
          if (i && c.start[i] < c.start[i - 1]) err(id, `start not monotonic at ${i}`);
        }
        break;
      }
      case "search":
        checkSpans(id, c.haystack, c.expected);
        break;
      case "names":
        if (!("expected" in c || "same" in c || "different" in c)) err(id, "needs expected, same or different");
        if ("expected" in c) checkOutput(id, "loose", c.expected);
        break;
      case "isnad":
        if (!c.source) err(id, "isnad cases require source");
        break;
    }
  }
}

console.log(errors ? `\n${errors} error(s) in ${total} cases.` : `\nAll ${total} cases pass structural checks.`);
process.exit(errors ? 1 : 0);
