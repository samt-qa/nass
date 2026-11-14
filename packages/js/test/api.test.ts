// API behaviour not covered by vectors: highlight, contains, defaults, property checks.
import { describe, expect, it } from "vitest";
import { contains, findAll, highlight, normalize, normalizeWithMap, type Level } from "../src/index.js";

const hadith = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ";

describe("api", () => {
  it("highlights inside the vocalized original", () => {
    expect(highlight(hadith, "الاعمال")).toBe("إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ");
    expect(highlight(hadith, "النيات", { open: "[", close: "]" })).toBe("إِنَّمَا الْأَعْمَالُ بِ[النِّيَّاتِ]");
    expect(highlight(hadith, "غائب")).toBe(hadith);
  });
  it("contains", () => {
    expect(contains(hadith, "انما الاعمال")).toBe(true);
    expect(contains(hadith, "الاعمال", { wholeWord: true })).toBe(true);
    expect(contains(hadith, "عمال", { wholeWord: true })).toBe(false);
  });
  it("defaults to search level", () => {
    expect(normalize(hadith)).toBe("انما الاعمال بالنيات");
  });
  it("maps every unit", () => {
    const m = normalizeWithMap(hadith);
    expect(m.start.length).toBe(m.text.length);
  });
});

const pieces = ["ب", "س", "ا", "أ", "ٱ", "ى", "ة", "ؤ", "ء", "ک", "َ", "ّ", "ٰ", "ۥ", "ٔ", "ـ", "ﷲ", "ﻻ", "ﷺ", "﷽",
  "ﹰ", " ", "\n", "،", ".", "٫", "۝", "%", "١", "3", "‍", "‏", "﻿", "👨", "A", " الله ", " تعالى ", " رضي الله عنه ", " عبد "];
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const samples = Array.from({ length: 3000 }, () =>
  Array.from({ length: Math.floor(rand() * 14) }, () => pieces[Math.floor(rand() * pieces.length)]).join(""));
const levels: Level[] = ["clean", "search", "loose"];

describe("properties", () => {
  it("is idempotent", () => {
    for (const x of samples) for (const level of levels) for (const honorifics of ["keep", "strip"] as const) {
      const once = normalize(x, { level, honorifics });
      expect(normalize(once, { level, honorifics })).toBe(once);
    }
  });
  it("levels include the previous one", () => {
    for (const x of samples) {
      expect(normalize(normalize(x, { level: "clean" }))).toBe(normalize(x));
      expect(normalize(normalize(x), { level: "loose" })).toBe(normalize(x, { level: "loose" }));
    }
  });
  it("findAll spans contain the needle after normalization", () => {
    for (const x of samples) {
      for (const w of normalize(x).split(" ").filter(Boolean)) {
        for (const m of findAll(x, w)) expect(normalize(m.text)).toContain(normalize(w));
      }
    }
  });
});
