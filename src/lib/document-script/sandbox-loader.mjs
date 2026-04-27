// src/lib/document-script/sandbox-loader.mjs
//
// ESM loader hook registered by sandbox-wrapper.mjs. Runs in a dedicated
// worker thread (per Node's `module.register()` contract), so its own use of
// fs to load other modules does not recurse through this hook in a way that
// blocks the loader itself. Rejects bare imports of forbidden Node built-ins
// at resolution time. The user script's `import fs from "fs"` therefore
// surfaces as a `forbidden: fs` error before any fs method runs.

const FORBIDDEN_SPECIFIERS = new Set([
  "fs", "fs/promises",
  "net", "http", "http2", "https",
  "child_process", "worker_threads",
  "dgram", "tls", "cluster",
  "node:fs", "node:fs/promises",
  "node:net", "node:http", "node:http2", "node:https",
  "node:child_process", "node:worker_threads",
  "node:dgram", "node:tls", "node:cluster",
])

export async function resolve(specifier, context, nextResolve) {
  if (FORBIDDEN_SPECIFIERS.has(specifier)) {
    throw new Error(`forbidden: ${specifier}`)
  }
  return nextResolve(specifier, context)
}
