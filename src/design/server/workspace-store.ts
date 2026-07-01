/**
 * Prisma-backed workspace store for the design SPA.
 *
 * Groups the per-project "workspace state" surfaces the daemon kept in SQLite
 * (apps/daemon/src/db.ts + media/tasks.ts): open tabs, preview comments, and
 * media-generation tasks. The cloud port keeps the exact daemon JSON shapes but
 * persists to the ported `OdTab` / `OdTabsState` / `OdPreviewComment` /
 * `OdMediaTask` Prisma models, scoped through their parent `OdProject`'s
 * `{ userId, organizationId }` (the child rows carry only `projectId`, so every
 * read/write here first proves the project is owned by the caller).
 *
 * The upstream single-user daemon had no auth; this module is the multi-tenant
 * ownership boundary for those child rows.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type {
  PreviewComment,
  PreviewCommentStatus,
  ProjectBrowserWorkspaceTab,
  ProjectTabsState,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

// ---------------------------------------------------------------------------
// Ownership guard
// ---------------------------------------------------------------------------

/** Mirrors conversations-store's private `projectIsOwned`: a project is visible
 *  only within the caller's `{ userId, organizationId }` scope. */
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

/** Verify the conversation exists and belongs to an owned project. Returns the
 *  conversation id when valid, else null (route maps to 404). */
async function conversationIsOwned(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  if (!(await projectIsOwned(ctx, projectId))) return false;
  const conv = await prisma.odConversation.findFirst({
    where: { id: conversationId, projectId },
    select: { id: true },
  });
  return conv != null;
}

// ---------------------------------------------------------------------------
// Shared JSON helpers (ported from apps/daemon/src/db.ts)
// ---------------------------------------------------------------------------

function parseJsonOrUndef(s: string | null): unknown {
  if (typeof s !== "string" || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Tabs (OdTab + OdTabsState)  — mirrors daemon listTabs / setTabs
// ---------------------------------------------------------------------------

function normalizeBrowserWorkspaceTab(
  value: unknown,
): ProjectBrowserWorkspaceTab | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.label !== "string" || !record.label.trim()) return null;
  const tab: ProjectBrowserWorkspaceTab = { id: record.id, label: record.label };
  if (record.insertAfter === null) tab.insertAfter = null;
  else if (typeof record.insertAfter === "string")
    tab.insertAfter = record.insertAfter;
  if (typeof record.title === "string" && record.title.trim())
    tab.title = record.title;
  if (typeof record.url === "string" && record.url.trim()) tab.url = record.url;
  if (typeof record.iconUrl === "string" && record.iconUrl.trim())
    tab.iconUrl = record.iconUrl;
  return tab;
}

export function normalizeProjectTabsState(
  value: unknown,
): ProjectTabsState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.tabs) ||
    !record.tabs.every((tab) => typeof tab === "string")
  ) {
    return null;
  }
  const browserTabs = Array.isArray(record.browserTabs)
    ? record.browserTabs
        .map(normalizeBrowserWorkspaceTab)
        .filter((tab): tab is ProjectBrowserWorkspaceTab => Boolean(tab))
    : [];
  const state: ProjectTabsState = {
    tabs: (record.tabs as string[]).slice(),
    active: typeof record.active === "string" ? record.active : null,
  };
  if (browserTabs.length > 0) state.browserTabs = browserTabs;
  return state;
}

/** Read a project's tab state. Returns null when the project isn't owned. */
export async function getDesignTabs(
  ctx: DesignContext,
  projectId: string,
): Promise<ProjectTabsState | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;
  const [state, rows] = await Promise.all([
    prisma.odTabsState.findUnique({ where: { projectId } }),
    prisma.odTab.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
      select: { name: true, isActive: true },
    }),
  ]);
  const savedState = state
    ? normalizeProjectTabsState(parseJsonOrUndef(state.stateJson))
    : null;
  if (savedState) {
    return {
      ...savedState,
      hasSavedState: true,
      updatedAt: Number(state?.updatedAt ?? Date.now()),
    };
  }
  const active = rows.find((r) => r.isActive) ?? null;
  return {
    tabs: rows.map((r) => r.name),
    active: active ? active.name : null,
    hasSavedState: rows.length > 0 || Boolean(state),
    updatedAt: state ? Number(state.updatedAt) : undefined,
  };
}

/** Replace a project's tab state (state row + normalized tab rows). Returns the
 *  freshly-read state, or null when the project isn't owned. */
export async function setDesignTabs(
  ctx: DesignContext,
  projectId: string,
  input: ProjectTabsState | { tabs: string[]; active?: string | null; browserTabs?: unknown[] },
): Promise<ProjectTabsState | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;
  const state = normalizeProjectTabsState(input) ?? { tabs: [], active: null };
  const now = BigInt(Date.now());
  await prisma.$transaction(async (tx) => {
    await tx.odTabsState.upsert({
      where: { projectId },
      create: { projectId, updatedAt: now, stateJson: JSON.stringify(state) },
      update: { updatedAt: now, stateJson: JSON.stringify(state) },
    });
    await tx.odTab.deleteMany({ where: { projectId } });
    if (state.tabs.length > 0) {
      await tx.odTab.createMany({
        data: state.tabs.map((name, i) => ({
          projectId,
          name,
          position: i,
          isActive: name === state.active ? 1 : 0,
        })),
      });
    }
  });
  return getDesignTabs(ctx, projectId);
}

// ---------------------------------------------------------------------------
// Preview comments (OdPreviewComment) — mirrors daemon list/upsert/status/delete
// ---------------------------------------------------------------------------

const PREVIEW_COMMENT_STATUSES: ReadonlySet<string> = new Set([
  "open",
  "attached",
  "applying",
  "needs_review",
  "resolved",
  "failed",
]);

const ANNOTATION_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "fontFamily",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderRadius",
] as const;

/** Thrown for malformed comment input; the route maps this to a 400. */
export class PreviewCommentInputError extends Error {}

function normalizePosition(input: unknown) {
  const value = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    width: finiteNumber(value.width),
    height: finiteNumber(value.height),
  };
}

function normalizeAnnotationStyle(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const style: Record<string, string> = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const trimmed = compactWhitespace(value);
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function cleanRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PreviewCommentInputError(`${name} required`);
  }
  return value.trim();
}

function normalizePodMembers(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== "object") return null;
      const m = member as Record<string, unknown>;
      const elementId = cleanRequiredString(m.elementId, "podMember.elementId");
      const selector = cleanRequiredString(m.selector, "podMember.selector");
      const label = cleanRequiredString(m.label, "podMember.label");
      return {
        elementId,
        selector,
        label,
        text:
          typeof m.text === "string" ? compactWhitespace(m.text).slice(0, 160) : "",
        position: normalizePosition(m.position),
        htmlHint:
          typeof m.htmlHint === "string"
            ? compactWhitespace(m.htmlHint).slice(0, 180)
            : "",
        style: normalizeAnnotationStyle(m.style),
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
}

function normalizePreviewCommentAttachments(
  input: unknown,
): Array<{ path: string; name: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const path = typeof rec.path === "string" ? rec.path.trim() : "";
      if (!path) return null;
      const rawName = typeof rec.name === "string" ? rec.name.trim() : "";
      return { path, name: rawName || path.split("/").pop() || path };
    })
    .filter((v): v is { path: string; name: string } => Boolean(v))
    .slice(0, 20);
}

function randomCommentId(): string {
  return `cmt_${randomUUID().slice(0, 8)}`;
}

/** The OdPreviewComment scalar subset this store reads. */
interface OdPreviewCommentRow {
  id: string;
  projectId: string;
  conversationId: string;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  positionJson: string;
  htmlHint: string;
  selectionKind: string | null;
  memberCount: number | null;
  podMembersJson: string | null;
  styleJson: string | null;
  attachmentsJson: string | null;
  slideIndex: number | null;
  note: string;
  status: string;
  createdAt: bigint;
  updatedAt: bigint;
}

function normalizePreviewComment(row: OdPreviewCommentRow): PreviewComment {
  const podMembers = parseJsonOrUndef(row.podMembersJson);
  const normalizedPodMembers = Array.isArray(podMembers) ? podMembers : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    filePath: row.filePath,
    elementId: row.elementId,
    selector: row.selector,
    label: row.label,
    text: row.text,
    position:
      (parseJsonOrUndef(row.positionJson) as PreviewComment["position"]) ?? {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
    htmlHint: row.htmlHint,
    style: normalizeAnnotationStyle(parseJsonOrUndef(row.styleJson)),
    selectionKind: row.selectionKind === "pod" ? "pod" : "element",
    memberCount:
      normalizedPodMembers && normalizedPodMembers.length > 0
        ? normalizedPodMembers.length
        : typeof row.memberCount === "number" && Number.isFinite(row.memberCount)
          ? row.memberCount
          : undefined,
    podMembers: normalizedPodMembers as PreviewComment["podMembers"],
    slideIndex:
      typeof row.slideIndex === "number" && Number.isFinite(row.slideIndex)
        ? row.slideIndex
        : undefined,
    note: row.note,
    attachments: normalizePreviewCommentAttachments(
      parseJsonOrUndef(row.attachmentsJson),
    ),
    status: row.status as PreviewCommentStatus,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

/** List a conversation's preview comments (created-ascending). Returns null when
 *  the conversation isn't found / not owned. */
export async function listDesignPreviewComments(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
): Promise<PreviewComment[] | null> {
  if (!(await conversationIsOwned(ctx, projectId, conversationId))) return null;
  const rows = (await prisma.odPreviewComment.findMany({
    where: { projectId, conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })) as OdPreviewCommentRow[];
  return rows.map(normalizePreviewComment);
}

/** Upsert a comment keyed on (project, conversation, filePath, elementId,
 *  slideKey). Mirrors the daemon: keeps createdAt, merges attachments, requires
 *  a note or attachment, resets status to 'open'. Returns null when the
 *  conversation isn't owned; throws PreviewCommentInputError on bad input. */
export async function upsertDesignPreviewComment(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
  input: Record<string, unknown>,
): Promise<PreviewComment | null> {
  if (!(await conversationIsOwned(ctx, projectId, conversationId))) return null;

  const target = (input?.target ?? {}) as Record<string, unknown>;
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  const attachmentsProvided = Object.prototype.hasOwnProperty.call(
    input ?? {},
    "attachments",
  );
  const incomingAttachments = normalizePreviewCommentAttachments(
    input?.attachments,
  );

  const filePath = cleanRequiredString(target.filePath, "filePath");
  const elementId = cleanRequiredString(target.elementId, "elementId");
  const selector = cleanRequiredString(target.selector, "selector");
  const label = cleanRequiredString(target.label, "label");
  const text =
    typeof target.text === "string"
      ? compactWhitespace(target.text).slice(0, 160)
      : "";
  const htmlHint =
    typeof target.htmlHint === "string"
      ? compactWhitespace(target.htmlHint).slice(0, 180)
      : "";
  const position = normalizePosition(target.position);
  const selectionKind = target.selectionKind === "pod" ? "pod" : "element";
  const podMembers =
    selectionKind === "pod" ? normalizePodMembers(target.podMembers) : [];
  const style = normalizeAnnotationStyle(target.style);
  const rawMemberCount = target.memberCount;
  const memberCount =
    selectionKind === "pod"
      ? podMembers.length > 0
        ? podMembers.length
        : typeof rawMemberCount === "number" && Number.isFinite(rawMemberCount)
          ? Math.max(0, Math.round(rawMemberCount))
          : 0
      : 0;
  const slideIndex =
    typeof target.slideIndex === "number" && Number.isFinite(target.slideIndex)
      ? Math.max(0, Math.round(target.slideIndex))
      : null;
  const slideKey = slideIndex ?? -1;
  const now = BigInt(Date.now());

  const existing = await prisma.odPreviewComment.findFirst({
    where: { projectId, conversationId, filePath, elementId, slideKey },
    select: { id: true, createdAt: true, attachmentsJson: true },
  });

  const id = existing?.id ?? randomCommentId();
  const createdAt = existing?.createdAt ?? now;
  const existingAttachments = normalizePreviewCommentAttachments(
    parseJsonOrUndef(existing?.attachmentsJson ?? null),
  );
  const attachments = attachmentsProvided
    ? incomingAttachments
    : existingAttachments;

  // A comment must carry either a note or at least one image attachment.
  if (!note && attachments.length === 0) {
    throw new PreviewCommentInputError("comment note required");
  }

  const data = {
    projectId,
    conversationId,
    filePath,
    elementId,
    selector,
    label,
    text,
    positionJson: JSON.stringify(position),
    htmlHint,
    selectionKind,
    memberCount: selectionKind === "pod" ? memberCount : null,
    podMembersJson: selectionKind === "pod" ? JSON.stringify(podMembers) : null,
    styleJson: style ? JSON.stringify(style) : null,
    attachmentsJson: attachments.length > 0 ? JSON.stringify(attachments) : null,
    slideIndex,
    slideKey,
    note,
    status: "open",
    updatedAt: now,
  };

  if (existing) {
    await prisma.odPreviewComment.update({ where: { id }, data });
  } else {
    await prisma.odPreviewComment.create({ data: { id, createdAt, ...data } });
  }

  const row = (await prisma.odPreviewComment.findUnique({
    where: { id },
  })) as OdPreviewCommentRow | null;
  return row ? normalizePreviewComment(row) : null;
}

/** Update a comment's status. Returns undefined when the conversation isn't
 *  owned (route -> 404 not-owned), null when the comment id doesn't exist. */
export async function updateDesignPreviewCommentStatus(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
  commentId: string,
  status: unknown,
): Promise<PreviewComment | null | undefined> {
  if (!(await conversationIsOwned(ctx, projectId, conversationId))) {
    return undefined;
  }
  if (typeof status !== "string" || !PREVIEW_COMMENT_STATUSES.has(status)) {
    throw new PreviewCommentInputError("invalid comment status");
  }
  const result = await prisma.odPreviewComment.updateMany({
    where: { id: commentId, projectId, conversationId },
    data: { status, updatedAt: BigInt(Date.now()) },
  });
  if (result.count === 0) return null;
  const row = (await prisma.odPreviewComment.findUnique({
    where: { id: commentId },
  })) as OdPreviewCommentRow | null;
  return row ? normalizePreviewComment(row) : null;
}

/** Delete a comment. Returns undefined when the conversation isn't owned,
 *  else whether a row was removed. */
export async function deleteDesignPreviewComment(
  ctx: DesignContext,
  projectId: string,
  conversationId: string,
  commentId: string,
): Promise<boolean | undefined> {
  if (!(await conversationIsOwned(ctx, projectId, conversationId))) {
    return undefined;
  }
  const result = await prisma.odPreviewComment.deleteMany({
    where: { id: commentId, projectId, conversationId },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Media tasks (OdMediaTask) — mirrors daemon media/tasks.ts + routes/media.ts
// ---------------------------------------------------------------------------

const MEDIA_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "failed",
  "interrupted",
]);

interface OdMediaTaskRow {
  id: string;
  status: string;
  surface: string | null;
  model: string | null;
  progressJson: string;
  fileJson: string | null;
  errorJson: string | null;
  startedAt: bigint;
  endedAt: bigint | null;
}

/** The list-item shape the daemon's `GET /api/projects/:id/media/tasks` sends. */
export interface MediaTaskListItem {
  taskId: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
  elapsed: number;
  surface: string | null;
  model: string | null;
  progress: string[];
  progressCount: number;
  file?: unknown;
  error?: unknown;
}

function parseProgress(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((l): l is string => typeof l === "string")
      : [];
  } catch {
    return [];
  }
}

function mapMediaTaskListItem(row: OdMediaTaskRow): MediaTaskListItem {
  const startedAt = Number(row.startedAt);
  const endedAt = row.endedAt == null ? null : Number(row.endedAt);
  const progress = parseProgress(row.progressJson);
  const item: MediaTaskListItem = {
    taskId: row.id,
    status: row.status,
    startedAt,
    endedAt,
    elapsed: Math.round(((endedAt ?? Date.now()) - startedAt) / 1000),
    surface: row.surface,
    model: row.model,
    progress: progress.slice(-3),
    progressCount: progress.length,
  };
  if (row.status === "done") {
    item.file = parseJsonOrUndef(row.fileJson);
  }
  if (row.status === "failed" || row.status === "interrupted") {
    item.error = parseJsonOrUndef(row.errorJson);
  }
  return item;
}

/** List a project's media tasks (started-desc), pruned to non-terminal unless
 *  `includeDone`. Returns null when the project isn't owned. */
export async function listDesignMediaTasks(
  ctx: DesignContext,
  projectId: string,
  options: { includeDone?: boolean } = {},
): Promise<MediaTaskListItem[] | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;
  const rows = (await prisma.odMediaTask.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      surface: true,
      model: true,
      progressJson: true,
      fileJson: true,
      errorJson: true,
      startedAt: true,
      endedAt: true,
    },
  })) as OdMediaTaskRow[];
  return rows
    .filter(
      (row) => options.includeDone === true || !MEDIA_TERMINAL_STATUSES.has(row.status),
    )
    .map(mapMediaTaskListItem);
}

export interface CreateMediaTaskInput {
  surface?: string | null;
  model?: string | null;
}

/** Create a queued media task. Actual generation is NOT run in the cloud port
 *  (heavy, desktop-only), so the row stays `queued` and carries a single
 *  progress line. Returns the created task's list item, or null if not owned. */
export async function createDesignMediaTask(
  ctx: DesignContext,
  projectId: string,
  input: CreateMediaTaskInput,
): Promise<MediaTaskListItem | null> {
  if (!(await projectIsOwned(ctx, projectId))) return null;
  const now = BigInt(Date.now());
  const row = (await prisma.odMediaTask.create({
    data: {
      id: randomUUID(),
      projectId,
      status: "queued",
      surface: typeof input.surface === "string" ? input.surface : null,
      model: typeof input.model === "string" ? input.model : null,
      progressJson: JSON.stringify(["queued"]),
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    select: {
      id: true,
      status: true,
      surface: true,
      model: true,
      progressJson: true,
      fileJson: true,
      errorJson: true,
      startedAt: true,
      endedAt: true,
    },
  })) as OdMediaTaskRow;
  return mapMediaTaskListItem(row);
}
