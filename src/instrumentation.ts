/**
 * Next.js runs this once per server process, before any route handler.
 *
 * It is the KB composition root: importing "@/lib/kb-runtime" binds the engine
 * ports to the app's prisma/s3/socket/surrealdb implementations. Without it the
 * engine would throw "port is not configured" on first use.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/kb-runtime")
  }
}
