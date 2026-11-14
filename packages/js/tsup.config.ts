// Two entries without shared chunks: the core ("@samt-qa/nass") is one self-contained
// file, and "@samt-qa/nass/isnad" imports normalize() from the core entry at run time
// instead of bundling a second copy of the tables.
import type { Plugin } from "esbuild";
import { defineConfig, type Options } from "tsup";

const useCore = (ext: string): Plugin => ({
  name: "isnad-uses-core",
  setup(build) {
    build.onResolve({ filter: /^\.\/normalizer\.js$/ }, (args) =>
      args.importer.endsWith("isnad.ts") ? { path: `./index.${ext}`, external: true } : undefined,
    );
  },
});

const common: Options = { minify: true, target: "es2020", splitting: false, sourcemap: false };
// Arabic word lists stay readable UTF-8 instead of escapes (smaller gzip).
const isnad: Options = {
  ...common,
  entry: ["src/isnad.ts"],
  dts: true,
  esbuildOptions(o) {
    o.charset = "utf8";
  },
};
export default defineConfig([
  { ...common, entry: ["src/index.ts"], format: ["esm", "cjs"], dts: true, clean: true },
  { ...isnad, format: ["esm"], esbuildPlugins: [useCore("js")] },
  { ...isnad, format: ["cjs"], esbuildPlugins: [useCore("cjs")] },
]);
