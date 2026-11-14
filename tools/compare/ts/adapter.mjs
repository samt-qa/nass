// Adapter for Ifazawezk/arabic-normalize (TypeScript).
// Usage: node --experimental-strip-types tools/compare/ts/adapter.mjs <path-to-clone>
// Loads <clone>/src/index.ts directly (Node type stripping), so nothing is installed or built.
// Protocol: see tools/compare/README.md (one tab-separated request per line on stdin).
//
// Mapping of nass levels to this library's NormalizeOptions:
//   clean  -> diacritics, alef, lookalikes, tehMarbuta, alefMaqsura, digits: false
//             (invisible, presentationForms, tatweel, whitespace stay on, their defaults)
//   search -> defaults with tehMarbuta: false (nass keeps ة at this level)
//   loose  -> defaults with hamza: true (ة→ه and ؤ→و، ئ→ي; no option drops ء)
//   honorifics: "strip"  -> unsupported (no option removes written honorific phrases)
// Search: findAll(text, query, options) with the same level mapping. It only does
// substring ("phrase") matching, so wholeWord, allWords and anyWord are unsupported.

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createInterface } from "node:readline";

register("./resolve-ts.mjs", import.meta.url);

const clone = process.argv[2];
if (!clone) throw new Error("usage: adapter.mjs <path-to-clone>");
const lib = await import(pathToFileURL(join(clone, "src", "index.ts")).href);

const OFF_FOR_CLEAN = { diacritics: false, alef: false, lookalikes: false, tehMarbuta: false, alefMaqsura: false, hamza: false, digits: false };
const LEVELS = {
  clean: OFF_FOR_CLEAN,
  search: { tehMarbuta: false },
  loose: { hamza: true },
};

const unhex = (h) => Buffer.from(h, "hex").toString("utf8");
const hex = (s) => Buffer.from(s, "utf8").toString("hex");

const out = [];
for await (const line of createInterface({ input: process.stdin })) {
  if (!line) continue;
  const f = line.split("\t");
  if (f[0] === "N") {
    const [, id, level, honorifics, input] = f;
    if (honorifics === "strip") { out.push(`${id}\tU\tno option to remove written honorific phrases`); continue; }
    out.push(`${id}\tN\t${hex(lib.normalize(unhex(input), LEVELS[level]))}`);
  } else if (f[0] === "S") {
    const [, id, level, matchMode, wholeWord, haystack, needle] = f;
    if (matchMode !== "phrase") { out.push(`${id}\tU\tno ${matchMode} mode`); continue; }
    if (wholeWord === "1") { out.push(`${id}\tU\tno whole-word option`); continue; }
    const hits = lib.findAll(unhex(haystack), unhex(needle), LEVELS[level]);
    out.push(`${id}\tS\t${hits.map((m) => `${m.start}:${m.end}`).join(",")}`);
  }
}
process.stdout.write(out.join("\n") + "\n");
