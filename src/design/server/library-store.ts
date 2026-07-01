/**
 * Prisma + S3 backed OD Library store for the design SPA.
 *
 * This is the SQLite+local-fs -> Prisma+S3 swap of upstream open-design's
 * daemon Library. Upstream stored the global asset registry in a SQLite
 * `library_*` set of tables (apps/daemon/src/library-store.ts) and wrote owned
 * bytes content-addressed under a local `LIBRARY_DIR`
 * (apps/daemon/src/library.ts `registerLibraryAsset`). The cloud port keeps the
 * exact wire JSON shapes the daemon returned (see the `@open-design/contracts`
 * `LibraryAsset` / `LibraryTask` / `LibraryConnectionStatus` DTOs) but:
 *
 *   - persists metadata to the ported `OdLibrary*` Prisma models, scoped by
 *     `{ userId, organizationId }` (matching `projects-store.ts`), and
 *   - stores owned bytes content-addressed in the shared object store via
 *     `@/lib/s3`, under a per-scope `design/<scope>/library/objects/...` prefix.
 *
 * Dedup is idempotent by content hash, exactly like the daemon: the same bytes
 * ingested twice collapse to one asset row with an extra source back-link. The
 * ported schema keeps `content_hash` globally `@unique` (a single-user daemon
 * carry-over), so we store a *scope-prefixed* hash in that column to preserve
 * cross-tenant isolation while keeping dedup per-scope; the public `contentHash`
 * field returned to clients is always the pure sha256 hex (see
 * `publicContentHash`).
 *
 * NOT ported (graceful degrade, mirrors the daemon's own "no model configured"
 * stance): AI enrichment (caption / OCR) and embeddings. Enrichment tasks are
 * recorded `skipped` on ingest, `OdLibraryEmbedding` rows are never written, and
 * search is a keyword/recency fallback over the list filter (`semantic: false`).
 *
 * NOTE on the lazy `@/lib/s3` load: mirrors `storage.ts` — the shared s3 module
 * carries a pre-existing type error the app build tolerates, so we bind to its
 * helpers through a runtime import behind a local `S3Runtime` contract to keep
 * the isolated `src/design/tsconfig.json` typecheck clean.
 */
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  LibraryAsset,
  LibraryAssetFilter,
  LibraryAssetKind,
  LibraryAssetSource,
  LibraryConnectionStatus,
  LibrarySourceKind,
  LibraryStorage,
  LibraryTask,
  LibraryTaskError,
  LibraryTaskStatus,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

// ---------------------------------------------------------------------------
// S3 bytes (owned content-addressed objects)
// ---------------------------------------------------------------------------

/** The subset of `@/lib/s3` this store uses, typed locally (see file header). */
interface S3Runtime {
  uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ key: string; url: string; size: number }>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}

async function loadS3(): Promise<S3Runtime> {
  const specifier: string = "@/lib/s3";
  return import(specifier) as Promise<S3Runtime>;
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

/** Per-tenant storage/dedup scope, matching the `{ userId, organizationId }`
 *  DB scoping so bytes never leak or clobber across tenants. */
function scopePrefix(ctx: DesignContext): string {
  const org = ctx.organizationId ? sanitizeSegment(ctx.organizationId) : "global";
  return `${sanitizeSegment(ctx.userId)}_${org}`;
}

/** Content-addressed S3 key: `design/<scope>/library/objects/<hh>/<hash><ext>`. */
function libraryObjectKey(ctx: DesignContext, hash: string, ext: string): string {
  const shard = hash.slice(0, 2);
  return `design/${scopePrefix(ctx)}/library/objects/${shard}/${hash}${ext}`;
}

// ---------------------------------------------------------------------------
// Scope + content-hash helpers
// ---------------------------------------------------------------------------

function scopeWhere(ctx: DesignContext): Prisma.OdLibraryAssetWhereInput {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

/** The value stored in the globally-`@unique` `content_hash` column: the pure
 *  hash prefixed by the tenant scope so identical bytes across tenants do not
 *  collide, while dedup stays per-scope. */
function storedContentHash(ctx: DesignContext, hash: string): string {
  return `${ctx.userId}:${ctx.organizationId ?? "global"}:${hash}`;
}

/** The pure sha256 hex to expose on the wire (strip the scope prefix). */
function publicContentHash(stored: string): string {
  const idx = stored.lastIndexOf(":");
  return idx >= 0 ? stored.slice(idx + 1) : stored;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Pure asset helpers (ported from apps/daemon/src/library.ts)
// ---------------------------------------------------------------------------

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "text/html": ".html",
  "text/plain": ".txt",
  "application/json": ".json",
};

function extForMime(mime: string | undefined, filename?: string): string {
  if (filename) {
    const dot = filename.lastIndexOf(".");
    if (dot >= 0) return filename.slice(dot).toLowerCase();
  }
  if (mime && EXT_FOR_MIME[mime]) return EXT_FOR_MIME[mime];
  return ".bin";
}

/** Magic-byte + filename-extension mime sniffing for the common cases. */
function detectMime(bytes: Buffer, filename?: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  const head = bytes.toString("utf8", 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "text/html";
  if (filename) {
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
    for (const [mime, candidate] of Object.entries(EXT_FOR_MIME)) {
      if (candidate === ext) return mime;
    }
  }
  return "application/octet-stream";
}

function kindForMime(mime: string): LibraryAssetKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("font/") || mime === "application/font-woff") return "font";
  if (mime === "text/html") return "html";
  if (mime.startsWith("text/")) return "text";
  return "image";
}

/** Best-effort raster dimensions for PNG / JPEG / GIF (no decode, no deps). */
function sniffImageDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && bytes.toString("ascii", 0, 3) === "GIF") {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === undefined) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      const segLen = bytes.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  }
  return null;
}

/** Local `YYYY-MM-DD` for the daily archive feed. */
function archivedDateFor(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

function dedupeTags(tags: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = (raw ?? "").trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Parse a `data:` URI into raw bytes + declared mime. */
export function parseDataUrl(
  dataUrl: string,
): { bytes: Buffer; mime: string | undefined } | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || undefined;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { bytes, mime };
}

// ---------------------------------------------------------------------------
// Row -> DTO mapping
// ---------------------------------------------------------------------------

interface SourceRow {
  id: string;
  assetId: string;
  sourceKind: string;
  projectId: string | null;
  conversationId: string | null;
  runId: string | null;
  designSystemId: string | null;
  relPath: string | null;
  createdAt: bigint;
}

interface AssetRow {
  id: string;
  kind: string;
  storage: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceDomain: string | null;
  capturedAt: bigint;
  archivedDate: string;
  filePath: string | null;
  originProjectId: string | null;
  relPath: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  size: bigint | null;
  contentHash: string;
  caption: string | null;
  ocrText: string | null;
  paletteJson: string | null;
  tagsJson: string | null;
  metadataJson: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}

interface AssetRowWithSources extends AssetRow {
  sources: SourceRow[];
}

/** Internal projection that also carries the S3 object key for raw serving. */
export interface LibraryAssetRecord extends LibraryAsset {
  /** S3 object key for owned bytes; stripped before returning to clients. */
  storageKey?: string;
}

function mapSource(raw: SourceRow): LibraryAssetSource {
  const source: LibraryAssetSource = {
    id: raw.id,
    assetId: raw.assetId,
    sourceKind: raw.sourceKind as LibrarySourceKind,
    createdAt: Number(raw.createdAt),
  };
  if (raw.projectId != null) source.projectId = raw.projectId;
  if (raw.conversationId != null) source.conversationId = raw.conversationId;
  if (raw.runId != null) source.runId = raw.runId;
  if (raw.designSystemId != null) source.designSystemId = raw.designSystemId;
  if (raw.relPath != null) source.relPath = raw.relPath;
  return source;
}

function mapAsset(raw: AssetRowWithSources): LibraryAssetRecord {
  const asset: LibraryAssetRecord = {
    id: raw.id,
    kind: raw.kind as LibraryAssetKind,
    storage: raw.storage as LibraryStorage,
    capturedAt: Number(raw.capturedAt),
    archivedDate: raw.archivedDate,
    contentHash: publicContentHash(raw.contentHash),
    tags: parseJson<string[]>(raw.tagsJson, []),
    sources: raw.sources.map(mapSource),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
  if (raw.sourceUrl != null) asset.sourceUrl = raw.sourceUrl;
  if (raw.sourceTitle != null) asset.sourceTitle = raw.sourceTitle;
  if (raw.sourceDomain != null) asset.sourceDomain = raw.sourceDomain;
  if (raw.mime != null) asset.mime = raw.mime;
  if (raw.width != null) asset.width = raw.width;
  if (raw.height != null) asset.height = raw.height;
  if (raw.size != null) asset.size = Number(raw.size);
  if (raw.caption != null) asset.caption = raw.caption;
  if (raw.ocrText != null) asset.ocrText = raw.ocrText;
  const palette = parseJson<string[]>(raw.paletteJson, []);
  if (palette.length) asset.palette = palette;
  const metadata = parseJson<Record<string, unknown> | undefined>(raw.metadataJson, undefined);
  if (metadata) asset.metadata = metadata;
  if (raw.originProjectId != null) asset.originProjectId = raw.originProjectId;
  if (raw.relPath != null) asset.relPath = raw.relPath;
  if (raw.filePath != null) asset.storageKey = raw.filePath;
  return asset;
}

/** Strip the internal `storageKey` before returning an asset to a client. */
export function toPublicLibraryAsset(record: LibraryAssetRecord): LibraryAsset {
  const { storageKey: _storageKey, ...rest } = record;
  return rest;
}

const sourcesInclude = { sources: { orderBy: { createdAt: "asc" as const } } };

// ---------------------------------------------------------------------------
// Assets: list / get / delete
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function buildWhere(
  ctx: DesignContext,
  filter: LibraryAssetFilter,
): Prisma.OdLibraryAssetWhereInput {
  const where: Prisma.OdLibraryAssetWhereInput = scopeWhere(ctx);
  const and: Prisma.OdLibraryAssetWhereInput[] = [];
  if (filter.kind) where.kind = filter.kind;
  if (filter.domain) where.sourceDomain = filter.domain;
  if (filter.date) where.archivedDate = filter.date;
  if (filter.q) {
    const contains = filter.q;
    and.push({
      OR: [
        { caption: { contains, mode: "insensitive" } },
        { ocrText: { contains, mode: "insensitive" } },
        { sourceTitle: { contains, mode: "insensitive" } },
        { tagsJson: { contains, mode: "insensitive" } },
        { sourceUrl: { contains, mode: "insensitive" } },
      ],
    });
  }
  if (filter.tag) where.tagsJson = { contains: `"${filter.tag}"` };
  if (filter.source) and.push({ sources: { some: { sourceKind: filter.source } } });
  if (filter.projectId) {
    and.push({
      OR: [
        { originProjectId: filter.projectId },
        { sources: { some: { projectId: filter.projectId } } },
      ],
    });
  }
  if (filter.designSystemId) {
    and.push({ sources: { some: { designSystemId: filter.designSystemId } } });
  }
  if (and.length) where.AND = and;
  return where;
}

/** List assets (newest archive date first), scoped + filtered. Public shape. */
export async function listLibraryAssets(
  ctx: DesignContext,
  filter: LibraryAssetFilter = {},
): Promise<LibraryAsset[]> {
  const take = Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(Number(filter.limit), MAX_LIMIT))
    : DEFAULT_LIMIT;
  const rows = await prisma.odLibraryAsset.findMany({
    where: buildWhere(ctx, filter),
    include: sourcesInclude,
    orderBy: [{ archivedDate: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map((row) => toPublicLibraryAsset(mapAsset(row)));
}

/** Internal record (with `storageKey`) for raw serving. */
export async function getLibraryAssetRecord(
  ctx: DesignContext,
  id: string,
): Promise<LibraryAssetRecord | null> {
  const row = await prisma.odLibraryAsset.findFirst({
    where: { id, ...scopeWhere(ctx) },
    include: sourcesInclude,
  });
  return row ? mapAsset(row) : null;
}

/** Public asset by id, or null when missing / not owned. */
export async function getLibraryAsset(
  ctx: DesignContext,
  id: string,
): Promise<LibraryAsset | null> {
  const record = await getLibraryAssetRecord(ctx, id);
  return record ? toPublicLibraryAsset(record) : null;
}

/** Download an asset's owned bytes from S3. Null when unavailable. */
export async function getLibraryAssetBytes(
  record: LibraryAssetRecord,
): Promise<Buffer | null> {
  if (!record.storageKey) return null;
  try {
    const s3 = await loadS3();
    return await s3.downloadFile(record.storageKey);
  } catch {
    return null;
  }
}

/** Delete an asset (scoped): removes owned S3 bytes then the row (Prisma
 *  cascades sources / tasks / embedding). Returns false when nothing matched. */
export async function deleteLibraryAsset(
  ctx: DesignContext,
  id: string,
): Promise<boolean> {
  const row = await prisma.odLibraryAsset.findFirst({
    where: { id, ...scopeWhere(ctx) },
    select: { id: true, storage: true, filePath: true },
  });
  if (!row) return false;
  if (row.storage === "owned" && row.filePath) {
    const s3 = await loadS3();
    await s3.deleteFile(row.filePath).catch(() => {});
  }
  const result = await prisma.odLibraryAsset.deleteMany({
    where: { id, ...scopeWhere(ctx) },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface AddLibrarySourceInput {
  sourceKind: LibrarySourceKind;
  projectId?: string | undefined;
  conversationId?: string | undefined;
  runId?: string | undefined;
  designSystemId?: string | undefined;
  relPath?: string | undefined;
}

/**
 * Append a source back-link, skipping an exact duplicate (same kind + same
 * project/conversation/run/design-system/relPath) so re-ingesting the same
 * asset from the same place does not multiply back-links. Mirrors the daemon's
 * `addLibraryAssetSource`.
 */
async function addLibraryAssetSource(
  assetId: string,
  input: AddLibrarySourceInput,
): Promise<void> {
  const existing = await prisma.odLibraryAssetSource.findFirst({
    where: {
      assetId,
      sourceKind: input.sourceKind,
      projectId: input.projectId ?? null,
      conversationId: input.conversationId ?? null,
      runId: input.runId ?? null,
      designSystemId: input.designSystemId ?? null,
      relPath: input.relPath ?? null,
    },
    select: { id: true },
  });
  if (existing) return;
  await prisma.odLibraryAssetSource.create({
    data: {
      id: randomUUID(),
      assetId,
      sourceKind: input.sourceKind,
      projectId: input.projectId ?? null,
      conversationId: input.conversationId ?? null,
      runId: input.runId ?? null,
      designSystemId: input.designSystemId ?? null,
      relPath: input.relPath ?? null,
      createdAt: BigInt(Date.now()),
    },
  });
}

// ---------------------------------------------------------------------------
// Register (ingest): content-addressed, idempotent by hash
// ---------------------------------------------------------------------------

export interface RegisterLibraryAssetInput {
  kind?: LibraryAssetKind | undefined;
  /** Owned: the raw bytes to store. */
  bytes?: Buffer | undefined;
  /** Text-like asset payload (stored as utf8 bytes). */
  text?: string | undefined;
  mime?: string | undefined;
  filename?: string | undefined;
  sourceUrl?: string | undefined;
  sourceTitle?: string | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  capturedAt?: number | undefined;
  source: AddLibrarySourceInput;
}

export interface RegisterLibraryAssetResult {
  asset: LibraryAssetRecord;
  deduped: boolean;
  taskId?: string;
}

/**
 * Index an asset into the Library. Idempotent by content hash (per scope):
 * identical bytes seen twice collapse to one asset row with an extra source
 * back-link. Owned bytes are written content-addressed to S3. Always records a
 * `skipped` enrichment task (AI caption/OCR/embedding is not ported).
 */
export async function registerLibraryAsset(
  ctx: DesignContext,
  input: RegisterLibraryAssetInput,
): Promise<RegisterLibraryAssetResult> {
  let bytes = input.bytes ?? null;
  let mime = input.mime;
  if (!bytes && typeof input.text === "string") {
    bytes = Buffer.from(input.text, "utf8");
    if (!mime) mime = "text/plain";
  }
  if (!bytes) {
    throw new Error("registerLibraryAsset requires bytes or text");
  }

  const hash = createHash("sha256").update(bytes).digest("hex");
  const stored = storedContentHash(ctx, hash);

  // Dedup: same bytes already indexed for this scope -> append source, union tags.
  const existing = await prisma.odLibraryAsset.findFirst({
    where: { contentHash: stored, ...scopeWhere(ctx) },
    include: sourcesInclude,
  });
  if (existing) {
    await addLibraryAssetSource(existing.id, input.source);
    if (input.tags && input.tags.length) {
      const merged = dedupeTags([...parseJson<string[]>(existing.tagsJson, []), ...input.tags]);
      await prisma.odLibraryAsset.update({
        where: { id: existing.id },
        data: { tagsJson: JSON.stringify(merged), updatedAt: BigInt(Date.now()) },
      });
    }
    const refreshed = (await getLibraryAssetRecord(ctx, existing.id)) ?? mapAsset(existing);
    return { asset: refreshed, deduped: true };
  }

  if (!mime) mime = detectMime(bytes, input.filename);
  const kind = input.kind ?? kindForMime(mime);
  const dims = kind === "image" ? sniffImageDimensions(bytes) : null;
  const now = Date.now();
  const capturedAt = Number.isFinite(input.capturedAt) ? Number(input.capturedAt) : now;
  const id = randomUUID();
  const taskId = randomUUID();

  const ext = extForMime(mime, input.filename);
  const key = libraryObjectKey(ctx, hash, ext);
  const s3 = await loadS3();
  await s3.uploadFile(key, bytes, mime ?? "application/octet-stream");

  const domain = domainFromUrl(input.sourceUrl);
  const tags = dedupeTags([...(input.tags ?? []), domain]);
  const nowB = BigInt(now);

  // Enrichment task: programmatic layer ran inline above; the AI layer is not
  // configured in the cloud port, so the task lands `skipped` (mirrors the
  // daemon's `recordEnrichmentTask`).
  const progress = [
    "programmatic: hashed + sized + mime detected",
    kind === "image" ? "programmatic: image dimensions read" : "programmatic: text/metadata captured",
    "ai: caption/ocr/embedding skipped (no model configured)",
  ];

  await prisma.$transaction(async (tx) => {
    await tx.odLibraryAsset.create({
      data: {
        id,
        kind,
        storage: "owned",
        sourceUrl: input.sourceUrl ?? null,
        sourceTitle: input.sourceTitle ?? null,
        sourceDomain: domain ?? null,
        capturedAt: BigInt(capturedAt),
        archivedDate: archivedDateFor(capturedAt),
        filePath: key,
        originProjectId: null,
        relPath: null,
        mime: mime ?? null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        size: BigInt(bytes!.length),
        contentHash: stored,
        caption: null,
        ocrText: null,
        paletteJson: null,
        tagsJson: JSON.stringify(tags),
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt: nowB,
        updatedAt: nowB,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
    });
    await tx.odLibraryAssetSource.create({
      data: {
        id: randomUUID(),
        assetId: id,
        sourceKind: input.source.sourceKind,
        projectId: input.source.projectId ?? null,
        conversationId: input.source.conversationId ?? null,
        runId: input.source.runId ?? null,
        designSystemId: input.source.designSystemId ?? null,
        relPath: input.source.relPath ?? null,
        createdAt: BigInt(Date.now()),
      },
    });
    await tx.odLibraryTask.create({
      data: {
        id: taskId,
        assetId: id,
        status: "skipped",
        progressJson: JSON.stringify(progress),
        errorJson: null,
        startedAt: nowB,
        endedAt: nowB,
      },
    });
  });

  const asset = await getLibraryAssetRecord(ctx, id);
  if (!asset) throw new Error(`library asset vanished after insert: ${id}`);
  return { asset, deduped: false, taskId };
}

// ---------------------------------------------------------------------------
// Enrichment tasks (status)
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  assetId: string;
  status: string;
  progressJson: string;
  errorJson: string | null;
  startedAt: bigint;
  endedAt: bigint | null;
}

function mapTask(raw: TaskRow): LibraryTask {
  return {
    id: raw.id,
    assetId: raw.assetId,
    status: raw.status as LibraryTaskStatus,
    progress: parseJson<string[]>(raw.progressJson, []),
    error: parseJson<LibraryTaskError | null>(raw.errorJson, null),
    startedAt: Number(raw.startedAt),
    endedAt: raw.endedAt == null ? null : Number(raw.endedAt),
  };
}

/** List an asset's enrichment tasks (scoped via the asset relation). */
export async function listLibraryTasks(
  ctx: DesignContext,
  assetId: string,
): Promise<LibraryTask[]> {
  const rows = await prisma.odLibraryTask.findMany({
    where: { assetId, asset: scopeWhere(ctx) },
    orderBy: { startedAt: "asc" },
  });
  return rows.map(mapTask);
}

/** Fetch a single enrichment task by id (scoped via the asset relation). */
export async function getLibraryTask(
  ctx: DesignContext,
  id: string,
): Promise<LibraryTask | null> {
  const row = await prisma.odLibraryTask.findFirst({
    where: { id, asset: scopeWhere(ctx) },
  });
  return row ? mapTask(row) : null;
}

// ---------------------------------------------------------------------------
// Tokens (browser-extension pairing) — connection status
// ---------------------------------------------------------------------------

/** Connection/pairing status: whether any extension token exists for the scope. */
export async function libraryConnectionStatus(
  ctx: DesignContext,
): Promise<LibraryConnectionStatus> {
  const rows = await prisma.odLibraryToken.findMany({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return {
    paired: rows.length > 0,
    tokens: rows.map((r) => ({
      label: r.label,
      extensionOrigin: r.extensionOrigin,
      createdAt: Number(r.createdAt),
      lastUsedAt: Number(r.lastUsedAt),
    })),
  };
}
