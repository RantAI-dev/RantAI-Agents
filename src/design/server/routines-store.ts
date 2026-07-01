/**
 * Prisma-backed routines store for the design SPA.
 *
 * SQLite→Prisma swap for upstream open-design's routine tables (apps/daemon's
 * `db.ts` `routines` / `routine_runs`). Keeps the exact API JSON shape the
 * daemon's routine routes returned (`routineRowToContract` mirrors the daemon's
 * `routineDbRowToContract` in apps/daemon/src/routes/routine.ts) but persists to
 * the ported `OdRoutine` / `OdRoutineRun` Prisma models, scoped by
 * `{ userId, organizationId }`.
 *
 * Scheduling + execution are intentionally NOT ported here: those require the
 * desktop agent-runtime plus an in-process scheduler. `nextRunAt` therefore
 * reports `null` — which is exactly the value the daemon itself returns when no
 * `routineService` is attached (`routineService?.nextRunAt(id) ?? null`) — and
 * routine runs stay empty until an executor lands. The `run` / `crystallize`
 * endpoints are stubbed in the route layer for the same reason.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateRoutineRequest,
  Routine,
  RoutineLastRunSummary,
  RoutineProjectTarget,
  RoutineRun,
  RoutineRunStatus,
  RoutineRunTrigger,
  RoutineSchedule,
  RunContextSelection,
  UpdateRoutineRequest,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

/** Thrown for user-input problems; the route layer maps these to a 400. */
export class RoutineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineValidationError";
  }
}

/** The OdRoutine scalar subset this store maps (relations omitted). */
interface OdRoutineRecord {
  id: string;
  name: string;
  prompt: string;
  scheduleKind: string;
  scheduleValue: string;
  scheduleJson: string | null;
  projectMode: string;
  projectId: string | null;
  skillId: string | null;
  agentId: string | null;
  contextJson: string | null;
  enabled: number;
  createdAt: bigint;
  updatedAt: bigint;
}

/** The OdRoutineRun scalar subset this store maps. */
interface OdRoutineRunRecord {
  id: string;
  routineId: string;
  trigger: string;
  status: string;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  startedAt: bigint;
  completedAt: bigint | null;
  summary: string | null;
  error: string | null;
  errorCode: string | null;
}

// ---- Validation (ported from apps/daemon/src/routines.ts) -----------------

function isValidWallTime(time: unknown): boolean {
  if (typeof time !== "string") return false;
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return false;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

function isValidTimezone(tz: unknown): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validateSchedule(schedule: unknown): void {
  if (!schedule || typeof schedule !== "object") {
    throw new RoutineValidationError("schedule is required");
  }
  const s = schedule as { kind?: string; [k: string]: unknown };
  if (s.kind === "hourly") {
    const m = s.minute;
    if (!Number.isInteger(m) || (m as number) < 0 || (m as number) > 59) {
      throw new RoutineValidationError("hourly.minute must be an integer 0-59");
    }
    return;
  }
  if (s.kind === "daily" || s.kind === "weekdays" || s.kind === "weekly") {
    if (!isValidWallTime(s.time)) {
      throw new RoutineValidationError(`Invalid time: ${String(s.time)}`);
    }
    if (!isValidTimezone(s.timezone)) {
      throw new RoutineValidationError(`Invalid timezone: ${String(s.timezone)}`);
    }
    if (s.kind === "weekly") {
      const w = s.weekday;
      if (!Number.isInteger(w) || (w as number) < 0 || (w as number) > 6) {
        throw new RoutineValidationError("weekly.weekday must be 0-6");
      }
    }
    return;
  }
  throw new RoutineValidationError(`Unsupported schedule kind: ${String(s.kind)}`);
}

async function validateTarget(
  ctx: DesignContext,
  target: unknown,
): Promise<void> {
  if (!target || typeof target !== "object") {
    throw new RoutineValidationError("target is required");
  }
  const t = target as { mode?: string; projectId?: unknown };
  if (t.mode === "create_each_run") return;
  if (t.mode === "reuse") {
    if (!t.projectId || typeof t.projectId !== "string") {
      throw new RoutineValidationError("Reuse target requires a projectId");
    }
    // Ownership check replaces the daemon's local getProject: the reuse target
    // must be a project owned by the same user/org scope.
    const project = await prisma.odProject.findFirst({
      where: { id: t.projectId, userId: ctx.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!project) {
      throw new RoutineValidationError(`target project ${t.projectId} not found`);
    }
    return;
  }
  throw new RoutineValidationError(
    `Unsupported routine target mode: ${String(t.mode)}`,
  );
}

function cleanStringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new RoutineValidationError(`${field} must be an array`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") throw new RoutineValidationError(`${field} must contain strings`);
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeRoutineContext(value: unknown): RunContextSelection {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RoutineValidationError("context must be an object");
  }
  const input = value as Record<string, unknown>;
  const context = {
    skillIds: cleanStringList(input.skillIds, "context.skillIds"),
    pluginIds: cleanStringList(input.pluginIds, "context.pluginIds"),
    mcpServerIds: cleanStringList(input.mcpServerIds, "context.mcpServerIds"),
    connectorIds: cleanStringList(input.connectorIds, "context.connectorIds"),
  };
  return Object.fromEntries(
    Object.entries(context).filter(([, ids]) => ids.length > 0),
  ) as RunContextSelection;
}

function parseStoredRoutineContext(json: string | null): RunContextSelection {
  if (!json) return {};
  try {
    return normalizeRoutineContext(JSON.parse(json));
  } catch {
    return {};
  }
}

function scheduleToDbCols(schedule: RoutineSchedule): {
  scheduleKind: string;
  scheduleValue: string;
  scheduleJson: string;
} {
  const json = JSON.stringify(schedule);
  let value = "";
  if (schedule.kind === "hourly") value = String(schedule.minute);
  else if (schedule.kind === "weekly") value = `${schedule.weekday}:${schedule.time}`;
  else value = schedule.time;
  return { scheduleKind: schedule.kind, scheduleValue: value, scheduleJson: json };
}

// ---- Mapping (ported from routineDbRowToContract) -------------------------

function mapRoutineRun(row: OdRoutineRunRecord): RoutineRun {
  return {
    id: row.id,
    routineId: row.routineId,
    trigger: row.trigger as RoutineRunTrigger,
    status: row.status as RoutineRunStatus,
    projectId: row.projectId,
    conversationId: row.conversationId,
    agentRunId: row.agentRunId,
    startedAt: Number(row.startedAt),
    completedAt: row.completedAt == null ? null : Number(row.completedAt),
    summary: row.summary,
    error: row.error,
    errorCode: row.errorCode,
  };
}

function routineRowToContract(
  row: OdRoutineRecord,
  latestRun: OdRoutineRunRecord | null,
): Routine {
  let schedule: RoutineSchedule | null = null;
  if (row.scheduleJson) {
    try {
      schedule = JSON.parse(row.scheduleJson) as RoutineSchedule;
    } catch {
      schedule = null;
    }
  }
  if (!schedule) {
    schedule = {
      kind: (row.scheduleKind || "daily") as RoutineSchedule["kind"],
      time: row.scheduleValue || "09:00",
      timezone: "UTC",
    } as RoutineSchedule;
  }
  const target: RoutineProjectTarget =
    row.projectMode === "reuse" && row.projectId
      ? { mode: "reuse", projectId: row.projectId }
      : { mode: "create_each_run" };
  const lastRun: RoutineLastRunSummary | null = latestRun
    ? {
        runId: latestRun.id,
        status: latestRun.status as RoutineRunStatus,
        trigger: latestRun.trigger as RoutineRunTrigger,
        startedAt: Number(latestRun.startedAt),
        ...(latestRun.completedAt == null
          ? {}
          : { completedAt: Number(latestRun.completedAt) }),
        projectId: latestRun.projectId,
        conversationId: latestRun.conversationId,
        agentRunId: latestRun.agentRunId,
        ...(latestRun.summary ? { summary: latestRun.summary } : {}),
        ...(latestRun.error ? { error: latestRun.error } : {}),
        ...(latestRun.errorCode ? { errorCode: latestRun.errorCode } : {}),
      }
    : null;
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    schedule,
    target,
    skillId: row.skillId ?? null,
    agentId: row.agentId ?? null,
    context: parseStoredRoutineContext(row.contextJson),
    enabled: row.enabled === 1,
    // No scheduler runs in the cloud port, mirroring the daemon's null when
    // routineService is absent. The DB is the source of truth; timing is not.
    nextRunAt: null,
    lastRun,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

// ---- Store API ------------------------------------------------------------

function scopeWhere(ctx: DesignContext): Prisma.OdRoutineWhereInput {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

const LATEST_RUN_INCLUDE = {
  runs: { orderBy: { startedAt: "desc" }, take: 1 },
} satisfies Prisma.OdRoutineInclude;

export async function listRoutines(ctx: DesignContext): Promise<Routine[]> {
  const rows = await prisma.odRoutine.findMany({
    where: scopeWhere(ctx),
    orderBy: { createdAt: "desc" },
    include: LATEST_RUN_INCLUDE,
  });
  return rows.map((row) => routineRowToContract(row, row.runs[0] ?? null));
}

export async function getRoutine(
  ctx: DesignContext,
  id: string,
): Promise<Routine | null> {
  const row = await prisma.odRoutine.findFirst({
    where: { id, ...scopeWhere(ctx) },
    include: LATEST_RUN_INCLUDE,
  });
  return row ? routineRowToContract(row, row.runs[0] ?? null) : null;
}

export async function createRoutine(
  ctx: DesignContext,
  body: CreateRoutineRequest,
): Promise<Routine> {
  if (!body || typeof body !== "object") {
    throw new RoutineValidationError("Request body must be an object");
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    throw new RoutineValidationError("name is required");
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    throw new RoutineValidationError("prompt is required");
  }
  validateSchedule(body.schedule);
  await validateTarget(ctx, body.target);
  const context = normalizeRoutineContext(body.context);

  const id = `routine-${randomUUID()}`;
  const now = BigInt(Date.now());
  const scheduleCols = scheduleToDbCols(body.schedule);
  const created = await prisma.odRoutine.create({
    data: {
      id,
      name: body.name.trim(),
      prompt: body.prompt,
      scheduleKind: scheduleCols.scheduleKind,
      scheduleValue: scheduleCols.scheduleValue,
      scheduleJson: scheduleCols.scheduleJson,
      projectMode: body.target.mode,
      projectId: body.target.mode === "reuse" ? body.target.projectId : null,
      skillId: body.skillId ?? null,
      agentId: body.agentId ?? null,
      contextJson: JSON.stringify(context),
      enabled: body.enabled !== false ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    },
  });
  return routineRowToContract(created, null);
}

/** Returns `null` when the routine does not exist / is not owned (→ 404).
 *  Throws {@link RoutineValidationError} for invalid input (→ 400). */
export async function updateRoutine(
  ctx: DesignContext,
  id: string,
  body: UpdateRoutineRequest,
): Promise<Routine | null> {
  const existing = await prisma.odRoutine.findFirst({
    where: { id, ...scopeWhere(ctx) },
    select: { id: true },
  });
  if (!existing) return null;
  if (!body || typeof body !== "object") {
    throw new RoutineValidationError("Request body must be an object");
  }

  const data: Prisma.OdRoutineUncheckedUpdateInput = {
    updatedAt: BigInt(Date.now()),
  };
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new RoutineValidationError("name is required");
    }
    data.name = body.name.trim();
  }
  if (body.prompt !== undefined) {
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      throw new RoutineValidationError("prompt is required");
    }
    data.prompt = body.prompt;
  }
  if (body.schedule !== undefined) {
    validateSchedule(body.schedule);
    const cols = scheduleToDbCols(body.schedule);
    data.scheduleKind = cols.scheduleKind;
    data.scheduleValue = cols.scheduleValue;
    data.scheduleJson = cols.scheduleJson;
  }
  if (body.target !== undefined) {
    await validateTarget(ctx, body.target);
    data.projectMode = body.target.mode;
    data.projectId = body.target.mode === "reuse" ? body.target.projectId : null;
  }
  if (body.skillId !== undefined) data.skillId = body.skillId ?? null;
  if (body.agentId !== undefined) data.agentId = body.agentId ?? null;
  if (body.context !== undefined) {
    data.contextJson = JSON.stringify(normalizeRoutineContext(body.context));
  }
  if (body.enabled !== undefined) data.enabled = body.enabled ? 1 : 0;

  await prisma.odRoutine.update({ where: { id }, data });
  return getRoutine(ctx, id);
}

/** Returns `false` when nothing matched (not owned / missing). */
export async function deleteRoutine(
  ctx: DesignContext,
  id: string,
): Promise<boolean> {
  const result = await prisma.odRoutine.deleteMany({
    where: { id, ...scopeWhere(ctx) },
  });
  return result.count > 0;
}

/** Returns `null` when the routine does not exist / is not owned (→ 404),
 *  otherwise the run history (newest first, capped at `limit`). */
export async function listRoutineRuns(
  ctx: DesignContext,
  routineId: string,
  limit: number,
): Promise<RoutineRun[] | null> {
  const routine = await prisma.odRoutine.findFirst({
    where: { id: routineId, ...scopeWhere(ctx) },
    select: { id: true },
  });
  if (!routine) return null;
  const runs = await prisma.odRoutineRun.findMany({
    where: { routineId },
    orderBy: { startedAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
  });
  return runs.map(mapRoutineRun);
}

/** Verifies a routine is owned by the caller — used by run/crystallize stubs to
 *  return the daemon's 404 shape before reporting the missing executor. */
export async function routineExists(
  ctx: DesignContext,
  id: string,
): Promise<boolean> {
  const row = await prisma.odRoutine.findFirst({
    where: { id, ...scopeWhere(ctx) },
    select: { id: true },
  });
  return Boolean(row);
}
