// Runtime lookup tables built once from the generated tables (mirrors Dart charset.dart).
import * as t from "./tables.g.js";

export const F_INVIS_ALWAYS = 1;
export const F_INVIS_NEAR = 2;
export const F_TATWEEL = 4;
export const F_ARABIC = 8;
export const F_MARK = 16;
export const F_SEP = 32;
export const F_SPACE = 64;
export const F_LOOSE_REMOVE = 128;

export const flags = new Uint8Array(0x10000);
export const ccc = new Uint8Array(0x10000);
/** S3/S4/S6 single-character map. 0 = none. */
export const map1 = new Int32Array(0x10000);
export const looseMap = new Int32Array(0x10000);
export const digitSep = new Int32Array(0x10000);
/** second -> (first -> composed) */
export const compose = new Map<number, Map<number, number>>();
/** (offset << 8 | length) into presData; 0 = none. */
export const pres = new Int32Array(0x10000);
export const presSearch = new Int32Array(0x10000);
export const presData: number[] = [0];
const astralSep = new Set<number>();
const astralSpace = new Set<number>();

function ranges(flat: readonly number[], flag: number, astral?: Set<number>): void {
  for (let i = 0; i < flat.length; i += 2) {
    for (let c = flat[i]!; c <= flat[i + 1]!; c++) {
      if (c < 0x10000) flags[c]! |= flag;
      else astral?.add(c);
    }
  }
}
/** Decodes runs [startKey, runLength, n, ...values] (see tools/gen-tables.mjs). */
function expansions(flat: readonly number[], into: Int32Array): void {
  let i = 0;
  while (i < flat.length) {
    const k = flat[i]!, run = flat[i + 1]!, n = flat[i + 2]!;
    const ref = (presData.length << 8) | n;
    for (let m = 0; m < n; m++) presData.push(flat[i + 3 + m]!);
    for (let r = 0; r < run; r++) into[k + r] = ref;
    i += 3 + n;
  }
}
function pairs(flat: readonly number[], into: Int32Array): void {
  for (let i = 0; i < flat.length; i += 2) into[flat[i]!] = flat[i + 1]!;
}

ranges(t.invisibleAlways, F_INVIS_ALWAYS);
ranges(t.invisibleNearArabic, F_INVIS_NEAR);
ranges(t.tatweel, F_TATWEEL);
ranges(t.arabic, F_ARABIC);
ranges(t.marks, F_MARK);
ranges(t.punctuation, F_SEP, astralSep);
ranges(t.extraSeparators, F_SEP);
ranges(t.whitespace, F_SPACE, astralSpace);
ranges(t.looseRemove, F_LOOSE_REMOVE);
flags[0x25]! &= ~F_SEP; // '%' is kept as a symbol (SPEC S5)
for (let i = 0; i < t.ccc.length; i += 2) ccc[t.ccc[i]!] = t.ccc[i + 1]!;
for (let i = 0; i < t.compositions.length; i += 3) {
  const first = t.compositions[i]!, second = t.compositions[i + 1]!, composed = t.compositions[i + 2]!;
  let m = compose.get(second);
  if (!m) compose.set(second, (m = new Map()));
  m.set(first, composed);
}
expansions(t.presentation, pres);
expansions(t.presentationSearch, presSearch);
pairs(t.letterMap, map1);
pairs(t.digitMap, map1);
for (let c = 0x41; c <= 0x5a; c++) map1[c] = c + 0x20;
pairs(t.looseMap, looseMap);
pairs(t.digitSeparators, digitSep);

export const isArabic = (c: number): boolean => c < 0x10000 && (flags[c]! & F_ARABIC) !== 0;
export const isSep = (c: number): boolean => (c < 0x10000 ? (flags[c]! & F_SEP) !== 0 : astralSep.has(c));
export const isSpace = (c: number): boolean => (c < 0x10000 ? (flags[c]! & F_SPACE) !== 0 : astralSpace.has(c));
