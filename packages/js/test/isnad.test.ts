// splitIsnad: every package must reproduce the reference output in spec/vectors/isnad.json,
// and the reference must stay accurate against the hand labels.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitIsnad } from "../src/isnad.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: any[] = JSON.parse(
  readFileSync(new URL("../../../spec/vectors/isnad.json", import.meta.url), "utf8"),
).cases;

describe("splitIsnad reference output", () => {
  for (const c of cases) {
    it(c.id, () => {
      const r = splitIsnad(c.input);
      const start = r.isnad === "" ? -1 : c.input.length - r.matn.length;
      expect({ matnStart: start, confidence: r.confidence, narrators: r.narrators }).toEqual(c.reference);
      if (start >= 0) expect(r.isnad).toBe(c.input.slice(0, start).trimEnd());
    });
  }
});

describe("splitIsnad accuracy", () => {
  for (const [split, min] of [["dev", 0.95], ["test", 0.85]] as const) {
    it(`${split} >= ${min}`, () => {
      const set = cases.filter((c) => c.split === split);
      const ok = set.filter((c) => c.acceptMatnStart.includes(c.reference.matnStart)).length;
      expect(ok / set.length).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("splitIsnad edge cases", () => {
  it("returns no split for plain text", () => {
    expect(splitIsnad("الحمد لله رب العالمين")).toEqual({ isnad: "", matn: "الحمد لله رب العالمين", confidence: 0, narrators: [] });
    expect(splitIsnad("")).toEqual({ isnad: "", matn: "", confidence: 0, narrators: [] });
    expect(splitIsnad("حدثنا")).toEqual({ isnad: "", matn: "حدثنا", confidence: 0, narrators: [] });
  });
  it("keeps diacritics and splits on the original text", () => {
    const t = "حَدَّثَنَا مَالِكٌ عَنْ نَافِعٍ عَنِ ابْنِ عُمَرَ أَنَّ رَسُولَ اللَّهِ ﷺ قَالَ لَا يَبِعْ بَعْضُكُمْ";
    const r = splitIsnad(t);
    expect(r.matn).toBe("لَا يَبِعْ بَعْضُكُمْ");
    expect(r.narrators.map((n) => n.name)).toEqual(["مَالِكٌ", "نَافِعٍ", "ابْنِ عُمَرَ"]);
  });
});
