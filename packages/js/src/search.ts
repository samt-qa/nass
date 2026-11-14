// Diacritic-insensitive search with offsets in the original text (SPEC §6).
import { normalize, normalizeWithMap, type NormalizeOptions, type NormalizedText } from "./normalizer.js";

export type MatchMode = "phrase" | "allWords" | "anyWord";

export interface SearchOptions extends NormalizeOptions {
  /** Default: "phrase". */
  matchMode?: MatchMode;
  /** Only match whole words. Default: false. */
  wholeWord?: boolean;
}

export interface HighlightOptions extends SearchOptions {
  /** Default: "<mark>". */
  open?: string;
  /** Default: "</mark>". */
  close?: string;
}

/** A match in the ORIGINAL haystack: [start, end) in UTF-16 units. */
export interface Match {
  start: number;
  end: number;
  text: string;
}

function phrase(haystack: string, hay: NormalizedText, needle: string, wholeWord: boolean): Match[] {
  const out: Match[] = [];
  if (!needle) return out;
  const t = hay.text;
  let from = 0, lastEnd = -1;
  for (;;) {
    const s = t.indexOf(needle, from);
    if (s < 0) break;
    const e = s + needle.length;
    const ok = !wholeWord || ((s === 0 || t.charCodeAt(s - 1) === 0x20) && (e === t.length || t.charCodeAt(e) === 0x20));
    if (ok) {
      const os = hay.start[s]!, oe = hay.end[e - 1]!;
      if (os >= lastEnd) {
        out.push({ start: os, end: oe, text: haystack.slice(os, oe) });
        lastEnd = oe;
      }
      from = e;
    } else from = s + 1;
  }
  return out;
}

function merge(all: Match[]): Match[] {
  all.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - b.start - (a.end - a.start)));
  const out: Match[] = [];
  let lastEnd = -1;
  for (const m of all) {
    if (m.start >= lastEnd) {
      out.push(m);
      lastEnd = m.end;
    }
  }
  return out;
}

/** All non-overlapping matches of `needle`, as spans of the original `haystack`. */
export function findAll(haystack: string, needle: string, options: SearchOptions = {}): Match[] {
  const n = normalize(needle, options);
  if (!n) return [];
  const hay = normalizeWithMap(haystack, options);
  const wholeWord = options.wholeWord ?? false;
  const mode = options.matchMode ?? "phrase";
  if (mode === "phrase") return phrase(haystack, hay, n, wholeWord);
  const all: Match[] = [];
  for (const w of new Set(n.split(" "))) {
    const ms = phrase(haystack, hay, w, wholeWord);
    if (ms.length === 0 && mode === "allWords") return [];
    all.push(...ms);
  }
  return merge(all);
}

/** Whether `needle` occurs in `haystack` after normalization. */
export function contains(haystack: string, needle: string, options: SearchOptions = {}): boolean {
  return findAll(haystack, needle, options).length > 0;
}

/** Wraps every match in the ORIGINAL haystack. Does not escape HTML. */
export function highlight(haystack: string, needle: string, options: HighlightOptions = {}): string {
  const open = options.open ?? "<mark>", close = options.close ?? "</mark>";
  const ms = findAll(haystack, needle, options);
  if (!ms.length) return haystack;
  let out = "", pos = 0;
  for (const m of ms) {
    out += haystack.slice(pos, m.start) + open + m.text + close;
    pos = m.end;
  }
  return out + haystack.slice(pos);
}
