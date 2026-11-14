// Name matching key (SPEC §7). For comparison and indexing, never for display.
import { normalize } from "./normalizer.js";
import * as t from "./tables.g.js";

const titles = new Set(t.trailingTitles);
const kunya = new Map<string, string>();
for (let i = 0; i < t.kunya.length; i += 2) kunya.set(t.kunya[i]!, t.kunya[i + 1]!);
const dhaFollowers = new Set(t.dhaFollowers);
const ibn = new Set(t.ibn);
const bint = new Set(t.bint);

/** A normalized key for comparing and indexing names. Equal keys do NOT mean the same person. */
export function nameKey(name: string): string {
  const base = normalize(name, { level: "search", honorifics: "strip" });
  if (!base) return "";
  const w = base.split(" ");
  while (w.length > 1 && titles.has(w[w.length - 1]!)) w.pop();
  for (let i = 0; i < w.length; i++) {
    const k = kunya.get(w[i]!);
    if (k !== undefined) w[i] = k;
    else if (w[i] === "ذا" && i + 1 < w.length && dhaFollowers.has(w[i + 1]!)) w[i] = "ذو";
    else if (ibn.has(w[i]!)) w[i] = "بن";
    else if (bint.has(w[i]!)) w[i] = "بنت";
  }
  const joined: string[] = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] === "عبد" && i + 1 < w.length) {
      joined.push("عبد" + w[i + 1]);
      i++;
    } else joined.push(w[i]!);
  }
  return normalize(joined.join(" "), { level: "loose" });
}
