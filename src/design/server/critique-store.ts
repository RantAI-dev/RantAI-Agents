/**
 * Prisma-backed critique-run store for the design SPA.
 *
 * This is the SQLite→Prisma swap for the daemon's critique persistence
 * (reference/open-design/apps/daemon/src/critique/persistence.ts, which wrote
 * `critique_runs` rows through better-sqlite3). The cloud port keeps the exact
 * row shape the daemon exposed (`CritiqueRunRow`, mirroring the shared
 * `CritiqueRoundSummary` / `CritiqueRunStatus` contract types) but persists to
 * the ported `OdCritiqueRun` Prisma model and scopes every read/write through
 * the parent `OdProject` so a run is reachable only when its project belongs to
 * the caller's `{ userId, organizationId }`.
 */
import { prisma } from "@/lib/prisma";
import type {
  CritiquePersistedStatus,
  CritiqueRoundSummary,
  CritiqueRunStatus,
} from "@open-design/contracts/critique";
import type { DesignContext } from "./auth";

export interface CritiqueRunRow {
  id: string;
  projectId: string;
  conversationId: string | null;
  artifactPath: string | null;
  status: CritiquePersistedStatus;
  score: number | null;
  rounds: CritiqueRoundSummary[];
  transcriptPath: string | null;
  protocolVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface CritiqueRunInsert {
  id: string;
  projectId: string;
  conversationId?: string | null;
  artifactPath?: string | null;
  status: CritiquePersistedStatus;
  score?: number | null;
  rounds?: CritiqueRoundSummary[];
  transcriptPath?: string | null;
  protocolVersion: number;
}

export interface CritiqueRunPatch {
  status?: CritiqueRunStatus;
  score?: number | null;
  rounds?: CritiqueRoundSummary[];
  transcriptPath?: string | null;
  artifactPath?: string | null;
}

interface RawRow {
  id: string;
  projectId: string;
  conversationId: string | null;
  artifactPath: string | null;
  status: string;
  score: number | null;
  roundsJson: string;
  transcriptPath: string | null;
  protocolVersion: number;
  createdAt: bigint;
  updatedAt: bigint;
}

function parseRounds(json: string): CritiqueRoundSummary[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as CritiqueRoundSummary[];
    if (parsed !== null && typeof parsed === "object") {
      const rounds = (parsed as { rounds?: unknown }).rounds;
      return Array.isArray(rounds) ? (rounds as CritiqueRoundSummary[]) : [];
    }
    return [];
  } catch {
    return [];
  }
}

function normalizeRow(raw: RawRow): CritiqueRunRow {
  return {
    id: raw.id,
    projectId: raw.projectId,
    conversationId: raw.conversationId,
    artifactPath: raw.artifactPath,
    status: raw.status as CritiquePersistedStatus,
    score: raw.score,
    rounds: parseRounds(raw.roundsJson),
    transcriptPath: raw.transcriptPath,
    protocolVersion: Number(raw.protocolVersion),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
}

/** Verify a project belongs to the caller. Returns true when owned. */
export async function isProjectOwned(
  ctx: DesignContext,
  projectId: string,
): Promise<boolean> {
  const project = await prisma.odProject.findFirst({
    where: { id: projectId, userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  return project !== null;
}

/** Insert a critique run row. Callers must verify project ownership first. */
export async function insertCritiqueRun(
  input: CritiqueRunInsert,
): Promise<CritiqueRunRow> {
  const now = BigInt(Date.now());
  const row = await prisma.odCritiqueRun.create({
    data: {
      id: input.id,
      projectId: input.projectId,
      conversationId: input.conversationId ?? null,
      artifactPath: input.artifactPath ?? null,
      status: input.status,
      score: input.score ?? null,
      roundsJson: JSON.stringify(input.rounds ?? []),
      transcriptPath: input.transcriptPath ?? null,
      protocolVersion: input.protocolVersion,
      createdAt: now,
      updatedAt: now,
    },
  });
  return normalizeRow(row as RawRow);
}

/** Patch a critique run row. Returns the updated row, or null when missing. */
export async function updateCritiqueRun(
  id: string,
  patch: CritiqueRunPatch,
): Promise<CritiqueRunRow | null> {
  const data: Record<string, unknown> = { updatedAt: BigInt(Date.now()) };
  if (patch.status !== undefined) data.status = patch.status;
  if ("score" in patch) data.score = patch.score ?? null;
  if (patch.rounds !== undefined) data.roundsJson = JSON.stringify(patch.rounds);
  if ("transcriptPath" in patch) data.transcriptPath = patch.transcriptPath ?? null;
  if ("artifactPath" in patch) data.artifactPath = patch.artifactPath ?? null;

  try {
    const row = await prisma.odCritiqueRun.update({ where: { id }, data });
    return normalizeRow(row as RawRow);
  } catch {
    return null;
  }
}

/** List a project's critique runs, newest-first. Scoped by project ownership. */
export async function listCritiqueRunsByProject(
  ctx: DesignContext,
  projectId: string,
): Promise<CritiqueRunRow[] | null> {
  if (!(await isProjectOwned(ctx, projectId))) return null;
  const rows = await prisma.odCritiqueRun.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => normalizeRow(r as RawRow));
}

/** Fetch one critique run by id, scoped to a project owned by the caller. */
export async function getCritiqueRun(
  ctx: DesignContext,
  projectId: string,
  runId: string,
): Promise<CritiqueRunRow | null> {
  if (!(await isProjectOwned(ctx, projectId))) return null;
  const row = await prisma.odCritiqueRun.findFirst({
    where: { id: runId, projectId },
  });
  return row ? normalizeRow(row as RawRow) : null;
}
