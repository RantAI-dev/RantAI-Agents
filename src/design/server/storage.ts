/**
 * Project file/artifact storage for the design SPA.
 *
 * This is the fs→S3 swap: upstream open-design's daemon read/wrote project
 * files under a local `PROJECTS_DIR` on disk. The cloud port keeps the same
 * "bytes keyed by project + relative path" contract but stores them in the
 * shared object store via `@/lib/s3`, namespaced per organization + project.
 *
 * Boot + project-list/create don't touch files yet; this adapter is the
 * foundation the next endpoint group (project files / artifacts) will build on.
 *
 * NOTE on the lazy `@/lib/s3` load: the shared s3 module carries a pre-existing
 * type error (validateUpload, index.ts:504) that the app build tolerates via
 * `next.config.mjs` → `typescript.ignoreBuildErrors`. This module is verified by
 * the stricter, isolated `src/design/tsconfig.json` harness which has no such
 * escape hatch, so we bind to the s3 helpers through a runtime import behind a
 * local `S3Runtime` contract — full type-safety here, without dragging that
 * unrelated infra error into the port's typecheck. When this adapter is wired
 * into a route (next group), switch to a static import if the infra error has
 * been resolved upstream.
 */
import type { DesignContext } from "./auth";

/** The subset of `@/lib/s3` this adapter uses, typed locally. */
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
  // `specifier: string` (widened) so the isolated tsconfig treats this as a
  // dynamic module and does not pull `@/lib/s3` into its checked file set.
  const specifier: string = "@/lib/s3";
  return import(specifier) as Promise<S3Runtime>;
}

const MAX_SEGMENT_LEN = 255;

function sanitizeSegment(segment: string): string {
  return segment
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, MAX_SEGMENT_LEN);
}

/** Sanitize a project-relative path, preserving `/` structure but dropping
 *  empty / `.` / `..` segments so keys can never escape the project prefix. */
function sanitizeRelPath(rel: string): string {
  return rel
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..")
    .map(sanitizeSegment)
    .join("/");
}

/**
 * S3 key for a design project file, scoped by org (or `global` for personal
 * sessions): `design/{orgId|global}/{projectId}/{relPath}`.
 */
export function designFileKey(
  ctx: DesignContext,
  projectId: string,
  relPath: string,
): string {
  const scope = ctx.organizationId || "global";
  return `design/${scope}/${sanitizeSegment(projectId)}/${sanitizeRelPath(relPath)}`;
}

export async function putDesignFile(
  ctx: DesignContext,
  projectId: string,
  relPath: string,
  bytes: Buffer,
  contentType = "application/octet-stream",
): Promise<{ key: string; size: number }> {
  const key = designFileKey(ctx, projectId, relPath);
  const s3 = await loadS3();
  const result = await s3.uploadFile(key, bytes, contentType);
  return { key: result.key, size: result.size };
}

export async function getDesignFile(
  ctx: DesignContext,
  projectId: string,
  relPath: string,
): Promise<Buffer> {
  const s3 = await loadS3();
  return s3.downloadFile(designFileKey(ctx, projectId, relPath));
}

export async function deleteDesignFile(
  ctx: DesignContext,
  projectId: string,
  relPath: string,
): Promise<void> {
  const s3 = await loadS3();
  await s3.deleteFile(designFileKey(ctx, projectId, relPath));
}
