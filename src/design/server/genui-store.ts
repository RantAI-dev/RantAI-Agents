/**
 * Prisma-backed GenUI surface persistence for the design SPA.
 *
 * This is the SQLite -> Prisma swap of upstream open-design's GenUI surface
 * store (apps/daemon/src/genui/store.ts). The daemon persisted generative-UI
 * surface answers in a single-writer SQLite `genui_surfaces` table so a
 * confirmation / choice / oauth-prompt answered once could be reused across
 * conversations and runs (spec §10.3.3 F8 cross-conversation cache). The cloud
 * port keeps the exact wire JSON shape the daemon returned (see the daemon's
 * `SurfaceRow`) but persists to the ported `OdGenuiSurface` Prisma model,
 * scoped by the parent `OdProject`'s `{ userId, organizationId }` — every read
 * and write is gated on the caller owning the project the surface hangs off.
 *
 * Port adaptations:
 *   - The daemon's table declares `plugin_snapshot_id` NOT NULL with a real
 *     applied-plugin snapshot FK. The ported model makes it nullable (its FK is
 *     ON DELETE SET NULL), and user-driven surface state here has no plugin
 *     snapshot, so `pluginSnapshotId` defaults to null. A caller may pass an
 *     existing snapshot id through, but the FK is its responsibility.
 *   - Runs are not ported (`projects-store.ts`), so surface persistence lives at
 *     the project (and conversation) tier; the run tier is accepted but never
 *     cross-run cached.
 */
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { DesignContext } from "./auth";

export type GenuiSurfaceStatus =
  | "pending"
  | "resolved"
  | "timeout"
  | "invalidated";
export type GenuiSurfaceTier = "run" | "conversation" | "project";
export type GenuiSurfaceRespondedBy = "user" | "agent" | "auto" | "cache";
export type GenuiSurfaceKind = "form" | "choice" | "confirmation" | "oauth-prompt";

/** Wire shape mirroring the daemon's `SurfaceRow` (camelCase, ms timestamps). */
export interface GenuiSurfaceDTO {
  id: string;
  projectId: string;
  conversationId: string | null;
  runId: string | null;
  pluginSnapshotId: string | null;
  surfaceId: string;
  kind: GenuiSurfaceKind;
  persist: GenuiSurfaceTier;
  schemaDigest: string | null;
  value: unknown;
  status: GenuiSurfaceStatus;
  respondedBy: GenuiSurfaceRespondedBy | null;
  requestedAt: number;
  respondedAt: number | null;
  expiresAt: number | null;
}

interface OdGenuiSurfaceRow {
  id: string;
  projectId: string;
  conversationId: string | null;
  runId: string | null;
  pluginSnapshotId: string | null;
  surfaceId: string;
  kind: string;
  persist: string;
  schemaDigest: string | null;
  valueJson: string | null;
  status: string;
  respondedBy: string | null;
  requestedAt: bigint;
  respondedAt: bigint | null;
  expiresAt: bigint | null;
}

function mapSurface(row: OdGenuiSurfaceRow): GenuiSurfaceDTO {
  let value: unknown = null;
  if (row.valueJson) {
    try {
      value = JSON.parse(row.valueJson);
    } catch {
      value = null;
    }
  }
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    runId: row.runId,
    pluginSnapshotId: row.pluginSnapshotId,
    surfaceId: row.surfaceId,
    kind: row.kind as GenuiSurfaceKind,
    persist: row.persist as GenuiSurfaceTier,
    schemaDigest: row.schemaDigest,
    value,
    status: row.status as GenuiSurfaceStatus,
    respondedBy: (row.respondedBy as GenuiSurfaceRespondedBy | null) ?? null,
    requestedAt: Number(row.requestedAt),
    respondedAt: row.respondedAt == null ? null : Number(row.respondedAt),
    expiresAt: row.expiresAt == null ? null : Number(row.expiresAt),
  };
}

/**
 * Stable digest of a JSON-Schema-shaped object (ported from the daemon's
 * `genui/registry.ts`). Canonical key order ensures parsing twice → same
 * digest, so a schema upgrade auto-invalidates a cached answer.
 */
export function schemaDigest(schema: unknown): string {
  if (schema === undefined || schema === null) return "";
  const canonical = canonicalize(schema);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** True when the project exists and is owned by the caller's scope. */
async function projectOwned(
  ctx: DesignContext,
  projectId: string,
): Promise<boolean> {
  const row = await prisma.odProject.findFirst({
    where: {
      id: projectId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * List every persisted surface for a project (newest-requested first),
 * mirroring the daemon's `GET /api/projects/:projectId/genui`. Scoped: rows are
 * filtered through the project relation so a caller only ever sees surfaces on
 * projects it owns. Returns null when the project is missing / not owned.
 */
export async function listGenuiSurfacesForProject(
  ctx: DesignContext,
  projectId: string,
): Promise<GenuiSurfaceDTO[] | null> {
  if (!(await projectOwned(ctx, projectId))) return null;
  const rows = await prisma.odGenuiSurface.findMany({
    where: { projectId },
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(mapSurface);
}

/**
 * Fetch the latest surface row for a `(projectId, surfaceId)` pair. Returns
 * null when the project is missing / not owned or no such surface exists.
 */
export async function getLatestGenuiSurface(
  ctx: DesignContext,
  projectId: string,
  surfaceId: string,
): Promise<GenuiSurfaceDTO | null> {
  if (!(await projectOwned(ctx, projectId))) return null;
  const row = await prisma.odGenuiSurface.findFirst({
    where: { projectId, surfaceId },
    orderBy: { requestedAt: "desc" },
  });
  return row ? mapSurface(row) : null;
}

export interface WriteGenuiSurfaceInput {
  surfaceId: string;
  value: unknown;
  kind?: GenuiSurfaceKind;
  persist?: GenuiSurfaceTier;
  conversationId?: string | null;
  runId?: string | null;
  pluginSnapshotId?: string | null;
  /** Raw JSON-Schema; hashed to a `schemaDigest` (invalidates on change). */
  schema?: unknown;
  /** Pre-computed digest (takes precedence over `schema`). */
  schemaDigest?: string | null;
  respondedBy?: GenuiSurfaceRespondedBy;
  expiresAt?: number | null;
}

function resolveDigest(input: WriteGenuiSurfaceInput): string | null {
  if (input.schemaDigest !== undefined) return input.schemaDigest;
  if (input.schema !== undefined) return schemaDigest(input.schema);
  return null;
}

/**
 * Pre-answer a surface (daemon `POST /api/projects/:projectId/genui/prefill`,
 * `od ui prefill`). Always inserts a fresh `resolved` row so a later lookup hits
 * the cache and skips the broadcast. Returns null when the project is not owned.
 */
export async function prefillGenuiSurface(
  ctx: DesignContext,
  projectId: string,
  input: WriteGenuiSurfaceInput,
): Promise<GenuiSurfaceDTO | null> {
  if (!(await projectOwned(ctx, projectId))) return null;
  const now = BigInt(Date.now());
  const row = await prisma.odGenuiSurface.create({
    data: {
      id: randomUUID(),
      projectId,
      conversationId: input.conversationId ?? null,
      runId: input.runId ?? null,
      pluginSnapshotId: input.pluginSnapshotId ?? null,
      surfaceId: input.surfaceId,
      kind: input.kind ?? "confirmation",
      persist: input.persist ?? "project",
      schemaDigest: resolveDigest(input),
      valueJson: JSON.stringify(input.value ?? null),
      status: "resolved",
      respondedBy: input.respondedBy ?? "auto",
      requestedAt: now,
      respondedAt: now,
      expiresAt: input.expiresAt != null ? BigInt(input.expiresAt) : null,
    },
  });
  return mapSurface(row);
}

/**
 * Idempotent upsert of a resolved surface answer (`PUT
 * /api/projects/:projectId/genui/:surfaceId`). Updates the latest
 * non-invalidated row for the pair in place, or inserts a fresh resolved row
 * when none exists. Returns null when the project is not owned.
 */
export async function putResolvedGenuiSurface(
  ctx: DesignContext,
  projectId: string,
  input: WriteGenuiSurfaceInput,
): Promise<GenuiSurfaceDTO | null> {
  if (!(await projectOwned(ctx, projectId))) return null;
  const now = BigInt(Date.now());
  const existing = await prisma.odGenuiSurface.findFirst({
    where: {
      projectId,
      surfaceId: input.surfaceId,
      status: { not: "invalidated" },
    },
    orderBy: { requestedAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    const updated = await prisma.odGenuiSurface.update({
      where: { id: existing.id },
      data: {
        valueJson: JSON.stringify(input.value ?? null),
        status: "resolved",
        respondedBy: input.respondedBy ?? "user",
        respondedAt: now,
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.persist !== undefined ? { persist: input.persist } : {}),
        ...(input.conversationId !== undefined
          ? { conversationId: input.conversationId ?? null }
          : {}),
        ...(resolveDigest(input) !== null
          ? { schemaDigest: resolveDigest(input) }
          : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt != null ? BigInt(input.expiresAt) : null }
          : {}),
      },
    });
    return mapSurface(updated);
  }
  return prefillGenuiSurface(ctx, projectId, {
    ...input,
    respondedBy: input.respondedBy ?? "user",
  });
}

/**
 * Cross-conversation revoke (daemon `POST
 * /api/projects/:projectId/genui/:surfaceId/revoke`). Flips every matching
 * non-invalidated row to `invalidated`; returns the number of rows changed, or
 * null when the project is not owned.
 */
export async function revokeGenuiSurface(
  ctx: DesignContext,
  projectId: string,
  surfaceId: string,
): Promise<number | null> {
  if (!(await projectOwned(ctx, projectId))) return null;
  const result = await prisma.odGenuiSurface.updateMany({
    where: { projectId, surfaceId, status: { not: "invalidated" } },
    data: { status: "invalidated" },
  });
  return result.count;
}
