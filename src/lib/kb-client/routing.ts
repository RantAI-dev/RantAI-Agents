/**
 * Per-knowledge-base routing between the in-process engine and rantai-kb.
 *
 * The migration moves assistants over one knowledge base (one mapel) at a
 * time, so the switch must be per groupId, instant to flip, and instantly
 * reversible without a deploy. That rules out env-var restarts: the table
 * lives in a JSON file on disk (`KB_REMOTE_ROUTES_FILE`) and is re-read when
 * its mtime changes — flip `enabled` (or delete the file) and the next
 * request within the stat window goes the other way.
 *
 * Nothing here talks HTTP: this module only decides *whether* a request is
 * routed and to which remote KB ids. The call is `remote-hybrid.ts`'s job.
 *
 * Failure policy: an unreadable or invalid file keeps the last good table in
 * force (empty if none was ever read) — a half-edited file must not flip every
 * switched KB back at once, and an operator's rollback must not be undone by
 * a parse error. Each distinct problem is logged once, not per request.
 */
import { readFileSync, statSync } from "fs"

/** How often the routes file may be statted: "at most once per ~5 s". */
const DEFAULT_STAT_INTERVAL_MS = 5_000

/** Remote endpoint configuration, read per call so tests (and operators
 *  changing env) are honoured without a restart. */
export interface RemoteKbConfig {
  baseUrl: string
  apiKey: string
  /** Retrieval sits on the answer path, so it must fail fast. */
  timeoutMs: number
}

let warnedMissingKey = false

/**
 * Endpoint for the per-KB remote path. Deliberately separate from
 * KB_SERVICE_URL/KB_SERVICE_API_KEY (the knowledge-search tool's global
 * switch, see ./index.ts) so turning migration routing on cannot change what
 * that tool does. Missing either variable ⇒ no routing, old path everywhere.
 */
export function remoteKbConfig(env: Record<string, string | undefined> = process.env): RemoteKbConfig | null {
  const baseUrl = env.KB_REMOTE_URL?.trim()
  if (!baseUrl) return null
  const apiKey = env.KB_REMOTE_API_KEY?.trim()
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true
      console.warn("[kb-route] KB_REMOTE_URL is set but KB_REMOTE_API_KEY is not — per-KB routing stays off")
    }
    return null
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    timeoutMs: Number(env.KB_REMOTE_TIMEOUT_MS) || 8_000,
  }
}

/** One route-table entry: how a knowledgeBaseGroup id maps to rantai-kb. */
export interface RemoteKbRoute {
  /** rantai-kb knowledge base id this group's documents were migrated into. */
  remoteKbId: string
  /** Explicitly true to route. Absent or false stays on the old engine —
   *  a KB must never be switched by an omission. */
  enabled: boolean
}

/** The parsed routes file. `version` must be exactly 1. */
export interface RouteTable {
  version: 1
  routes: Record<string, RemoteKbRoute>
  /** Grounding threshold override for routed requests (0–1), when set. */
  groundedMinScore?: number
  /** Grounding threshold on the reranker's scale (0–1), used when the remote
   *  engine reranked the chunks. Default 0.5. */
  groundedMinRerank?: number
}

const EMPTY_TABLE: RouteTable = { version: 1, routes: {} }

/**
 * Validate one file's worth of routes. Returns null for anything that is not
 * a well-formed version-1 table — the caller then keeps the last good table,
 * so a bad file degrades to "as before" rather than to a guess.
 */
function parseRouteTable(raw: string): RouteTable | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1) return null
  const routesRaw = obj.routes
  if (typeof routesRaw !== "object" || routesRaw === null || Array.isArray(routesRaw)) return null

  const routes: Record<string, RemoteKbRoute> = {}
  for (const [groupId, entry] of Object.entries(routesRaw as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) return null
    const route = entry as Record<string, unknown>
    if (typeof route.remoteKbId !== "string" || route.remoteKbId.trim() === "") return null
    routes[groupId] = { remoteKbId: route.remoteKbId, enabled: route.enabled === true }
  }

  // Same bounds groundingThreshold() enforces; a bad value is ignored (the
  // default applies) rather than invalidating the whole table.
  const unit = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1 ? v : undefined
  const groundedMinScore = unit(obj.groundedMinScore)
  const groundedMinRerank = unit(obj.groundedMinRerank)

  return {
    version: 1,
    routes,
    ...(groundedMinScore !== undefined ? { groundedMinScore } : {}),
    ...(groundedMinRerank !== undefined ? { groundedMinRerank } : {}),
  }
}

interface RouteFileState {
  /** File this state belongs to; a path change reloads from scratch. */
  path: string
  /** When the file was last statted — the stat itself is throttled. */
  statAt: number
  /** mtime of the content this state already acted on (null: file absent). */
  examinedMtimeMs: number | null
  /** The table in force: the last good parse, or empty. */
  table: RouteTable
  /** Signature of the last problem logged, so each is logged once. */
  warned: string | null
}

let state: RouteFileState | null = null
let statIntervalMs = DEFAULT_STAT_INTERVAL_MS

type ReadResult =
  | { ok: true; table: RouteTable }
  | { ok: false; problem: string; message: string }

function readRouteFile(path: string, mtimeMs: number): ReadResult {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (err) {
    return {
      ok: false,
      problem: `read:${path}:${mtimeMs}`,
      message: `could not read routes file, keeping the last good table: ${
        err instanceof Error ? err.message : err
      }`,
    }
  }
  const table = parseRouteTable(raw)
  if (!table) {
    return {
      ok: false,
      problem: `parse:${path}:${mtimeMs}`,
      message: `invalid routes file (expected { "version": 1, "routes": { "<groupId>": { "remoteKbId": "…", "enabled": true } }, "groundedMinScore": 0.4 }), keeping the last good table: ${path}`,
    }
  }
  return { ok: true, table }
}

function logOnce(signature: string, message: string): void {
  if (state && state.warned === signature) return
  if (state) state.warned = signature
  console.warn(`[kb-route] ${message}`)
}

/**
 * The table in force right now. Stat at most once per `statIntervalMs`; a
 * changed mtime triggers a re-read; an unchanged mtime costs one stat.
 */
function routeTableInForce(env: Record<string, string | undefined>): RouteTable {
  const path = env.KB_REMOTE_ROUTES_FILE?.trim()
  if (!path) return EMPTY_TABLE // unset ⇒ no routing, old path everywhere

  const now = Date.now()
  if (state && state.path === path && now - state.statAt < statIntervalMs) {
    return state.table
  }

  const previous: RouteFileState | null = state && state.path === path ? state : null

  let mtimeMs: number | null = null
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    // handled below like any other stat outcome
  }

  // Same mtime as the content this state already acted on (or still absent):
  // nothing to do but refresh the throttle timestamp.
  if (previous && previous.examinedMtimeMs === mtimeMs) {
    previous.statAt = now
    return previous.table
  }

  if (mtimeMs === null) {
    // Absent file ⇒ routing off, like an unset variable. The last good table
    // is dropped on purpose: removing the file is the documented instant
    // rollback, so it must not keep serving routes.
    state = { path, statAt: now, examinedMtimeMs: null, table: EMPTY_TABLE, warned: null }
    logOnce(`missing:${path}`, `routes file not found, routing off: ${path}`)
    return EMPTY_TABLE
  }

  const read = readRouteFile(path, mtimeMs)
  if (read.ok) {
    state = { path, statAt: now, examinedMtimeMs: mtimeMs, table: read.table, warned: null }
    console.log(`[kb-route] routes loaded: ${Object.keys(read.table.routes).length} route(s) from ${path}`)
    return read.table
  }

  // Unreadable or invalid: keep the last good table in force (empty if none).
  state = { path, statAt: now, examinedMtimeMs: mtimeMs, table: previous?.table ?? EMPTY_TABLE, warned: null }
  logOnce(read.problem, read.message)
  return state.table
}

/** The resolved route for one request. */
export interface RemoteRoute {
  /** rantai-kb knowledge base ids to search, in the request's group order,
   *  deduplicated. */
  remoteKbIds: string[]
  /** The route table's grounding threshold, when it sets one. */
  groundedMinScore?: number
  /** The route table's threshold on the reranker's scale, when it sets one. */
  groundedMinRerank?: number
}

/**
 * Should this request go to rantai-kb, and to which KB ids?
 *
 * Only when the request has at least one groupId AND every groupId has an
 * enabled route — otherwise null and the caller stays on the old engine.
 * A request spanning a routed and an unrouted KB must never merge results
 * from two engines, so it runs entirely on the old one.
 *
 * Tenancy: the remote KB ids come only from the route table, which is keyed
 * by the assistant's already-authorised groupIds (resolved against the
 * organisation's knowledge bases upstream of this call). Nothing in a request
 * body can name a remote KB id; callers cannot reach a tenant whose KB ids
 * are not in the file for groups they already own.
 */
export function resolveRemoteRoute(
  groupIds: string[] | undefined,
  env: Record<string, string | undefined> = process.env,
): RemoteRoute | null {
  if (!groupIds || groupIds.length === 0) return null
  if (remoteKbConfig(env) === null) return null
  const table = routeTableInForce(env)

  const remoteKbIds: string[] = []
  for (const groupId of groupIds) {
    const route = table.routes[groupId]
    if (!route || route.enabled !== true) return null
    if (!remoteKbIds.includes(route.remoteKbId)) remoteKbIds.push(route.remoteKbId)
  }

  return {
    remoteKbIds,
    ...(table.groundedMinScore !== undefined ? { groundedMinScore: table.groundedMinScore } : {}),
    ...(table.groundedMinRerank !== undefined ? { groundedMinRerank: table.groundedMinRerank } : {}),
  }
}

/**
 * Test seam: forget the cached routes-file state and the logged-problem
 * memory so a test can exercise loading from scratch, and optionally shrink
 * the stat throttle. Not for production use.
 */
export function __resetRemoteRouteCacheForTests(options: { statIntervalMs?: number } = {}): void {
  state = null
  statIntervalMs = options.statIntervalMs ?? DEFAULT_STAT_INTERVAL_MS
}
