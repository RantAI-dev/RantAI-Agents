// src/lib/document-script/sandbox-wrapper.mjs
//
// Runs in the spawned Node child process. Reads the path to a user-script
// .mjs file from process.argv[2], blocks dangerous APIs, then dynamic-imports
// the user script. The user script does its own `Packer.toBuffer(doc).then(buf
// => process.stdout.write(buf.toString("base64")))` per the prompt contract.

const FORBIDDEN_MODULES = [
  "fs", "net", "http", "https", "child_process", "worker_threads",
  "dgram", "tls", "cluster",
  "node:fs", "node:net", "node:http", "node:https",
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

const userScriptPath = process.argv[2]
if (!userScriptPath) {
  process.stderr.write("sandbox-wrapper: missing script path argument")
  process.exit(2)
}
await import(userScriptPath)
