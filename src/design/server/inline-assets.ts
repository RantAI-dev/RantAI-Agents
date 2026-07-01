/**
 * Server-side asset inliner for the design SPA's HTML export.
 *
 * Verbatim port of the daemon's `apps/daemon/src/inline-assets.ts`. Powers
 * `GET /api/design/projects/:id/export/*?inline=1`: it inlines TOP-LEVEL
 * relative `<link rel=stylesheet>` and `<script src=...>` tags into the
 * response HTML so the "Export as HTML" share menu item hands the user a
 * single self-contained-ish file. The FileViewer preview itself stays
 * URL-load; this endpoint is the explicit-export path only.
 *
 * The upstream daemon read sibling assets from disk (`readProjectFile`); the
 * cloud port injects an S3-backed `InlineAssetReader` from the route handler.
 * The pure string/Buffer logic below is unchanged from upstream.
 *
 * Scope: this helper handles two tag families only. The following are NOT
 * rewritten and remain external in the response:
 *   - <img src>, <video src>, <audio src>, <source src>, <iframe src>
 *   - CSS `url(...)` references (in inlined stylesheets or otherwise)
 *   - CSS `@import` directives
 *   - ES module `import` / `export from` statements inside JS bodies
 *   - <link rel=preload|prefetch|icon|...> (only rel=stylesheet inlines)
 *   - <link rel=stylesheet> with absolute / data: / blob: hrefs
 *   - @font-face url() references
 */

/**
 * A handle to a project-relative asset. Decoupled into `size` (cheap) and
 * `read()` (full materialization) so the helper can short-circuit on
 * `maxAssetBytes` / `maxTotalBytes` BEFORE the asset is buffered into memory.
 */
export interface AssetHandle {
  readonly size: number;
  read(): Promise<string | null>;
}

export interface InlineAssetReader {
  (relPath: string): Promise<AssetHandle | null>;
}

export interface InlineOptions {
  /** Max byte length of the owner HTML; exceeds → throw InlineAssetsLimitError("owner"). */
  maxOwnerBytes?: number;
  /** Max byte length of a single inlined asset body; exceeds → tag stays as URL ref. */
  maxAssetBytes?: number;
  /** Max number of `<link>`/`<script>` matches in the owner HTML; exceeds → throw "candidates". */
  maxCandidates?: number;
  /** Max byte length of the assembled output; exceeds → throw InlineAssetsLimitError("total"). */
  maxTotalBytes?: number;
  /** Max concurrent fileReader invocations; defaults to MAX_INLINE_READ_CONCURRENCY. */
  maxReadConcurrency?: number;
}

export const MAX_INLINE_OWNER_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_INLINE_ASSET_BYTES = 5 * 1024 * 1024; // 5 MiB per asset
export const MAX_INLINE_CANDIDATES = 500; // <link>/<script src> matches
export const MAX_INLINE_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MiB output
export const MAX_INLINE_READ_CONCURRENCY = 8; // simultaneous fileReader calls

/**
 * Thrown by `inlineRelativeAssets` when a configured cap is exceeded. The route
 * handler maps every `InlineAssetsLimitError` to a 413 `PAYLOAD_TOO_LARGE`
 * envelope; the `limit` field identifies which cap fired.
 */
export class InlineAssetsLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: "owner" | "asset" | "candidates" | "total",
  ) {
    super(message);
    this.name = "InlineAssetsLimitError";
  }
}

export async function inlineRelativeAssets(
  html: string,
  ownerFileName: string,
  fileReader: InlineAssetReader,
  opts: InlineOptions = {},
): Promise<string> {
  const maxOwnerBytes = opts.maxOwnerBytes ?? MAX_INLINE_OWNER_BYTES;
  const maxAssetBytes = opts.maxAssetBytes ?? MAX_INLINE_ASSET_BYTES;
  const maxCandidates = opts.maxCandidates ?? MAX_INLINE_CANDIDATES;
  const maxTotalBytes = opts.maxTotalBytes ?? MAX_INLINE_TOTAL_BYTES;
  const maxReadConcurrency =
    opts.maxReadConcurrency ?? MAX_INLINE_READ_CONCURRENCY;

  const ownerBytes = Buffer.byteLength(html, "utf8");
  if (ownerBytes > maxOwnerBytes) {
    throw new InlineAssetsLimitError(
      `owner html ${ownerBytes} bytes exceeds maxOwnerBytes ${maxOwnerBytes}`,
      "owner",
    );
  }

  interface Pending {
    start: number;
    end: number;
    resolved: string;
    build: (content: string) => string;
  }

  const pending: Pending[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const start = match.index!;
    const rel = readHtmlAttr(tag, "rel");
    const href = readHtmlAttr(tag, "href");
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, href);
    if (!resolved) continue;
    pending.push({
      start,
      end: start + tag.length,
      resolved,
      build: (css) => buildInlineStyleBlock(tag, href, css),
    });
  }

  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi,
  )) {
    const tag = match[0];
    const start = match.index!;
    const src = readHtmlAttr(tag, "src");
    if (!src) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, src);
    if (!resolved) continue;
    pending.push({
      start,
      end: start + tag.length,
      resolved,
      build: (js) => buildInlineScriptBlock(tag, js),
    });
  }

  if (pending.length === 0) return html;

  if (pending.length > maxCandidates) {
    throw new InlineAssetsLimitError(
      `found ${pending.length} candidates, exceeds maxCandidates ${maxCandidates}`,
      "candidates",
    );
  }

  pending.sort((a, b) => a.start - b.start);

  let runningBytes = ownerBytes;
  let totalAborted = false;

  const replacements = await runWithConcurrency(
    pending,
    maxReadConcurrency,
    async (p) => {
      if (totalAborted) return null;
      const handle = await fileReader(p.resolved);
      if (handle == null) return null;
      if (handle.size > maxAssetBytes) return null;
      if (runningBytes + handle.size > maxTotalBytes) {
        totalAborted = true;
        return null;
      }
      runningBytes += handle.size;
      const content = await handle.read();
      if (content == null) {
        runningBytes -= handle.size;
        return null;
      }
      const actualBytes = Buffer.byteLength(content, "utf8");
      if (actualBytes > maxAssetBytes) {
        runningBytes -= handle.size;
        return null;
      }
      runningBytes += actualBytes - handle.size;
      if (runningBytes > maxTotalBytes) {
        totalAborted = true;
        return null;
      }
      return p.build(content);
    },
  );

  if (totalAborted) {
    throw new InlineAssetsLimitError(
      `running total exceeded maxTotalBytes ${maxTotalBytes} during reads`,
      "total",
    );
  }

  const parts: string[] = [];
  let cursor = 0;
  let totalBytes = 0;
  const guard = (segment: string) => {
    totalBytes += Buffer.byteLength(segment, "utf8");
    if (totalBytes > maxTotalBytes) {
      throw new InlineAssetsLimitError(
        `assembled output ${totalBytes} bytes exceeds maxTotalBytes ${maxTotalBytes}`,
        "total",
      );
    }
  };
  for (let i = 0; i < pending.length; i++) {
    const { start, end } = pending[i]!;
    const replacement = replacements[i];
    const before = html.slice(cursor, start);
    guard(before);
    parts.push(before);
    const inject = replacement ?? html.slice(start, end);
    guard(inject);
    parts.push(inject);
    cursor = end;
  }
  const tail = html.slice(cursor);
  guard(tail);
  parts.push(tail);
  return parts.join("");
}

/**
 * Run `fn` over `items` with at most `limit` invocations in flight at any
 * moment. Order of `items` and of the returned results is preserved.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

const STYLE_PRESERVED_LINK_ATTRS = ["media", "title", "nonce"] as const;
const STYLE_PRESERVED_BOOLEAN_ATTRS = ["disabled"] as const;

function buildInlineStyleBlock(tag: string, href: string, css: string): string {
  const carried: string[] = [];
  for (const name of STYLE_PRESERVED_LINK_ATTRS) {
    const value = readHtmlAttr(tag, name);
    if (value != null) carried.push(`${name}="${escapeHtmlAttr(value)}"`);
  }
  for (const name of STYLE_PRESERVED_BOOLEAN_ATTRS) {
    if (hasBooleanHtmlAttr(tag, name)) carried.push(name);
  }
  const attrString = carried.length === 0 ? "" : ` ${carried.join(" ")}`;
  return (
    `<style data-od-inline-asset="${escapeHtmlAttr(href)}"${attrString}>\n` +
    `${css.replace(/<\/style/gi, "<\\/style")}\n</style>`
  );
}

function buildInlineScriptBlock(tag: string, js: string): string {
  const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? "<script>";
  const attrs = open
    .replace(/^<script/i, "")
    .replace(/>$/i, "")
    .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, "");
  return `<script${attrs}>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

export function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf("/");
  return idx >= 0 ? fileName.slice(0, idx + 1) : "";
}

export function resolveProjectRelativePath(
  ownerFileName: string,
  assetRef: string,
): string | null {
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== "https://od.local") return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i"),
  );
  return match?.[2] ?? null;
}

const ATTR_VALUE_QUOTE_DOUBLE_RE = /=\s*"[^"]*"/g;
const ATTR_VALUE_QUOTE_SINGLE_RE = /=\s*'[^']*'/g;
export function hasBooleanHtmlAttr(tag: string, name: string): boolean {
  const stripped = tag
    .replace(ATTR_VALUE_QUOTE_DOUBLE_RE, '=""')
    .replace(ATTR_VALUE_QUOTE_SINGLE_RE, "=''");
  return new RegExp(`\\s${name}(?=\\s|=|/?>)`, "i").test(stripped);
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
