/**
 * Manual check: does the SurrealDB client survive a REAL server restart?
 *
 * The unit test (tests/unit/surrealdb/client-reconnect.test.ts) models a socket
 * that goes silent. This runs the same scenarios against an actual SurrealDB so
 * the model can be re-checked whenever the SDK or the server is upgraded.
 *
 *   docker run -d --name surreal-reconnect-test -p 127.0.0.1:18765:8000 \
 *     surrealdb/surrealdb:v2 start --user root --pass root memory
 *   SURREAL_QUERY_TIMEOUT_MS=5000 bun scripts/check-surreal-restart.ts
 *   docker rm -f surreal-reconnect-test
 *
 * Exits 0 when every query after a restart is answered, 1 otherwise.
 */
import { SurrealDBClient } from "../src/lib/surrealdb/client"
import { execSync } from "child_process"

const cfg = { url: "ws://127.0.0.1:18765/rpc", username: "root", password: "root", namespace: "t", database: "t" }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = false

async function timed(label: string, p: Promise<unknown>, capMs = 30_000) {
  const t0 = Date.now()
  const r = await Promise.race([
    p.then(() => "OK").catch((e) => `ERROR ${String((e as Error)?.message).slice(0, 90)}`),
    sleep(capMs).then(() => "HANG"),
  ])
  if (r !== "OK") failed = true
  console.log(`${label}: ${r} in ${Date.now() - t0} ms`)
}

async function restart() {
  execSync("docker restart -t 1 surreal-reconnect-test", { stdio: "ignore" })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch("http://127.0.0.1:18765/health")).ok) return } catch { /* not up yet */ }
    await sleep(250)
  }
  throw new Error("server did not come back")
}

async function main() {
  for (const scenario of ["fresh-auth", "stale-auth", "idle"] as const) {
    await SurrealDBClient.resetInstance().catch(() => {})
    const client = await SurrealDBClient.getInstance(cfg)
    await timed(`[${scenario}] before restart`, client.query("RETURN 1;"))
    await restart()
    if (scenario === "stale-auth") (client as unknown as { lastAuthTime: number }).lastAuthTime = 1
    if (scenario === "idle") (client as unknown as { lastOkAt: number }).lastOkAt = 1
    await timed(`[${scenario}] 1st query after restart`, client.query("RETURN 1;"))
    await timed(`[${scenario}] 2nd query after restart`, client.query("RETURN 2;"))
    await timed(`[${scenario}] health check`, client.healthCheck().then((ok) => { if (!ok) throw new Error("unhealthy") }))
  }
  console.log(failed ? "FAILED" : "PASSED")
  process.exit(failed ? 1 : 0)
}

void main()
