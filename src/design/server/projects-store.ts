/**
 * Prisma-backed project store for the design SPA.
 *
 * This is the SQLite→Prisma swap: upstream open-design's daemon stored projects
 * in a local SQLite `projects` table (apps/daemon/src/db.ts). The cloud port
 * keeps the exact API JSON shape the daemon returned (see `mapProject` /
 * `mapProjectForList` below, mirroring the daemon's `normalizeProject` +
 * `composeProjectDisplayStatus`) but persists to the ported `OdProject` /
 * `OdConversation` Prisma models, scoped by `{ userId, organizationId }`.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  DeployProviderId,
  DeploymentInfo,
  DeploymentStatus,
  Project,
  ProjectMetadata,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

const MAX_PROJECT_ID_LEN = 128;

/** Mirrors the daemon's `isSafeId` (apps/daemon/src/projects.ts). */
export function isSafeId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > MAX_PROJECT_ID_LEN) return false;
  if (/^\.+$/.test(id)) return false; // reject `.`, `..`, `...`, etc.
  return /^[A-Za-z0-9._-]+$/.test(id);
}

/** The OdProject scalar subset this store reads. Structurally compatible with
 *  the full Prisma model return (relations omitted). */
interface OdProjectRecord {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  pendingPrompt: string | null;
  metadataJson: string | null;
  customInstructions: string | null;
  appliedPluginSnapshotId: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}

function parseMetadata(json: string | null): ProjectMetadata | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as ProjectMetadata;
  } catch {
    return undefined;
  }
}

/**
 * Map a row to the daemon's project JSON shape. `undefined` optional keys are
 * dropped by JSON serialization, matching the daemon's `?? undefined` fields.
 * BigInt timestamps are narrowed to `number` (the wire shape the SPA parses).
 */
function mapProject(row: OdProjectRecord): Project {
  return {
    id: row.id,
    name: row.name,
    skillId: row.skillId,
    designSystemId: row.designSystemId,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    pendingPrompt: row.pendingPrompt ?? undefined,
    metadata: parseMetadata(row.metadataJson),
    appliedPluginSnapshotId: row.appliedPluginSnapshotId ?? undefined,
    customInstructions: row.customInstructions ?? undefined,
  };
}

/**
 * List variant: adds the derived `status`. Runs aren't ported yet, so every
 * project reports `not_started` (the daemon's default when no run exists).
 */
function mapProjectForList(row: OdProjectRecord): Project {
  return { ...mapProject(row), status: { value: "not_started" } };
}

function scopeWhere(ctx: DesignContext): Prisma.OdProjectWhereInput {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

export async function listDesignProjects(ctx: DesignContext): Promise<Project[]> {
  const rows = await prisma.odProject.findMany({
    where: scopeWhere(ctx),
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapProjectForList);
}

export async function getDesignProject(
  ctx: DesignContext,
  id: string,
): Promise<Project | null> {
  const row = await prisma.odProject.findFirst({
    where: { id, ...scopeWhere(ctx) },
  });
  return row ? mapProject(row) : null;
}

export interface CreateDesignProjectInput {
  id: string;
  name: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  metadata?: unknown;
  customInstructions?: string | null;
}

export interface CreateDesignProjectResult {
  project: Project;
  conversationId: string;
}

function stringifyMetadata(metadata: unknown): string | null {
  return metadata && typeof metadata === "object"
    ? JSON.stringify(metadata)
    : null;
}

export async function createDesignProject(
  ctx: DesignContext,
  input: CreateDesignProjectInput,
): Promise<CreateDesignProjectResult> {
  const now = BigInt(Date.now());
  const conversationId = randomUUID();

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.odProject.create({
      data: {
        id: input.id,
        name: input.name.trim(),
        skillId: input.skillId ?? null,
        designSystemId: input.designSystemId ?? null,
        pendingPrompt: input.pendingPrompt ?? null,
        metadataJson: stringifyMetadata(input.metadata),
        customInstructions:
          typeof input.customInstructions === "string"
            ? input.customInstructions
            : null,
        createdAt: now,
        updatedAt: now,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
    });
    // Seed a default conversation so the UI always has somewhere to write —
    // mirrors the daemon's POST /api/projects behavior.
    await tx.odConversation.create({
      data: {
        id: conversationId,
        projectId: project.id,
        title: null,
        sessionMode: "design",
        createdAt: now,
        updatedAt: now,
      },
    });
    return project;
  });

  return { project: mapProject(created), conversationId };
}

export interface UpdateDesignProjectInput {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  metadata?: unknown;
  customInstructions?: string | null;
}

export async function updateDesignProject(
  ctx: DesignContext,
  id: string,
  patch: UpdateDesignProjectInput,
): Promise<Project | null> {
  // Verify ownership before mutating; keeps scoping identical to reads.
  const existing = await prisma.odProject.findFirst({
    where: { id, ...scopeWhere(ctx) },
  });
  if (!existing) return null;

  const data: Prisma.OdProjectUncheckedUpdateInput = {
    updatedAt: BigInt(Date.now()),
  };
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.skillId !== undefined) data.skillId = patch.skillId;
  if (patch.designSystemId !== undefined) {
    data.designSystemId = patch.designSystemId;
  }
  if (patch.pendingPrompt !== undefined) data.pendingPrompt = patch.pendingPrompt;
  if (patch.metadata !== undefined) {
    data.metadataJson = stringifyMetadata(patch.metadata);
  }
  if (patch.customInstructions !== undefined) {
    data.customInstructions = patch.customInstructions;
  }

  const updated = await prisma.odProject.update({ where: { id }, data });
  return mapProject(updated);
}

/** Deletes a project (scoped). Prisma relations cascade to conversations, tabs,
 *  deployments, etc. Returns false when nothing matched (not owned / missing). */
export async function deleteDesignProject(
  ctx: DesignContext,
  id: string,
): Promise<boolean> {
  const result = await prisma.odProject.deleteMany({
    where: { id, ...scopeWhere(ctx) },
  });
  return result.count > 0;
}

/** The OdDeployment scalar subset this store reads (relations omitted). */
interface OdDeploymentRecord {
  id: string;
  projectId: string;
  fileName: string;
  providerId: string;
  url: string;
  deploymentId: string | null;
  deploymentCount: number;
  target: string;
  status: string;
  statusMessage: string | null;
  reachableAt: bigint | null;
  createdAt: bigint;
  updatedAt: bigint;
}

/**
 * Map an OdDeployment row to the daemon's "public" DeploymentInfo JSON shape
 * (server.ts `publicDeployment`: normalized row minus `providerMetadata`).
 * `undefined` optional keys are dropped by JSON serialization.
 */
function mapDeployment(row: OdDeploymentRecord): DeploymentInfo {
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    providerId: row.providerId as DeployProviderId,
    url: row.url,
    deploymentId: row.deploymentId ?? undefined,
    deploymentCount: row.deploymentCount,
    target: "preview",
    status: row.status as DeploymentStatus,
    statusMessage: row.statusMessage ?? undefined,
    reachableAt: row.reachableAt != null ? Number(row.reachableAt) : undefined,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

/**
 * List a project's deployments, newest-first, in the daemon's
 * `ProjectDeploymentsResponse.deployments` shape. Scoped by verifying the
 * project is owned by the caller first (mirrors the daemon's per-project
 * ownership); returns null when the project is missing / not owned.
 */
export async function listDesignDeployments(
  ctx: DesignContext,
  projectId: string,
): Promise<DeploymentInfo[] | null> {
  const project = await prisma.odProject.findFirst({
    where: { id: projectId, ...scopeWhere(ctx) },
    select: { id: true },
  });
  if (!project) return null;
  const rows = await prisma.odDeployment.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapDeployment);
}
