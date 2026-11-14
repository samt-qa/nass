# tools/compare

Runs nass's shared test vectors (`spec/vectors/normalize.json`, `spec/vectors/search.json`)
against other Arabic normalization libraries. The results are written up in
[`docs/comparison.md`](../../docs/comparison.md).

## Reproduce

Requirements: Node 22.6 or later (for type stripping), git, a Rust toolchain (`cargo`) and
the Dart SDK (Flutter's bundled SDK works).

```bash
node tools/compare/run.mjs
```

Options:

- `--work DIR`: where the libraries are cloned and built. Default: `<os tmpdir>/nass-compare`.
  Each library gets its own directory there. Nothing is cloned inside this repository.
- `--only NAME`: run one library (`name` in `competitors.json`).
- `DART=/path/to/dart`: the Dart executable, if `dart` on `PATH` is not usable.

Output: `tools/compare/results/<name>.json` (every case with input, expected and actual)
and `tools/compare/results/summary.md` (counts per family).

## What runs

`competitors.json` pins each library to an exact commit. `run.mjs` clones it (if not
already present in the work directory), checks out that commit, verifies `HEAD`, then
starts the adapter and sends it every case.

| Library | Adapter | How it is loaded |
|---|---|---|
| Ifazawezk/arabic-normalize (TS) | `ts/adapter.mjs` | `src/index.ts` is imported directly with Node's type stripping. `ts/resolve-ts.mjs` maps the sources' `./x.js` imports to `./x.ts`. No `npm install`, no build. The library has no runtime dependencies. |
| AbdeldjalilChougui/arabic-normalize (Rust) | `rust/main.rs` | `run.mjs` writes a throwaway crate in the work directory that depends on the clone by path, and runs `cargo build --release --offline`. It refuses to build if the crate has a `build.rs` or any runtime dependency. The crate is used directly; its Python bindings (pyo3, maturin) are not built. |
| BilalFali/arabic_dev_utils (Dart) | `dart/adapter.dart` | The package depends on the Flutter SDK and `intl`, but `lib/src/text/` and `lib/src/search/` only import `package:meta` (for `@internal`). `run.mjs` writes a `package_config.json` mapping `arabic_dev_utils` to the clone and `meta` to `dart/meta_stub/`. No `pub get`. |

No install, postinstall or build script of any compared library is run. The code that is
run was read first: TS `src/index.ts`, `src/chars.ts`, `src/search.ts`, `src/tokens.ts`;
Rust `src/lib.rs`, `src/stem.rs`, `Cargo.toml`; Dart `lib/src/text/arabic_text.dart`,
`lib/src/text/arabic_cleaner.dart`, `lib/src/search/arabic_search.dart`.

## Protocol

One tab-separated request per line on the adapter's stdin. Strings are UTF-8, hex-encoded,
so tabs, newlines and invisible characters survive.

```
N <key> <level> <honorifics> <hex input>
S <key> <level> <matchMode> <wholeWord 0|1> <hex haystack> <hex needle>
```

Answers, one per line on stdout:

```
<key> N <hex output>            normalize result
<key> S <start>:<end>,...       search hits (UTF-16 offsets into the haystack)
<key> B 0|1                     boolean "contains" only (no offsets)
<key> U <reason>                unsupported
```

`run.mjs` scores the answers. A normalize case passes if the output equals `expected`
exactly. A search case passes if the list of `{start, end, text}` equals `expected`
exactly (`text` is `haystack.slice(start, end)`). `U` and `B` count as unsupported; for `B`
the boolean is also compared with "`expected` is not empty" and reported separately.

## Mapping of nass options

Each adapter's header comment has the same table.

| nass | TS `NormalizeOptions` | Rust `Config` | Dart |
|---|---|---|---|
| `clean` | `diacritics, alef, lookalikes, tehMarbuta, alefMaqsura, hamza, digits: false` (invisible, presentation forms, tatweel, whitespace on) | `Config::none()` + `tatweel` + `bidi_marks` | `removeTatweel(stripInvisibleChars(x))` |
| `search` | defaults, `tehMarbuta: false` | `Config::default()` + `alef_maqsura` + `persian` + `Digits::Western` | `stripInvisibleChars(ArabicText.normalize(x))` |
| `loose` | defaults, `hamza: true` | `Config::search()` | `ArabicSearch.normalizeForSearch(x)` |
| `honorifics: "strip"` | unsupported | unsupported | unsupported |
| `findAll`, phrase | `findAll(text, query, level options)` | unsupported (no find function) | unsupported; `ArabicSearch.matches()` gives a boolean |
| `wholeWord: true` | unsupported | unsupported | unsupported |
| `matchMode: allWords / anyWord` | unsupported | unsupported | unsupported |

Why `search` keeps teh marbuta in TS and Rust: nass's `search` level does not map ة to ه
(that is `loose`, rule L1), so the closest setting turns that option off.

## Families

Normalize cases are grouped by their `rule` field (C1–C5, S1–S7, L1, and combinations such
as `S2+S3`). Cases without a `rule` are `edge` (`norm-edge-*`) or `corpus/<level>`
(`gen-norm-corpus-*`, real hadith text; `+strip` when `honorifics: "strip"`). Search cases
have no `rule`, so they are grouped by option: `phrase`, `phrase/loose`, `wholeWord`,
`allWords`, `anyWord`.

## Adding a library

Add an entry to `competitors.json`, write an adapter that speaks the protocol above, and
add a branch for it in `prepare` in `run.mjs`.
