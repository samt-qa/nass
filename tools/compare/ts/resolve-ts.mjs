// Module resolve hook: the library's sources import "./chars.js" while the file on disk is
// "./chars.ts" (tsc rewrites nothing, it relies on the build step). When a relative ".js"
// import cannot be found, try the same path with ".ts". Nothing else is changed.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && specifier.endsWith(".js")) {
      return next(specifier.slice(0, -3) + ".ts", context);
    }
    throw err;
  }
}
