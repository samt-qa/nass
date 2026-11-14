// Experimental isnad/matn split (SPEC §8). A small recursive-descent parser over
// search-normalized words: the isnad is a chain of links (a transmission word
// followed by a narrator), and the matn starts where no link can continue.
// Shipped as the separate entry "@samt/nass/isnad" to keep the core bundle small.
import { normalize, normalizeWithMap } from "./normalizer.js";

export interface Narrator {
  /** The narrator's name as written in the input. */
  name: string;
  /** The transmission word that introduced the narrator, as written. */
  form: string;
}
export interface IsnadSplit {
  isnad: string;
  matn: string;
  confidence: number;
  narrators: Narrator[];
}

const set = (words: string) => new Set(words.split(" ").map((w) => normalize(w)));
const N = (s: string) => normalize(s);

// Lexicon (SPEC §8.2), normalized at the search level.
const TV = set("حدثنا حدثني أخبرنا أخبرني أنبأنا أنبأني حدثناه أخبرناه حدثنيه أخبرنيه أخبرناه");
const ABBR = set("ثنا نا أنا أنبا");
const PRON_TV = set("حدثه حدثته حدثها حدثهم أخبره أخبرته أخبرها أخبرهم حدث أخبر");
const SAY = set("قال قالت قالا قالوا يقول تقول يقولا يقولان");
const HEAR = set("سمعت سمع سمعه سمعنا سمعته سمعتها");
const SKIP = set("و ح أحسبه");
const RAISE = set("يرويه يرفعه رفعه");
const QUALIFIER = set("يعني تعني وهو هو واسمه");
const CLIENT = set("زوج مولى");
const STOP = new Set([
  ...TV, ...ABBR, ...PRON_TV, ...SAY, ...HEAR, ...SKIP, ...RAISE, ...QUALIFIER, ...CLIENT,
  ...set("عن أن أنه أنها يحدث رضي رسول النبي نبي صلى في يا لما إذا إذ كان كانت كانوا كنا كنت لا ما لم لن هل قد ثم إلى"),
]);
const RASUL = N("رسول"), NABI_AL = N("النبي"), NABI = N("نبي"), ALLAH = N("الله");
const SALAWAT = N("صلى الله عليه وسلم").split(" ");
const PEACE = N("عليه السلام").split(" ");
const RADI = N("رضي");
const HONOR_TAIL = set("عنه عنها عنهما عنهم");
const AN = N("أن"), ANHU = N("أنه"), ANHA = N("أنها"), AAN = N("عن");
const YUHADDITH = N("يحدث"), LI = N("لي"), LANA = N("لنا"), KANA = N("كان");
const QARA2TU = N("قرأت"), ALA = N("على"), MIN = N("من");
const MAX_STRONG = 14, MAX_WEAK = 6;

class Parser {
  w: string[] = [];
  st: number[] = [];
  en: number[] = [];
  narrators: Narrator[] = [];
  how = 0; // 3 = Prophet formula, 2 = terminal «قال», 1 = end of a name

  constructor(readonly text: string) {
    const m = normalizeWithMap(text);
    const t = m.text;
    let i = 0;
    while (i < t.length) {
      if (t.charCodeAt(i) === 0x20) { i++; continue; }
      let j = i;
      while (j < t.length && t.charCodeAt(j) !== 0x20) j++;
      this.w.push(t.slice(i, j));
      this.st.push(m.start[i]!);
      this.en.push(m.end[j - 1]!);
      i = j;
    }
  }

  get n() { return this.w.length; }
  at(i: number): string { return this.w[i] ?? ""; }
  src(i: number) { return this.text.slice(this.st[i]!, this.en[i]!); }

  isTv(i: number, abbr = false) {
    const x = this.at(i);
    if (TV.has(x) || (abbr && ABBR.has(x))) return true;
    return x.length > 2 && x.startsWith("و") && TV.has(x.slice(1));
  }

  prophet(i: number): number {
    let j: number;
    if (this.at(i) === RASUL && this.at(i + 1) === ALLAH) j = i + 2;
    else if (this.at(i) === NABI_AL) j = i + 1;
    else if (this.at(i) === NABI && this.at(i + 1) === ALLAH) j = i + 2;
    else return -1;
    if (this.seq(j, SALAWAT)) return j + SALAWAT.length;
    if (this.seq(j, PEACE)) return j + PEACE.length;
    return j;
  }

  seq(i: number, s: string[]) {
    for (let k = 0; k < s.length; k++) if (this.at(i + k) !== s[k]) return false;
    return true;
  }

  honorific(i: number) {
    return this.at(i) === RADI && this.at(i + 1) === ALLAH && HONOR_TAIL.has(this.at(i + 2)) ? i + 3 : -1;
  }

  name(i: number, form: string, max: number): number {
    let j = i;
    while (j < this.n && !STOP.has(this.at(j)) && !this.isTv(j)) {
      if (j - i === max) return -1;
      j++;
    }
    if (j === i) return -1;
    this.narrators.push({ name: this.text.slice(this.st[i]!, this.en[j - 1]!), form });
    return j;
  }

  try(f: () => number): number {
    const keep = this.narrators.length;
    const r = f();
    if (r < 0) this.narrators.length = keep;
    return r;
  }

  done(b: number, kind: number) { this.how = kind; return b; }

  isLinkWord(i: number) {
    const x = this.at(i);
    return this.isTv(i) || x === AAN || x === AN || x === ANHU || x === ANHA || SAY.has(x) ||
      HEAR.has(x) || SKIP.has(x) || RAISE.has(x) || x === YUHADDITH;
  }

  link(i: number, max = MAX_STRONG): number {
    if (i >= this.n) return -1;
    const x = this.at(i);
    if (SKIP.has(x)) return this.link(i + 1, max);
    if (this.isTv(i) || (x === QARA2TU && this.at(i + 1) === ALA)) {
      const j = this.name(x === QARA2TU ? i + 2 : i + 1, this.src(i), max);
      return j < 0 ? -1 : this.after(j, true);
    }
    if (x === AAN) {
      const p = this.prophet(i + 1);
      if (p >= 0) return this.prophetEnd(p);
      const j = this.name(i + 1, this.src(i), max);
      return j < 0 ? -1 : this.after(j, true);
    }
    if (HEAR.has(x)) {
      const p = this.prophet(i + 1);
      if (p >= 0) return this.prophetEnd(p);
      const j = this.name(this.at(i + 1) === MIN ? i + 2 : i + 1, this.src(i), max);
      return j < 0 ? -1 : this.after(j, true);
    }
    if (x === ANHU || x === ANHA) {
      if (SAY.has(this.at(i + 1))) return this.say(i + 1);
      if (HEAR.has(this.at(i + 1))) return this.link(i + 1);
      return -1;
    }
    if (x === AN) {
      const p = this.prophet(i + 1);
      if (p >= 0) {
        if (SAY.has(this.at(p))) return this.done(p + 1, 3);
        if (this.at(p) === KANA && SAY.has(this.at(p + 1))) return this.done(p + 2, 3);
        return this.done(i, 3);
      }
      return this.try(() => {
        const j = this.name(i + 1, this.src(i), MAX_WEAK);
        if (j < 0) return -1;
        const h = this.honorific(j);
        if (h >= 0) return this.after(h, true);
        return PRON_TV.has(this.at(j)) ? this.link(j) : -1;
      });
    }
    if (PRON_TV.has(x)) {
      if (i + 1 < this.n && this.isLinkWord(i + 1)) return this.after(i + 1, true);
      const r = this.try(() => {
        const j = this.name(i + 1, this.src(i), MAX_WEAK);
        return j < 0 ? -1 : this.after(j, true);
      });
      return r >= 0 ? r : this.done(i + 1, 1);
    }
    if (SAY.has(x)) return this.say(i);
    if (RAISE.has(x)) return this.done(SAY.has(this.at(i + 1)) ? i + 2 : i + 1, 3);
    if (x === YUHADDITH) {
      if (this.isLinkWord(i + 1)) return this.link(i + 1);
      const j = this.name(i + 1, this.src(i), MAX_WEAK);
      return j < 0 ? -1 : this.after(j, true);
    }
    return -1;
  }

  prophetEnd(p: number) {
    let j = p;
    if (this.at(j) === ANHU) j++;
    if (SAY.has(this.at(j))) return this.done(j + 1, 3);
    return this.done(p, 3);
  }

  sayCont(i: number): number {
    const j = i + 1;
    const x = this.at(j);
    if (SAY.has(x)) {
      const r = this.try(() => this.sayCont(j));
      return r >= 0 ? r : this.done(j, 2);
    }
    if (x === LI || x === LANA) {
      const p = this.prophet(j + 1);
      if (p >= 0) return this.done(p, 3);
      return this.try(() => this.weak(j + 1, i));
    }
    const p = this.prophet(j);
    if (p >= 0) return this.done(p, 3);
    if (this.isLinkWord(j) && x !== AN) {
      const r = this.try(() => this.link(j));
      if (r >= 0) return r;
    }
    return this.try(() => this.weak(j, i));
  }

  weak(i: number, formAt: number) {
    const j = this.name(i, this.src(formAt), MAX_WEAK);
    return j < 0 ? -1 : this.after(j, false);
  }

  say(i: number) {
    const r = this.sayCont(i);
    return r >= 0 ? r : this.done(i + 1, 2);
  }

  after(j: number, strong: boolean): number {
    let honored = false;
    for (;;) {
      const h = this.honorific(j);
      if (h >= 0) { j = h; honored = true; continue; }
      if (QUALIFIER.has(this.at(j))) {
        const k = this.try(() => this.name(j + 1, "", MAX_STRONG));
        if (k >= 0) { this.narrators.pop(); j = k; continue; }
      }
      if (CLIENT.has(this.at(j))) {
        const p = this.prophet(j + 1);
        if (p >= 0) { j = p; continue; }
      }
      break;
    }
    if (j >= this.n) return -1;
    if (SAY.has(this.at(j))) {
      const r = this.sayCont(j);
      return r >= 0 ? r : this.done(j + 1, 2);
    }
    if (this.isTv(j, true) || this.isLinkWord(j)) {
      const r = this.try(() => this.link(j, strong ? MAX_STRONG : MAX_WEAK));
      if (r >= 0) return r;
      if (this.isTv(j, true)) return -1;
    }
    return strong || honored ? this.done(j, 1) : -1;
  }
}

/**
 * Splits a hadith into isnad and matn (SPEC §8).
 * @experimental API may change before 2.0.
 */
export function splitIsnad(text: string): IsnadSplit {
  const none: IsnadSplit = { isnad: "", matn: text, confidence: 0, narrators: [] };
  const p = new Parser(text);
  if (p.n === 0 || !p.isLinkWord(0)) return none;
  const b = p.link(0);
  if (b <= 0 || b >= p.n || p.narrators.length === 0) return none;
  const off = p.st[b]!;
  const tenths = (p.how === 3 ? 9 : p.how === 2 ? 8 : 6) - (p.narrators.length >= 2 ? 0 : 2);
  return { isnad: text.slice(0, off).trimEnd(), matn: text.slice(off), confidence: tenths / 10, narrators: p.narrators };
}
