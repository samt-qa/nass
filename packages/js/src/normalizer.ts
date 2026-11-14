// Normalization pipeline (SPEC §1–§5). Mirrors packages/dart/lib/src/normalizer.dart.
//
//   pass 1  decode + C2 C3 C4 C5 + Z (space collapse at insertion)
//   pass 2  C1 Arabic canonical reordering + composition, in place
//   pass 3  S1 S2 S3 S4 S5 S6 (+ L1 in loose) + Z            [search, loose]
//   pass 4  S7 written honorifics + Z                         [strip only]
import {
  F_ARABIC, F_INVIS_ALWAYS, F_INVIS_NEAR, F_LOOSE_REMOVE, F_MARK, F_SEP, F_SPACE, F_TATWEEL,
  ccc, compose, digitSep, flags, isArabic, isSep, isSpace, looseMap, map1, pres, presData, presSearch,
} from "./charset.js";
import * as t from "./tables.g.js";

/** Normalization level (SPEC §1). Each level includes the previous one. */
export type Level = "clean" | "search" | "loose";
/** How honorific formulas and ligatures are treated (SPEC S1, S7). */
export type Honorifics = "keep" | "strip";

export interface NormalizeOptions {
  /** Default: "search". */
  level?: Level;
  /** Default: "keep". */
  honorifics?: Honorifics;
}

/** Normalized text plus, for every UTF-16 unit, the [start, end) span of its source. */
export interface NormalizedText {
  text: string;
  start: number[];
  end: number[];
}

const SPACE = 0x20;

/** Growable triple of typed arrays: code point, source start, source end. */
export class Buf {
  cp: Int32Array;
  s: Int32Array;
  e: Int32Array;
  length = 0;
  constructor(capacity: number) {
    const n = Math.max(8, capacity);
    this.cp = new Int32Array(n);
    this.s = new Int32Array(n);
    this.e = new Int32Array(n);
  }
  private grow(): void {
    const n = this.cp.length * 2;
    const cp = new Int32Array(n), s = new Int32Array(n), e = new Int32Array(n);
    cp.set(this.cp);
    s.set(this.s);
    e.set(this.e);
    this.cp = cp;
    this.s = s;
    this.e = e;
  }
  add(c: number, st: number, en: number): void {
    if (this.length === this.cp.length) this.grow();
    this.cp[this.length] = c;
    this.s[this.length] = st;
    this.e[this.length] = en;
    this.length++;
  }
  /** Adds a space unless empty or already ending with one (Z). */
  addSpace(st: number, en: number): void {
    if (this.length === 0 || this.cp[this.length - 1] === SPACE) return;
    this.add(SPACE, st, en);
  }
  /** A deleted mark joins the source group of the last kept unit (SPEC §5). */
  attach(en: number): void {
    if (this.length === 0) return;
    const st = this.s[this.length - 1]!;
    for (let i = this.length - 1; i >= 0 && this.s[i] === st; i--) {
      if (this.e[i]! < en) this.e[i] = en;
    }
  }
  trimEnd(): void {
    if (this.length > 0 && this.cp[this.length - 1] === SPACE) this.length--;
  }
  get text(): string {
    let out = "";
    const CHUNK = 8192;
    for (let i = 0; i < this.length; i += CHUNK) {
      out += String.fromCodePoint(...this.cp.subarray(i, Math.min(this.length, i + CHUNK)));
    }
    return out;
  }
}

// ---------------------------------------------------------------- pass 1

const ZWNJ = 0x200c;
const ZWJ = 0x200d;

/** Whether the ZWNJ at k has an Arabic neighbour: the nearest code point on either side that is not ZWNJ or ZWJ (SPEC S2). */
function zwnjNearArabic(a: Buf, k: number): boolean {
  const arabic = (x: number) => x < 0x10000 && (flags[x]! & F_ARABIC) !== 0;
  for (let m = k - 1; m >= 0; m--) {
    const x = a.cp[m]!;
    if (x === ZWNJ || x === ZWJ) continue;
    if (arabic(x)) return true;
    break;
  }
  for (let m = k + 1; m < a.length; m++) {
    const x = a.cp[m]!;
    if (x === ZWNJ || x === ZWJ) continue;
    return arabic(x);
  }
  return false;
}

function pass1(text: string): Buf {
  const n = text.length;
  const out = new Buf(n + 16);
  let i = 0;
  while (i < n) {
    let c = text.charCodeAt(i);
    let w = 1;
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        w = 2;
      }
    }
    const st = i, en = i + w;
    i = en;
    if (c >= 0x10000) {
      if (isSpace(c)) out.addSpace(st, en);
      else out.add(c, st, en);
      continue;
    }
    const f = flags[c]!;
    if (f === 0) {
      out.add(c, st, en);
      continue;
    }
    if ((f & (F_INVIS_ALWAYS | F_TATWEEL)) !== 0) {
      out.attach(en);
      continue;
    }
    if ((f & F_INVIS_NEAR) !== 0) {
      // Neighbours: nearest input code points on each side that are not invisible (SPEC C2).
      let near = false;
      for (let m = st - 1; m >= 0; m--) {
        const x = text.charCodeAt(m);
        if ((flags[x]! & (F_INVIS_ALWAYS | F_INVIS_NEAR)) === 0) {
          near = (flags[x]! & F_ARABIC) !== 0;
          break;
        }
      }
      if (!near) {
        for (let m = i; m < n; m++) {
          const x = text.charCodeAt(m);
          if ((flags[x]! & (F_INVIS_ALWAYS | F_INVIS_NEAR)) === 0) {
            near = (flags[x]! & F_ARABIC) !== 0;
            break;
          }
        }
      }
      // ZWNJ next to Arabic is kept in clean and removed in search (SPEC C2, S2).
      if (near && c !== ZWNJ) out.attach(en);
      else out.add(c, st, en);
      continue;
    }
    const p = pres[c]!;
    if (p !== 0) {
      const off = p >> 8, len = p & 0xff;
      for (let k = 0; k < len; k++) out.add(presData[off + k]!, st, en);
      continue;
    }
    if ((f & F_SPACE) !== 0) out.addSpace(st, en);
    else out.add(c, st, en);
  }
  out.trimEnd();
  return out;
}

// ---------------------------------------------------------------- pass 2 (C1)

const cccOf = (c: number): number => (c < 0x10000 ? ccc[c]! : 0);

function c1(a: Buf): void {
  const { cp, s, e } = a;
  const n = a.length;
  let i = 0;
  while (i < n) {
    if (cccOf(cp[i]!) === 0) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && cccOf(cp[j]!) !== 0) j++;
    if (j - i > 1) {
      let changed = false;
      for (let k = i + 1; k < j; k++) {
        const x = cp[k]!, xs = s[k]!, xe = e[k]!, xc = cccOf(x);
        let m = k - 1;
        while (m >= i && cccOf(cp[m]!) > xc) {
          cp[m + 1] = cp[m]!;
          s[m + 1] = s[m]!;
          e[m + 1] = e[m]!;
          m--;
          changed = true;
        }
        cp[m + 1] = x;
        s[m + 1] = xs;
        e[m + 1] = xe;
      }
      if (changed) {
        let lo = s[i]!, hi = e[i]!;
        for (let k = i; k < j; k++) {
          if (s[k]! < lo) lo = s[k]!;
          if (e[k]! > hi) hi = e[k]!;
        }
        for (let k = i; k < j; k++) {
          s[k] = lo;
          e[k] = hi;
        }
      }
    }
    i = j;
  }
  let w = 0, starter = -1, lastCcc = -1;
  for (let k = 0; k < n; k++) {
    const c = cp[k]!;
    const cc = cccOf(c);
    if (starter >= 0 && (lastCcc === -1 || lastCcc < cc)) {
      const composed = compose.get(c)?.get(cp[starter]!);
      if (composed !== undefined) {
        cp[starter] = composed;
        if (e[k]! > e[starter]!) e[starter] = e[k]!;
        continue;
      }
    }
    if (cc === 0) {
      starter = w;
      lastCcc = -1;
    } else lastCcc = cc;
    cp[w] = c;
    s[w] = s[k]!;
    e[w] = e[k]!;
    w++;
  }
  a.length = w;
}

// ---------------------------------------------------------------- pass 3

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
const becomesDigit = (c: number): boolean => isDigit(c) || (c < 0x10000 && isDigit(map1[c]!));

function pass3(a: Buf, h: Honorifics, loose: boolean): Buf {
  const out = new Buf(a.length + 16);
  for (let k = 0; k < a.length; k++) {
    const c = a.cp[k]!, st = a.s[k]!, en = a.e[k]!;
    if (c < 0x10000) {
      const p = presSearch[c]!;
      if (p !== 0) {
        if (h === "strip" && c !== 0xfdfd) out.addSpace(st, en);
        else {
          const off = p >> 8, len = p & 0xff;
          for (let m = 0; m < len; m++) emit(out, presData[off + m]!, st, en, -1, loose);
        }
        continue;
      }
      if (c === ZWNJ && zwnjNearArabic(a, k)) {
        out.attach(en);
        continue;
      }
      if ((flags[c]! & F_MARK) !== 0) {
        out.attach(en);
        continue;
      }
    }
    let next = -1;
    for (let m = k + 1; m < a.length; m++) {
      const x = a.cp[m]!;
      if (x >= 0x10000 || (flags[x]! & F_MARK) === 0) {
        next = x;
        break;
      }
    }
    emit(out, c, st, en, next, loose);
  }
  out.trimEnd();
  return out;
}

function emit(out: Buf, c: number, st: number, en: number, next: number, loose: boolean): void {
  if (c >= 0x10000) {
    if (isSep(c)) out.addSpace(st, en);
    else out.add(c, st, en);
    return;
  }
  if (c === SPACE) {
    out.addSpace(st, en);
    return;
  }
  const m = map1[c]!;
  if (m !== 0) c = m;
  else {
    const sep = digitSep[c]!;
    if (sep !== 0) {
      const prev = out.length > 0 ? out.cp[out.length - 1]! : -1;
      if (isDigit(prev) && next >= 0 && becomesDigit(next)) {
        out.add(sep, st, en);
        return;
      }
    }
    if ((flags[c]! & F_SEP) !== 0) {
      out.addSpace(st, en);
      return;
    }
  }
  if (loose) {
    if ((flags[c]! & F_LOOSE_REMOVE) !== 0) {
      out.attach(en);
      return;
    }
    const l = looseMap[c]!;
    if (l !== 0) c = l;
  }
  out.add(c, st, en);
}

// ---------------------------------------------------------------- pass 4 (S7)

const byLength = (list: readonly string[], loose: boolean): string[][] =>
  list.map((p) => (loose ? normalize(p, { level: "loose" }) : p).split(" ")).sort((a, b) => b.length - a.length);
let phrases: { always: string[][]; afterAllah: string[][]; alwaysLoose: string[][]; afterAllahLoose: string[][] } | undefined;
function getPhrases() {
  return (phrases ??= {
    always: byLength(t.honorificsAlways, false),
    afterAllah: byLength(t.honorificsAfterAllah, false),
    alwaysLoose: byLength(t.honorificsAlways, true),
    afterAllahLoose: byLength(t.honorificsAfterAllah, true),
  });
}

function s7(a: Buf, loose: boolean): Buf {
  const ph = getPhrases();
  const always = loose ? ph.alwaysLoose : ph.always;
  const afterAllah = loose ? ph.afterAllahLoose : ph.afterAllah;
  const ws: number[] = [];
  let i = 0;
  while (i < a.length) {
    let j = i;
    while (j < a.length && a.cp[j] !== SPACE) j++;
    ws.push(i, j);
    i = j + 1;
  }
  const nw = ws.length / 2;
  const texts: string[] = [];
  for (let w = 0; w < nw; w++) texts.push(String.fromCodePoint(...a.cp.subarray(ws[2 * w]!, ws[2 * w + 1]!)));
  const removed = new Array<boolean>(nw).fill(false);
  const matchAt = (w: number, p: string[]): boolean => {
    if (w + p.length > nw) return false;
    for (let k = 0; k < p.length; k++) if (texts[w + k] !== p[k]) return false;
    return true;
  };
  let any = false;
  let w = 0;
  while (w < nw) {
    let hit: string[] | undefined = always.find((p) => matchAt(w, p));
    if (!hit && w > 0 && texts[w - 1] === "الله") hit = afterAllah.find((p) => matchAt(w, p));
    if (hit) {
      for (let k = 0; k < hit.length; k++) removed[w + k] = true;
      any = true;
      w += hit.length;
    } else w++;
  }
  if (!any) return a;
  const out = new Buf(a.length);
  for (let w2 = 0; w2 < nw; w2++) {
    if (removed[w2]) continue;
    if (out.length > 0) {
      const sp = ws[2 * w2]! - 1;
      out.add(SPACE, a.s[sp]!, a.e[sp]!);
    }
    for (let k = ws[2 * w2]!; k < ws[2 * w2 + 1]!; k++) out.add(a.cp[k]!, a.s[k]!, a.e[k]!);
  }
  return out;
}

// ---------------------------------------------------------------- public

/** @internal */
export function normalizeBuf(text: string, level: Level, honorifics: Honorifics): Buf {
  let b = pass1(text);
  c1(b);
  if (level === "clean") return b;
  b = pass3(b, honorifics, level === "loose");
  if (honorifics === "strip") {
    // Repeat until stable: a removal can make «الله» precede another formula.
    for (let prev = -1; prev !== b.length; ) {
      prev = b.length;
      b = s7(b, level === "loose");
    }
  }
  return b;
}

/** Normalizes text (SPEC §1). Deterministic and idempotent. */
export function normalize(text: string, options: NormalizeOptions = {}): string {
  return normalizeBuf(text, options.level ?? "search", options.honorifics ?? "keep").text;
}

/** Normalizes text and maps every UTF-16 unit of the result to its source span (SPEC §5). */
export function normalizeWithMap(text: string, options: NormalizeOptions = {}): NormalizedText {
  const b = normalizeBuf(text, options.level ?? "search", options.honorifics ?? "keep");
  const start: number[] = [], end: number[] = [];
  for (let k = 0; k < b.length; k++) {
    const units = b.cp[k]! > 0xffff ? 2 : 1;
    for (let u = 0; u < units; u++) {
      start.push(b.s[k]!);
      end.push(b.e[k]!);
    }
  }
  return { text: b.text, start, end };
}
