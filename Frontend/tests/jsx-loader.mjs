/**
 * Node loader hooks that let `node --test` import .jsx components directly.
 * Uses esbuild (already present via Vite) to transform JSX at load time —
 * no new dependencies.
 *
 * Enabled by the "test" npm script via --import (Node >= 23.5 registerHooks).
 * The hooks are synchronous (registerHooks requires it) and MUST delegate
 * pass-through modules via the provided nextLoad function.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { transformSync } from "esbuild";

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Vite-style extensionless relative imports ("../services/currency"):
    // try .jsx/.js/index variants so component sources resolve in raw Node.
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = path.extname(specifier) !== "";
    if (isRelative && !hasExtension && context.parentURL?.startsWith("file:")) {
      const base = path.resolve(
        path.dirname(fileURLToPath(context.parentURL)),
        specifier
      );
      for (const suffix of [".jsx", ".js", "/index.jsx", "/index.js"]) {
        if (existsSync(base + suffix)) {
          return nextResolve(pathToFileURL(base + suffix).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.endsWith(".jsx")) {
      return nextLoad(url, context);
    }
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { code } = transformSync(source, {
      loader: "jsx",
      jsx: "automatic",
      format: "esm",
      target: "node22",
      sourcefile: url,
    });
    return { format: "module", shortCircuit: true, source: code };
  },
});
