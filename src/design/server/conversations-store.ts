/**
 * Prisma-backed conversations + messages store for the design SPA.
 *
 * This is the SQLite→Prisma swap for the daemon's conversation/message tables
 * (apps/daemon/src/db.ts: insertConversation / listConversations / getConversation
 * / updateConversation / deleteConversation / listMessages / upsertMessage). The
 * cloud port keeps the daemon's exact API JSON shapes — `Conversation` (with the
 * derived `messageCount` / `latestRun` / `totalDurationMs`) and `ChatMessage`
 * (with its JSON side-columns parsed back out) — but persists to the ported
 * `OdConversation` / `OdMessage` Prisma models.
 *
 * Every read/write is scoped through the parent `OdProject`: a conversation is
 * reachable only when its project belongs to the caller's `{ userId,
 * organizationId }`. This is the multi-tenant swap of the daemon's single-user,
 * unauthenticated local store.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type {
  ChatMessage,
  ChatRunStatus,
  ChatSessionMode,
  Conversation,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

// ---------------------------------------------------------------------------
// Row shapes (scalar subsets of the Prisma models; relations omitted).
// ---------------------------------------------------------------------------

interface OdConversationRow {
  id: string;
  projectId: string;
  title: string | null;
  sessionMode: string;
  createdAt: bigint;
  updatedAt: bigint;
}

interface OdMessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  agentId: string | null;
  agentName: string | null;
  eventsJson: string | null;
  attachmentsJson: string | null;
  commentAttachmentsJson: string | null;
  producedFilesJson: string | null;
  feedbackJson: string | null;
  preTurnFileNamesJson: string | null;
  sessionMode: string | null;
  runContextJson: string | null;
  appliedPluginSnapshotJson: string | null;
  runId: string | null;
  runStatus: string | null;
  lastRunEventId: string | null;
  startedAt: bigint | null;
  endedAt: bigint | null;
  position: number;
  createdAt: bigint;
}

// ---------------------------------------------------------------------------
// Shared helpers (mirror the daemon's normalize* + run-summary helpers).
// ---------------------------------------------------------------------------

/** Mirrors the daemon's `normalizeConversationSessionMode`. */
function normalizeSessionMode(value: unknown): ChatSessionMode {
  return value === "chat" ? "chat" : "design";
}

/** Mirrors the daemon's `normalizeMessageSessionMode` (undefined when unset). */
function normalizeMessageSessionMode(value: unknown): ChatSessionMode | undefined {
  return value === "chat" || value === "design" ? value : undefined;
}

/** Mirrors the daemon's `normalizeMessageSessionModeForStorage`. */
function normalizeMessageSessionModeForStorage(
  value: unknown,
): ChatSessionMode | null {
  return value === "chat" || value === "design" ? value : null;
}

function parseJsonOrUndef(s: unknown): unknown {
  if (typeof s !== "string" || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function stringifyOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function bigIntOrNull(value: unknown): bigint | null {
  return typeof value === "number" && Number.isFinite(value)
    ? BigInt(Math.trunc(value))
    : null;
}

/** Mirrors the daemon's `latestUsageDurationMs`. */
function latestUsageDurationMs(eventsJson: unknown): number | undefined {
  if (typeof eventsJson !== "string" || eventsJson.length === 0) return undefined;
  try {
    const events = JSON.parse(eventsJson);
    if (!Array.isArray(events)) return undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (
        event &&
        typeof event === "object" &&
        event.kind === "usage" &&
        typeof event.durationMs === "number" &&
        Number.isFinite(event.durationMs)
      ) {
        return Math.max(0, event.durationMs);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

type ConversationRunSummary = NonNullable<Conversation["latestRun"]>;

/** Mirrors the daemon's `conversationRunSummaryFromRow`. */
function conversationRunSummaryFromRow(row: {
  runStatus: string | null;
  startedAt: bigint | null;
  endedAt: bigint | null;
  eventsJson: string | null;
}): ConversationRunSummary | null {
  if (typeof row.runStatus !== "string") return null;
  const startedAt = row.startedAt == null ? undefined : Number(row.startedAt);
  const endedAt = row.endedAt == null ? undefined : Number(row.endedAt);
  const usageDurationMs = latestUsageDurationMs(row.eventsJson);
  const durationMs =
    startedAt != null &&
    Number.isFinite(startedAt) &&
    endedAt != null &&
    Number.isFinite(endedAt)
      ? Math.max(0, endedAt - startedAt)
      : usageDurationMs;
  return {
    status: row.runStatus as ChatRunStatus,
    ...(startedAt != null && Number.isFinite(startedAt) ? { startedAt } : {}),
    ...(endedAt != null && Number.isFinite(endedAt) ? { endedAt } : {}),
    ...(typeof durationMs === "number" && Number.isFinite(durationMs)
      ? { durationMs }
      : {}),
  };
}

/** Per-conversation aggregates derived from the assistant messages, mirroring
 *  the daemon's `latest_runs` / `message_counts` / `total_run_durations` CTEs. */
interface ConversationAggregate {
  messageCount: number;
  latestRun?: ConversationRunSummary;
  totalDurationMs?: number;
}

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "canceled"]);

function terminalRunDurationMs(row: {
  runStatus: string | null;
  startedAt: bigint | null;
  endedAt: bigint | null;
  eventsJson: string | null;
}): number {
  if (row.startedAt != null && row.endedAt != null) {
    const started = Number(row.startedAt);
    const ended = Number(row.endedAt);
    return ended >= started ? ended - started : 0;
  }
  const usage = latestUsageDurationMs(row.eventsJson);
  return typeof usage === "number" ? usage : 0;
}

/**
 * Compute the per-conversation aggregates for a set of conversation ids in a
 * bounded number of queries (one count group-by + one assistant-message scan).
 */
async function computeAggregates(
  conversationIds: string[],
): Promise<Map<string, ConversationAggregate>> {
  const out = new Map<string, ConversationAggregate>();
  for (const id of conversationIds) out.set(id, { messageCount: 0 });
  if (conversationIds.length === 0) return out;

  const counts = await prisma.odMessage.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: conversationIds } },
    _count: { _all: true },
  });
  for (const c of counts) {
    const agg = out.get(c.conversationId);
    if (agg) agg.messageCount = c._count._all;
  }

  // Assistant messages that carry a run status, ordered so the last row per
  // conversation is the latest (highest position) — mirrors the daemon's
  // ROW_NUMBER() OVER (PARTITION BY conversation ORDER BY position DESC).
  const runRows = (await prisma.odMessage.findMany({
    where: {
      conversationId: { in: conversationIds },
      role: "assistant",
      runStatus: { not: null },
    },
    select: {
      conversationId: true,
      runStatus: true,
      startedAt: true,
      endedAt: true,
      eventsJson: true,
      position: true,
    },
    orderBy: { position: "asc" },
  })) as Array<{
    conversationId: string;
    runStatus: string | null;
    startedAt: bigint | null;
    endedAt: bigint | null;
    eventsJson: string | null;
    position: number;
  }>;

  for (const row of runRows) {
    const agg = out.get(row.conversationId);
    if (!agg) continue;
    // Latest wins because rows are ascending by position.
    const summary = conversationRunSummaryFromRow(row);
    if (summary) agg.latestRun = summary;
    if (row.runStatus && TERMINAL_RUN_STATUSES.has(row.runStatus)) {
      agg.totalDurationMs =
        (agg.totalDurationMs ?? 0) + terminalRunDurationMs(row);
    }
  }
  return out;
}

function mapConversation(
  row: OdConversationRow,
  agg: ConversationAggregate,
): Conversation {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title ?? null,
    sessionMode: normalizeSessionMode(row.sessionMode),
    messageCount: agg.messageCount,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    ...(agg.totalDurationMs != null
      ? { totalDurationMs: agg.totalDurationMs }
      : {}),
    ...(agg.latestRun ? { latestRun: agg.latestRun } : {}),
  };
}

/** Mirrors the daemon's `normalizeMessage`. */
function mapMessage(row: OdMessageRow): ChatMessage {
  const message: ChatMessage = {
    id: row.id,
    role: (row.role === "assistant" ? "assistant" : "user") as ChatMessage["role"],
    content: row.content,
    agentId: row.agentId ?? undefined,
    agentName: row.agentName ?? undefined,
    runId: row.runId ?? undefined,
    runStatus: (row.runStatus ?? undefined) as ChatRunStatus | undefined,
    lastRunEventId: row.lastRunEventId ?? undefined,
    events: parseJsonOrUndef(row.eventsJson) as ChatMessage["events"],
    attachments: parseJsonOrUndef(row.attachmentsJson) as ChatMessage["attachments"],
    commentAttachments: parseJsonOrUndef(
      row.commentAttachmentsJson,
    ) as ChatMessage["commentAttachments"],
    producedFiles: parseJsonOrUndef(
      row.producedFilesJson,
    ) as ChatMessage["producedFiles"],
    feedback: parseJsonOrUndef(row.feedbackJson) as ChatMessage["feedback"],
    preTurnFileNames: parseJsonOrUndef(
      row.preTurnFileNamesJson,
    ) as ChatMessage["preTurnFileNames"],
    sessionMode: normalizeMessageSessionMode(row.sessionMode),
    runContext: parseJsonOrUndef(row.runContextJson) as ChatMessage["runContext"],
    appliedPluginSnapshot: parseJsonOrUndef(
      row.appliedPluginSnapshotJson,
    ) as ChatMessage["appliedPluginSnapshot"],
    createdAt: row.createdAt == null ? undefined : Number(row.createdAt),
    startedAt: row.startedAt == null ? undefined : Number(row.startedAt),
    endedAt: row.endedAt == null ? undefined : Number(row.endedAt),
  };
  return message;
}

// ---------------------------------------------------------------------------
// Ownership helpers.
// ---------------------------------------------------------------------------

async function projectIsOwned(
  ctx: DesignContext,
  projectId: string,
): Promise<boolean> {
  const project = await prisma.odProject.findFirst({
    where: {
      id: projectId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    },
    select: { id: true },
  });
  return project != null;
}

/** Fetch a conversation only when it belongs to a project owned by the caller. */
async function findOwnedConversation(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<OdConversationRow | null> {
  const row = await prisma.odConversation.findFirst({
    where: {
      id: conversationId,
      projectId,
      project: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      sessionMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row;
}

// ---------------------------------------------------------------------------
// Conversations.
// ---------------------------------------------------------------------------

/**
 * List a project's conversations, newest-activity first. Returns `null` when the
 * project doesn't exist / isn't owned by the caller (route → 404), mirroring the
 * daemon's `getProject` guard on `GET /api/projects/:id/conversations`.
 */
export async function listDesignConversations(
  ctx: DesignContext,
  projectId: string,
): Promise<Conversation[] | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;
  const rows = (await prisma.odConversation.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      projectId: true,
      title: true,
      sessionMode: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as OdConversationRow[];
  const agg = await computeAggregates(rows.map((r) => r.id));
  return rows.map((r) => mapConversation(r, agg.get(r.id) ?? { messageCount: 0 }));
}

/**
 * Fetch a single conversation with its derived aggregates, or `null` when it
 * doesn't exist / isn't owned.
 */
export async function getDesignConversation(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const row = await findOwnedConversation(ctx, projectId, conversationId);
  if (!row) return null;
  const agg = await computeAggregates([row.id]);
  return mapConversation(row, agg.get(row.id) ?? { messageCount: 0 });
}

export interface CreateDesignConversationInput {
  title?: string | null;
  sessionMode?: ChatSessionMode;
  /** Present iff the request explicitly set `sessionMode`. */
  hasExplicitSessionMode?: boolean;
  seedFromConversationId?: string | null;
  forkAfterMessageId?: string | null;
  seedMessages?: ChatMessage[] | null;
}

/**
 * Create a conversation, optionally seeding it with a copy of another
 * conversation's messages (Side Chat / Fork). Mirrors the daemon's
 * `POST /api/projects/:id/conversations`. Returns `null` when the project isn't
 * owned by the caller.
 */
export async function createDesignConversation(
  ctx: DesignContext,
  projectId: string,
  input: CreateDesignConversationInput,
): Promise<Conversation | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;

  const now = Date.now();
  const requestedForkMessageId =
    typeof input.forkAfterMessageId === "string" && input.forkAfterMessageId
      ? input.forkAfterMessageId
      : null;

  // Resolve the source conversation (same project only) for seed-from + session
  // mode inheritance.
  const source =
    typeof input.seedFromConversationId === "string" &&
    input.seedFromConversationId
      ? await findOwnedConversation(ctx, projectId, input.seedFromConversationId)
      : null;

  // Prefer the client-supplied snapshot (the chat "Fork" action sends the exact
  // messages up to the fork point) over reading the source from the DB.
  const clientSeed = Array.isArray(input.seedMessages)
    ? input.seedMessages.filter(
        (m) => m && typeof m.role === "string",
      )
    : null;

  let seedMessages: ChatMessage[] = [];
  if (clientSeed && clientSeed.length > 0) {
    seedMessages = clientSeed;
    if (requestedForkMessageId) {
      const forkIndex = seedMessages.findIndex(
        (m) => m.id === requestedForkMessageId,
      );
      if (forkIndex >= 0) seedMessages = seedMessages.slice(0, forkIndex + 1);
    }
  } else if (source) {
    const sourceMessages = await listMessagesRaw(source.id);
    seedMessages = sourceMessages;
    if (requestedForkMessageId) {
      const forkIndex = seedMessages.findIndex(
        (m) => m.id === requestedForkMessageId,
      );
      // Fork point not found: seed nothing rather than 404-ing the create.
      seedMessages = forkIndex < 0 ? [] : seedMessages.slice(0, forkIndex + 1);
    }
  }

  const sessionMode: ChatSessionMode = input.hasExplicitSessionMode
    ? normalizeSessionMode(input.sessionMode)
    : source
      ? normalizeSessionMode(source.sessionMode)
      : "design";

  const conversationId = randomUUID();
  await prisma.odConversation.create({
    data: {
      id: conversationId,
      projectId,
      title:
        typeof input.title === "string" ? input.title.trim() || null : null,
      sessionMode,
      createdAt: BigInt(now),
      updatedAt: BigInt(now),
    },
  });

  // Copy seed messages with fresh ids; drop the source's run pointers so a
  // copied still-running assistant turn doesn't render a perpetual spinner.
  for (const m of seedMessages) {
    await writeMessageRaw(conversationId, {
      ...m,
      id: randomUUID(),
      runId: undefined,
      runStatus: undefined,
      lastRunEventId: undefined,
    });
  }

  return getDesignConversation(ctx, projectId, conversationId);
}

export interface UpdateDesignConversationInput {
  title?: string | null;
  sessionMode?: ChatSessionMode;
  updatedAt?: number;
}

/**
 * Patch a conversation's title / session mode. Mirrors the daemon's
 * `PATCH /api/projects/:id/conversations/:cid`. Returns `null` when not found /
 * not owned.
 */
export async function updateDesignConversation(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
  patch: UpdateDesignConversationInput,
): Promise<Conversation | null> {
  const existing = await findOwnedConversation(ctx, projectId, conversationId);
  if (!existing) return null;

  const data: {
    title?: string | null;
    sessionMode?: ChatSessionMode;
    updatedAt: bigint;
  } = {
    updatedAt:
      typeof patch.updatedAt === "number"
        ? BigInt(Math.trunc(patch.updatedAt))
        : BigInt(Date.now()),
  };
  if ("title" in patch) {
    data.title =
      typeof patch.title === "string" ? patch.title : patch.title ?? null;
  }
  if ("sessionMode" in patch) {
    data.sessionMode = normalizeSessionMode(patch.sessionMode);
  }

  await prisma.odConversation.update({
    where: { id: conversationId },
    data,
  });
  return getDesignConversation(ctx, projectId, conversationId);
}

/**
 * Delete a conversation (cascades to its messages via the Prisma relation).
 * Returns `false` when nothing matched (not found / not owned). Mirrors the
 * daemon's `DELETE /api/projects/:id/conversations/:cid`.
 */
export async function deleteDesignConversation(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  const existing = await findOwnedConversation(ctx, projectId, conversationId);
  if (!existing) return false;
  await prisma.odConversation.delete({ where: { id: conversationId } });
  return true;
}

// ---------------------------------------------------------------------------
// Messages.
// ---------------------------------------------------------------------------

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  agentId: true,
  agentName: true,
  eventsJson: true,
  attachmentsJson: true,
  commentAttachmentsJson: true,
  producedFilesJson: true,
  feedbackJson: true,
  preTurnFileNamesJson: true,
  sessionMode: true,
  runContextJson: true,
  appliedPluginSnapshotJson: true,
  runId: true,
  runStatus: true,
  lastRunEventId: true,
  startedAt: true,
  endedAt: true,
  position: true,
  createdAt: true,
} as const;

/** Internal: list a conversation's messages without an ownership check. */
async function listMessagesRaw(conversationId: string): Promise<ChatMessage[]> {
  const rows = (await prisma.odMessage.findMany({
    where: { conversationId },
    orderBy: { position: "asc" },
    select: MESSAGE_SELECT,
  })) as OdMessageRow[];
  return rows.map(mapMessage);
}

/**
 * List a conversation's messages, in order. Returns `null` when the conversation
 * doesn't exist / isn't owned (route → 404). Mirrors the daemon's
 * `GET /api/projects/:id/conversations/:cid/messages` (minus the daemon-only
 * brand-extraction backfill, which has no cloud analogue).
 */
export async function listDesignMessages(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<ChatMessage[] | null> {
  const conv = await findOwnedConversation(ctx, projectId, conversationId);
  if (!conv) return null;
  return listMessagesRaw(conversationId);
}

/** Internal: upsert one message and bump the conversation's activity clock.
 *  Mirrors the daemon's `upsertMessage` (position assignment + JSON columns). */
async function writeMessageRaw(
  conversationId: string,
  m: ChatMessage & { telemetryFinalized?: boolean },
): Promise<ChatMessage | null> {
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.odMessage.findUnique({
      where: { id: m.id },
      select: { id: true },
    });

    const common = {
      role: m.role,
      content: m.content,
      agentId: m.agentId ?? null,
      agentName: m.agentName ?? null,
      runId: m.runId ?? null,
      runStatus: m.runStatus ?? null,
      lastRunEventId: m.lastRunEventId ?? null,
      eventsJson: stringifyOrNull(m.events),
      attachmentsJson: stringifyOrNull(m.attachments),
      commentAttachmentsJson: stringifyOrNull(m.commentAttachments),
      producedFilesJson: stringifyOrNull(m.producedFiles),
      feedbackJson: stringifyOrNull(m.feedback),
      preTurnFileNamesJson: stringifyOrNull(m.preTurnFileNames),
      sessionMode: normalizeMessageSessionModeForStorage(m.sessionMode),
      runContextJson: stringifyOrNull(m.runContext),
      appliedPluginSnapshotJson: stringifyOrNull(m.appliedPluginSnapshot),
      startedAt: bigIntOrNull(m.startedAt),
      endedAt: bigIntOrNull(m.endedAt),
    };

    if (existing) {
      await tx.odMessage.update({
        where: { id: m.id },
        data: {
          ...common,
          // Stamp telemetry finalization once (COALESCE-on-first behavior).
          ...(m.telemetryFinalized === true
            ? { telemetryFinalizedAt: BigInt(now) }
            : {}),
        },
      });
    } else {
      const max = await tx.odMessage.aggregate({
        where: { conversationId },
        _max: { position: true },
      });
      const position = (max._max.position ?? -1) + 1;
      const createdAt =
        typeof m.createdAt === "number" && Number.isFinite(m.createdAt)
          ? BigInt(Math.trunc(m.createdAt))
          : BigInt(now);
      await tx.odMessage.create({
        data: {
          id: m.id,
          conversationId,
          ...common,
          telemetryFinalizedAt: m.telemetryFinalized === true ? BigInt(now) : null,
          position,
          createdAt,
        },
      });
    }

    // Bump conversation activity so the sidebar's recency sort works.
    await tx.odConversation.update({
      where: { id: conversationId },
      data: { updatedAt: BigInt(now) },
    });
  });

  const row = (await prisma.odMessage.findUnique({
    where: { id: m.id },
    select: MESSAGE_SELECT,
  })) as OdMessageRow | null;
  return row ? mapMessage(row) : null;
}

/**
 * Upsert a message by id (position auto-assigned for new rows). Bumps the parent
 * conversation and project `updatedAt` so both re-order in their lists. Returns
 * `null` when the conversation doesn't exist / isn't owned. Mirrors the daemon's
 * `PUT /api/projects/:id/conversations/:cid/messages/:mid` (minus telemetry
 * reporting, which has no cloud analogue). This is a plain persistence endpoint,
 * distinct from the run/generation streaming path.
 */
export async function upsertDesignMessage(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
  message: ChatMessage & { telemetryFinalized?: boolean },
): Promise<ChatMessage | null> {
  const conv = await findOwnedConversation(ctx, projectId, conversationId);
  if (!conv) return null;
  const saved = await writeMessageRaw(conversationId, message);
  // Bump the parent project's updatedAt so the project list re-orders.
  await prisma.odProject.update({
    where: { id: projectId },
    data: { updatedAt: BigInt(Date.now()) },
  });
  return saved;
}
