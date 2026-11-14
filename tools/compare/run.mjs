#!/usr/bin/env node
// Run spec/vectors/normalize.json and spec/vectors/search.json against other Arabic
// normalization libraries, through one adapter per library. See tools/compare/README.md.
//
// Usage: node tools/compare/run.mjs [--work DIR] [--only NAME]
//   --work  where the libraries are cloned and built (default: <os tmpdir>/nass-compare).
//           Each library gets its own directory there; nothing is cloned inside this repo.
//   --only  run one library (its "name" in competitors.json).
// Writes tools/compare/results/<name>.json and tools/compare/results/summary.md.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const work = resolve(opt("--work", join(tmpdir(), "nass-compare")));
const only = opt("--only");

const { competitors } = JSON.parse(readFileSync(join(here, "competitors.json"), "utf8"));
const normV = JSON.parse(readFileSync(join(root, "spec", "vectors", "normalize.json"), "utf8"));
const searchV = JSON.parse(readFileSync(join(root, "spec", "vectors", "search.json"), "utf8"));

function sh(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} failed (${r.status}):\n${r.stderr}\n${r.error ?? ""}`);
  return r.stdout;
}

// --- families ---------------------------------------------------------------
function normFamily(c) {
  if (c.rule) return c.rule;
  if (c.id.startsWith("norm-edge")) return "edge";
  return `corpus/${c.level}${c.options?.honorifics === "strip" ? "+strip" : ""}`;
}
function searchFamily(c) {
  const o = c.options ?? {};
  if (o.matchMode && o.matchMode !== "phrase") return o.matchMode;
  if (o.wholeWord) return "wholeWord";
  if (o.level === "loose") return "phrase/loose";
  return "phrase";
}

// --- requests ---------------------------------------------------------------
const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const unhex = (h) => Buffer.from(h, "hex").toString("utf8");
const cases = new Map(); // key -> {file, case, family}
const lines = [];
for (const c of normV.cases) {
  const key = `n:${c.id}`;
  cases.set(key, { file: "normalize", c, family: normFamily(c) });
  lines.push(["N", key, c.level, c.options?.honorifics ?? "keep", hex(c.input)].join("\t"));
}
for (const c of searchV.cases) {
  const key = `s:${c.id}`;
  const o = c.options ?? {};
  cases.set(key, { file: "search", c, family: searchFamily(c) });
  lines.push(["S", key, o.level ?? "search", o.matchMode ?? "phrase", o.wholeWord ? "1" : "0", hex(c.haystack), hex(c.needle)].join("\t"));
}
const requests = lines.join("\n") + "\n";

// --- checkout ---------------------------------------------------------------
function checkout(comp) {
  const dir = join(work, comp.name);
  const repo = join(dir, "repo");
  if (!existsSync(repo)) {
    mkdirSync(dir, { recursive: true });
    if (readdirSync(dir).length) throw new Error(`${dir} is not empty`);
    sh("git", ["clone", "--quiet", "--no-checkout", comp.repo, repo]);
    sh("git", ["-C", repo, "-c", "advice.detachedHead=false", "checkout", "--quiet", comp.commit]);
  }
  const head = sh("git", ["-C", repo, "rev-parse", "HEAD"]).trim();
  if (head !== comp.commit) throw new Error(`${repo} is at ${head}, expected ${comp.commit}`);
  return { dir, repo };
}

// --- adapters ---------------------------------------------------------------
const exe = process.platform === "win32" ? ".exe" : "";
const prepare = {
  ts({ repo }) {
    return ["node", ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", join(here, "ts", "adapter.mjs"), repo]];
  },
  rust({ dir, repo }) {
    // Refuse to build if the crate would run code at build time or pull in dependencies.
    if (existsSync(join(repo, "build.rs"))) throw new Error("crate has build.rs; not built");
    const manifest = readFileSync(join(repo, "Cargo.toml"), "utf8");
    const deps = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(manifest)?.[1].trim();
    if (deps) throw new Error(`crate has runtime dependencies; not built:\n${deps}`);
    const crate = join(dir, "adapter");
    mkdirSync(join(crate, "src"), { recursive: true });
    copyFileSync(join(here, "rust", "main.rs"), join(crate, "src", "main.rs"));
    writeFileSync(join(crate, "Cargo.toml"), [
      "[package]", 'name = "nass-compare-rust"', 'version = "0.0.0"', 'edition = "2021"', "publish = false", "",
      "[dependencies]", `arabic-normalize = { path = ${JSON.stringify(repo.replaceAll("\\", "/"))} }`, "",
      "[workspace]", "",
    ].join("\n"));
    sh("cargo", ["build", "--release", "--offline", "--quiet", "--manifest-path", join(crate, "Cargo.toml")]);
    return [join(crate, "target", "release", `nass-compare-rust${exe}`), []];
  },
  dart({ dir, repo }) {
    const config = join(dir, "package_config.json");
    writeFileSync(config, JSON.stringify({
      configVersion: 2,
      packages: [
        { name: "arabic_dev_utils", rootUri: pathToFileURL(repo).href + "/", packageUri: "lib/", languageVersion: "3.12" },
        { name: "meta", rootUri: pathToFileURL(join(here, "dart", "meta_stub")).href + "/", packageUri: "lib/", languageVersion: "3.0" },
      ],
    }, null, 2));
    return [dartExecutable(), [`--packages=${config}`, join(here, "dart", "adapter.dart")]];
  },
};

// On Windows `dart` on PATH is often Flutter's dart.bat, which Node cannot spawn without a
// shell. Use $DART if set, else the dart.exe next to it in the bundled SDK.
function dartExecutable() {
  if (process.env.DART) return process.env.DART;
  if (process.platform !== "win32") return "dart";
  for (const p of sh("where", ["dart"]).split(/\r?\n/).filter(Boolean)) {
    if (p.toLowerCase().endsWith(".exe")) return p;
    const bundled = join(dirname(p), "cache", "dart-sdk", "bin", "dart.exe");
    if (existsSync(bundled)) return bundled;
  }
  return "dart.exe";
}

// --- scoring ----------------------------------------------------------------
function score(comp, stdout) {
  const got = new Map();
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line) continue;
    const [key, kind, payload = ""] = line.split("\t");
    got.set(key, { kind, payload });
  }
  const results = [];
  for (const [key, { file, c, family }] of cases) {
    const r = got.get(key);
    if (!r) throw new Error(`${comp.name}: no answer for ${key}`);
    const base = { file, id: c.id, family };
    if (r.kind === "U") { results.push({ ...base, status: "unsupported", reason: r.payload }); continue; }
    if (r.kind === "B") {
      const want = c.expected.length > 0;
      results.push({ ...base, status: "unsupported", reason: "no positions; boolean only", bool: { want, got: r.payload === "1", agree: want === (r.payload === "1") } });
      continue;
    }
    if (r.kind === "N") {
      const actual = unhex(r.payload);
      const status = actual === c.expected ? "pass" : "fail";
      // A failure that disappears once runs of whitespace are collapsed and trimmed (rule C5).
      const whitespaceOnly = status === "fail" && actual.replace(/\s+/gu, " ").trim() === c.expected;
      results.push({ ...base, status, ...(whitespaceOnly ? { whitespaceOnly } : {}), input: c.input, level: c.level, options: c.options, expected: c.expected, actual });
      continue;
    }
    if (r.kind === "S") {
      const actual = r.payload ? r.payload.split(",").map((p) => {
        const [start, end] = p.split(":").map(Number);
        return { start, end, text: c.haystack.slice(start, end) };
      }) : [];
      const ok = JSON.stringify(actual) === JSON.stringify(c.expected.map(({ start, end, text }) => ({ start, end, text })));
      results.push({ ...base, status: ok ? "pass" : "fail", haystack: c.haystack, needle: c.needle, options: c.options, expected: c.expected, actual });
      continue;
    }
    throw new Error(`${comp.name}: bad answer kind ${r.kind} for ${key}`);
  }
  return results;
}

function tally(results) {
  const t = {};
  for (const r of results) {
    const k = `${r.file}\t${r.family}`;
    t[k] ??= { pass: 0, fail: 0, unsupported: 0, wsOnly: 0, boolAgree: 0, boolTotal: 0 };
    t[k][r.status]++;
    if (r.whitespaceOnly) t[k].wsOnly++;
    if (r.bool) { t[k].boolTotal++; if (r.bool.agree) t[k].boolAgree++; }
  }
  return t;
}

// --- main -------------------------------------------------------------------
mkdirSync(join(here, "results"), { recursive: true });
const summary = [];
const date = new Date().toISOString().slice(0, 10);
for (const comp of competitors) {
  if (only && comp.name !== only) continue;
  let results;
  try {
    const where = checkout(comp);
    const [cmd, argv] = prepare[comp.adapter](where);
    const r = spawnSync(cmd, argv, { input: requests, encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`adapter exited ${r.status}:\n${r.stderr}\n${r.error ?? ""}`);
    results = score(comp, r.stdout);
  } catch (err) {
    console.error(`${comp.name}: not run\n${err.message}`);
    summary.push(`## ${comp.label}\n\nNot run: ${err.message.split("\n")[0]}\n`);
    continue;
  }
  const t = tally(results);
  writeFileSync(join(here, "results", `${comp.name}.json`), JSON.stringify({
    library: comp.label, repo: comp.repo, commit: comp.commit, date,
    specVersion: normV.specVersion, totals: t, results,
  }, null, 1) + "\n");

  const rows = Object.entries(t).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  const sum = (file) => rows.filter(([k]) => k.startsWith(file + "\t")).reduce((a, [, v]) => ({
    pass: a.pass + v.pass, fail: a.fail + v.fail, unsupported: a.unsupported + v.unsupported,
    wsOnly: a.wsOnly + v.wsOnly, boolAgree: a.boolAgree + v.boolAgree, boolTotal: a.boolTotal + v.boolTotal,
  }), { pass: 0, fail: 0, unsupported: 0, wsOnly: 0, boolAgree: 0, boolTotal: 0 });
  const md = [`## ${comp.label}`, "", `Commit \`${comp.commit}\` (${comp.commitDate}), run ${date}.`, ""];
  for (const file of ["normalize", "search"]) {
    const hasBool = sum(file).boolTotal > 0;
    md.push(`| ${file} family | pass | fail${file === "normalize" ? " (whitespace only)" : ""} | unsupported |${hasBool ? " bool agrees |" : ""}`, `|---|--:|--:|--:|${hasBool ? "--:|" : ""}`);
    for (const [k, v] of rows.filter(([k]) => k.startsWith(file + "\t"))) {
      md.push(`| ${k.split("\t")[1]} | ${v.pass} | ${v.fail}${v.wsOnly ? ` (${v.wsOnly})` : ""} | ${v.unsupported} |${hasBool ? ` ${v.boolTotal ? `${v.boolAgree}/${v.boolTotal}` : ""} |` : ""}`);
    }
    const s = sum(file);
    md.push(`| **total** | **${s.pass}** | **${s.fail}**${s.wsOnly ? ` (${s.wsOnly})` : ""} | **${s.unsupported}** |${hasBool ? ` **${s.boolAgree}/${s.boolTotal}** |` : ""}`, "");
  }
  summary.push(md.join("\n"));
  const n = sum("normalize"), s = sum("search");
  console.log(`${comp.label}\n  normalize: ${n.pass} pass, ${n.fail} fail (${n.wsOnly} whitespace only), ${n.unsupported} unsupported\n  search:    ${s.pass} pass, ${s.fail} fail, ${s.unsupported} unsupported${s.boolTotal ? ` (boolean contains agrees ${s.boolAgree}/${s.boolTotal})` : ""}`);
}
if (!only) writeFileSync(join(here, "results", "summary.md"), `# Results (generated by tools/compare/run.mjs)\n\n${summary.join("\n")}`);
