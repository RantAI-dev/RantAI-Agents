/**
 * Shared file helpers for the design SPA's project file/artifact routes.
 *
 * The daemon stored project files on disk under PROJECTS_DIR and derived their
 * `kind` / `mime` from the extension (apps/daemon/src/projects.ts). The cloud
 * port stores the bytes in S3 (see src/design/server/storage.ts) and mirrors the
 * same extension→{mime,kind} derivation here, plus an S3-prefix listing that
 * reconstructs the daemon's `ProjectFile[]` shape (name/size/mtime/kind/mime).
 *
 * This module lives in a `_lib` private folder so Next's App Router does not
 * treat it as a route. It is NOT part of the isolated `src/design/tsconfig.json`
 * program, so it can statically import `@/lib/s3` (which the port's storage
 * adapter loads lazily only to satisfy that isolated typecheck).
 */
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type {
  ProjectFile,
  ProjectFileKind,
  ProjectFolder,
} from "@open-design/contracts";
import { getBucket, getS3Client } from "@/lib/s3";
import type { DesignContext } from "@/design/server/auth";
import { designFileKey, putDesignFile } from "@/design/server/storage";

// Mirrors the daemon's EXT_MIME map (apps/daemon/src/projects.ts).
const EXT_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".tsx": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

function extname(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/** Mirrors the daemon's `mimeFor`. */
export function mimeFor(name: string): string {
  return EXT_MIME[extname(name)] || "application/octet-stream";
}

/** Mirrors the daemon's `kindFor`. */
export function kindFor(name: string): ProjectFileKind {
  if (name.endsWith(".sketch.json")) return "sketch";
  const ext = extname(name);
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".svg") return "sketch";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(ext)) {
    const base = name.slice(name.lastIndexOf("/") + 1);
    return base.startsWith("sketch-") ? "sketch" : "image";
  }
  if ([".mp4", ".mov", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a"].includes(ext)) return "audio";
  if ([".md", ".txt"].includes(ext)) return "text";
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".css", ".py"].includes(ext)) {
    return "code";
  }
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "document";
  if (ext === ".pptx") return "presentation";
  if (ext === ".xlsx") return "spreadsheet";
  return "binary";
}

/**
 * List a project's files from S3, reconstructing the daemon's `ProjectFile[]`.
 * Keys are stored under the `design/{orgId|global}/{projectId}/` prefix; the
 * relative path (name) is the key with that prefix stripped.
 *
 * @param opts.since - optional mtime floor (ms); mirrors the daemon's `?since=`.
 */
export async function listProjectFilesFromS3(
  ctx: DesignContext,
  projectId: string,
  opts: { since?: number } = {},
): Promise<ProjectFile[]> {
  const prefix = designFileKey(ctx, projectId, "");
  const client = getS3Client();
  const bucket = getBucket();

  const files: ProjectFile[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key ?? "";
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      // Skip the prefix "folder" placeholder, empty-folder markers, and any
      // empty relative path.
      if (!name || name.endsWith("/")) continue;
      if (name === FOLDER_MARKER || name.endsWith(`/${FOLDER_MARKER}`)) continue;
      const mtime = obj.LastModified ? obj.LastModified.getTime() : 0;
      if (typeof opts.since === "number" && Number.isFinite(opts.since) && mtime < opts.since) {
        continue;
      }
      files.push({
        name,
        path: name,
        type: "file",
        size: typeof obj.Size === "number" ? obj.Size : 0,
        mtime,
        kind: kindFor(name),
        mime: mimeFor(name),
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return files;
}

// ---------------------------------------------------------------------------
// Project folders
//
// The daemon stored folders as real on-disk directories (including empty ones)
// and listed them from the filesystem. S3 has no directories — only keys — so
// the cloud port DERIVES folders from key prefixes, and persists an explicit
// EMPTY folder as a zero-byte marker object (`<folder>/.od-folder`) so a
// user-created empty folder survives a reload. The marker itself is hidden from
// the file/folder listings.
// ---------------------------------------------------------------------------

const FOLDER_MARKER = ".od-folder";

/** Every ancestor directory of a relative key path (basename dropped). */
function ancestorDirs(rel: string): string[] {
  const segs = rel.split("/");
  segs.pop(); // drop the file/marker basename
  const out: string[] = [];
  let acc = "";
  for (const seg of segs) {
    if (!seg) continue;
    acc = acc ? `${acc}/${seg}` : seg;
    out.push(acc);
  }
  return out;
}

/**
 * List a project's folders (derived from S3 key prefixes + empty-folder
 * markers), reconstructing the daemon's `ProjectFolder[]` shape. `mtime` is the
 * newest contained-key timestamp.
 */
export async function listProjectFoldersFromS3(
  ctx: DesignContext,
  projectId: string,
): Promise<ProjectFolder[]> {
  const prefix = designFileKey(ctx, projectId, "");
  const client = getS3Client();
  const bucket = getBucket();

  const dirMtime = new Map<string, number>();
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key ?? "";
      if (!key.startsWith(prefix)) continue;
      const rel = key.slice(prefix.length);
      if (!rel) continue;
      const mtime = obj.LastModified ? obj.LastModified.getTime() : 0;
      for (const dir of ancestorDirs(rel)) {
        dirMtime.set(dir, Math.max(dirMtime.get(dir) ?? 0, mtime));
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return [...dirMtime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, mtime]) => ({
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      type: "dir" as const,
      size: 0 as const,
      mtime,
    }));
}

/** Persist an empty folder by writing its zero-byte marker; returns the folder. */
export async function createProjectFolderInS3(
  ctx: DesignContext,
  projectId: string,
  name: string,
): Promise<ProjectFolder> {
  const clean = name
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!clean) throw new Error("invalid folder name");
  await putDesignFile(
    ctx,
    projectId,
    `${clean}/${FOLDER_MARKER}`,
    Buffer.alloc(0),
    "application/x-empty",
  );
  return {
    name: clean.slice(clean.lastIndexOf("/") + 1),
    path: clean,
    type: "dir",
    size: 0,
    mtime: Date.now(),
  };
}

/** Delete every key under a folder prefix (files + markers). */
export async function deleteProjectFolderFromS3(
  ctx: DesignContext,
  projectId: string,
  folderPath: string,
): Promise<void> {
  const clean = folderPath
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!clean) throw new Error("invalid folder path");
  const client = getS3Client();
  const bucket = getBucket();
  // Trailing slash so `foo` never also matches `foobar`.
  const prefix = `${designFileKey(ctx, projectId, clean)}/`;

  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (res.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => typeof k === "string");
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
}
