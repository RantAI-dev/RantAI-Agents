// src/lib/document-script/sandbox-wrapper.mjs
//
// Runs in the spawned Node child process. Reads the path to a user-script
// .mjs file from process.argv[2], blocks dangerous APIs, then dynamic-imports
// the user script. The user script does its own `Packer.toBuffer(doc).then(buf
// => process.stdout.write(buf.toString("base64")))` per the prompt contract.

// D-76: kept symmetrical with `sandbox-loader.mjs:FORBIDDEN_SPECIFIERS`
// — every entry blocked by the loader hook is also globalThis-shadowed
// here so `require("http2")` (via `createRequire`) and other CommonJS
// access paths don't slip through.
const FORBIDDEN_MODULES = [
  "fs", "net", "http", "http2", "https", "child_process", "worker_threads",
  "dgram", "tls", "cluster",
  "node:fs", "node:net", "node:http", "node:http2", "node:https",
  "node:child_process", "node:worker_threads", "node:dgram",
  "node:tls", "node:cluster",
]
for (const m of FORBIDDEN_MODULES) {
  Object.defineProperty(globalThis, m, {
    get() { throw new Error(`forbidden module: ${m}`) },
    configurable: false,
  })
}
globalThis.fetch = () => { throw new Error("forbidden API: fetch") }
// Note: we deliberately do NOT override globalThis.Function. docx pulls in
// `function-bind` transitively, which relies on Function.prototype.bind at
// module-load time; replacing the constructor breaks the import. Per the
// spec's threat model the LLM is trusted-but-fallible (not a malicious
// adversary), so blocking eval-of-strings adds no real defense — the actual
// isolation comes from no-fs / no-net at the module level above.

// Static `import fs from "fs"` resolves via Node's module loader and bypasses
// the globalThis property-shadow. Register an ESM loader hook (runs in a
// dedicated worker, so it can use fs internally without recursion) that
// rejects any import of the forbidden module specifiers above. The hook is
// installed BEFORE the user script is dynamic-imported, so static and dynamic
// `import "fs"` from the user script both fail with `forbidden: fs`.
import { register } from "node:module"
register("./sandbox-loader.mjs", import.meta.url)

const userScriptPath = process.argv[2]
if (!userScriptPath) {
  process.stderr.write("sandbox-wrapper: missing script path argument")
  process.exit(2)
}
await import(userScriptPath)
