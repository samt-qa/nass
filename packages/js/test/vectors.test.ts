// Runs the shared test vectors in spec/vectors against the TypeScript package.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAll, nameKey, normalize, normalizeWithMap } from "../src/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (name: string): any[] =>
  JSON.parse(readFileSync(new URL(`../../../spec/vectors/${name}.json`, import.meta.url), "utf8")).cases;

describe("normalize", () => {
  for (const c of load("normalize")) {
    it(`${c.id}: ${c.note}`, () => {
      expect(normalize(c.input, { level: c.level, honorifics: c.options?.honorifics })).toBe(c.expected);
    });
  }
});

describe("offsets", () => {
  for (const c of load("offsets")) {
    it(`${c.id}: ${c.note}`, () => {
      const r = normalizeWithMap(c.input, { level: c.level, honorifics: c.options?.honorifics });
      expect(r).toEqual({ text: c.expected, start: c.start, end: c.end });
    });
  }
});

describe("search", () => {
  for (const c of load("search")) {
    it(`${c.id}: ${c.note}`, () => {
      expect(findAll(c.haystack, c.needle, c.options ?? {})).toEqual(c.expected);
    });
  }
});

describe("names", () => {
  for (const c of load("names")) {
    it(`${c.id}: ${c.note}`, () => {
      if ("expected" in c) expect(nameKey(c.input)).toBe(c.expected);
      if ("same" in c) expect(new Set(c.same.map(nameKey)).size).toBe(1);
      if ("different" in c) expect(new Set(c.different.map(nameKey)).size).toBe(c.different.length);
    });
  }
});
