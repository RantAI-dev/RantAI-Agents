/**
 * Public design-system importers (GitHub + shadcn) for the cloud web port.
 *
 * Upstream open-design's daemon imported design systems by cloning a repo
 * (`apps/daemon/src/design-systems/github-import.ts` → `git clone --depth 1`)
 * or materializing a shadcn registry item into a temp dir
 * (`apps/daemon/src/design-systems/shadcn-import.ts`), then running a full
 * local-filesystem scan (`import.ts` → tokens.css / DESIGN.md / manifest.json).
 * That pipeline needs a local FS + the `git` binary, neither of which exists in
 * a multi-tenant serverless port.
 *
 * This adapter is the portable equivalent: a SERVER-SIDE fetch of PUBLIC
 * content (no account, no token) over an https host ALLOWLIST, extracting the
 * same signal the daemon derives — CSS custom properties, a Tailwind config,
 * a shadcn `cssVars` theme, or a repo's own DESIGN.md — into a composed
 * DESIGN.md + tokens, then persisting through the user design-system store
 * (`createUserDesignSystem`, source='user', isEditable). It does NOT clone or
 * touch the filesystem.
 *
 * SSRF SAFETY (see `assertAllowedUrl`): only https to a fixed allowlist of
 * GitHub + well-known shadcn registry hosts is permitted; private / loopback /
 * link-local IP literals are refused; redirects are disabled (`redirect:
 * 'error'`) so a validated host cannot bounce to an internal target; every
 * response is size-capped and time-bounded, and each import shares one
 * whole-import request budget.
 */
import "server-only";
import { isIP } from "node:net";
import type { DesignSystemProvenance } from "@open-design/contracts";
import type { DesignContext } from "./auth";
import {
  createUserDesignSystem,
  type UserDesignSystemInput,
} from "./user-design-systems";
import type { DesignSystemDetail } from "@open-design/contracts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Import failure carrying an HTTP status + daemon-style error code, so route
 *  handlers can translate it straight into `apiError(status, code, message)`. */
export class DesignImportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DesignImportError";
  }
}

function badRequest(message: string): DesignImportError {
  return new DesignImportError(400, "BAD_REQUEST", message);
}

// ---------------------------------------------------------------------------
// SSRF egress policy
// ---------------------------------------------------------------------------

const GITHUB_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "api.github.com",
]);

// First-party shadcn + well-known public shadcn registry / theme hosts. Direct
// registry URLs must resolve to one of these (or a GitHub host); the CLI
// shorthand `<owner>/<repo>/<item>` resolves to raw.githubusercontent.com,
// which is already covered by GITHUB_HOSTS.
const SHADCN_HOSTS = new Set([
  "ui.shadcn.com",
  "shadcn.com",
  "www.shadcn.com",
  "tweakcn.com",
  "www.tweakcn.com",
  "registry.shadcn.io",
]);

const ALLOWED_HOSTS = new Set<string>([...GITHUB_HOSTS, ...SHADCN_HOSTS]);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "rantai-agents-design-import";

/**
 * Reject anything that isn't https to an allowlisted public host. IP literals
 * never appear in the allowlist, so they are refused implicitly — but we also
 * classify private / loopback / link-local ranges explicitly as defense in
 * depth (and to give a precise error).
 */
function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(`not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:") {
    throw badRequest("only https:// URLs are supported for imports");
  }
  let host = url.hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (isPrivateAddress(host)) {
    throw badRequest(
      `refusing to fetch "${url.hostname}": private, loopback, and link-local addresses are not allowed`,
    );
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw badRequest(
      `host "${url.hostname}" is not on the import allowlist (GitHub or a known shadcn registry host only)`,
    );
  }
  return url;
}

/** True for loopback / private / link-local IP literals (v4 or v6). */
function isPrivateAddress(host: string): boolean {
  const kind = isIP(host);
  if (kind === 0) {
    // Not an IP literal. Pure-decimal / hex hosts are obfuscated IP encodings.
    return /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
  }
  if (kind === 4) {
    const p = host.split(".").map(Number);
    const [a, b] = p;
    if (a === undefined || b === undefined) return true;
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  // IPv6
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true;
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (mapped?.[1]) return isPrivateAddress(mapped[1]);
  const head = h.split(":")[0] ?? "";
  if (head.startsWith("fc") || head.startsWith("fd")) return true; // ULA
  if (/^fe[89ab]/.test(head)) return true; // link-local
  return false;
}

/** A per-import shared budget: caps total network requests so a hostile
 *  registry / repo cannot fan out into an unbounded number of fetches. */
function makeFetchBudget(maxRequests: number) {
  let count = 0;
  return async function budgetedFetchText(
    raw: string,
    opts: { accept?: string; optional?: boolean } = {},
  ): Promise<string | null> {
    const url = assertAllowedUrl(raw);
    count += 1;
    if (count > maxRequests) {
      throw badRequest(`import exceeded its ${maxRequests}-request budget`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (opts.accept) headers.Accept = opts.accept;
      let resp: Response;
      try {
        resp = await fetch(url.toString(), {
          redirect: "error",
          signal: controller.signal,
          headers,
        });
      } catch (err) {
        if (opts.optional) return null;
        if (isAbortError(err)) throw badRequest(`timed out fetching ${raw}`);
        throw badRequest(`could not fetch ${raw}: ${errMessage(err)}`);
      }
      if (resp.status === 403 || resp.status === 429) {
        // GitHub's unauthenticated rate limit (60 req/hr/IP) — surface it
        // clearly rather than as a generic failure.
        if (opts.optional) return null;
        throw new DesignImportError(
          502,
          "UPSTREAM_RATE_LIMIT",
          `upstream host rate-limited the request (HTTP ${resp.status}); try again later`,
        );
      }
      if (resp.status === 404) {
        if (opts.optional) return null;
        throw badRequest(`not found: ${raw} (HTTP 404)`);
      }
      if (!resp.ok) {
        if (opts.optional) return null;
        throw badRequest(
          `could not fetch ${raw}: HTTP ${resp.status} ${resp.statusText}`.trimEnd(),
        );
      }
      const declared = Number(resp.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
        throw badRequest(`${raw} exceeds the ${MAX_DOCUMENT_BYTES}-byte limit`);
      }
      let text: string;
      try {
        text = await resp.text();
      } catch (err) {
        if (opts.optional) return null;
        if (isAbortError(err)) throw badRequest(`timed out reading ${raw}`);
        throw badRequest(`could not read ${raw}: ${errMessage(err)}`);
      }
      if (text.length > MAX_DOCUMENT_BYTES) {
        throw badRequest(`${raw} exceeds the ${MAX_DOCUMENT_BYTES}-byte limit`);
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}

type FetchText = ReturnType<typeof makeFetchBudget>;

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Color conversion (→ #rrggbb) so swatches/DESIGN.md carry literal hex the
// store's extractSwatches() understands, regardless of the source color space.
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function toHex2(n: number): string {
  return Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function normalizeHexColor(raw: string): string | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? "";
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  else if (hex.length === 4)
    hex = hex.split("").map((c) => c + c).join("").slice(0, 6);
  else if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6) return null;
  return `#${hex.toLowerCase()}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = clamp01(s / 100);
  const lN = clamp01(l / 100);
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lN - c / 2;
  return rgbToHex(r + m, g + m, b + m);
}

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** oklch(L C H) → #rrggbb (Björn Ottosson's Oklab → linear sRGB → sRGB). */
function oklchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl));
}

function num(raw: string): number {
  const t = raw.trim();
  if (t.endsWith("%")) return parseFloat(t);
  return parseFloat(t);
}

/**
 * Best-effort convert any CSS color value to #rrggbb, or null when it is not a
 * resolvable literal color (e.g. `var(...)`, `calc(...)`, a keyword, a font).
 * Handles hex, rgb()/rgba(), hsl()/hsla(), oklch(), and the bare HSL triplet
 * shadcn stores in Tailwind-v3 themes ("222.2 47.4% 11.2%").
 */
export function cssColorToHex(input: string): string | null {
  const v = input.trim();
  if (!v) return null;

  const hex = normalizeHexColor(v);
  if (hex) return hex;

  const rgb = /^rgba?\(\s*([^)]+)\)$/i.exec(v);
  if (rgb) {
    const parts = (rgb[1] ?? "").split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const conv = (p: string): number =>
        p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p);
      const r = conv(parts[0] ?? "");
      const g = conv(parts[1] ?? "");
      const b = conv(parts[2] ?? "");
      if ([r, g, b].every(Number.isFinite))
        return rgbToHex(r / 255, g / 255, b / 255);
    }
    return null;
  }

  const hsl = /^hsla?\(\s*([^)]+)\)$/i.exec(v);
  if (hsl) {
    const parts = (hsl[1] ?? "").split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const h = parseFloat((parts[0] ?? "").replace(/deg$/i, ""));
      const s = parseFloat(parts[1] ?? "");
      const l = parseFloat(parts[2] ?? "");
      if ([h, s, l].every(Number.isFinite)) return hslToHex(h, s, l);
    }
    return null;
  }

  const oklch = /^oklch\(\s*([^)]+)\)$/i.exec(v);
  if (oklch) {
    const parts = (oklch[1] ?? "").split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      let L = num(parts[0] ?? "");
      if ((parts[0] ?? "").endsWith("%")) L = L / 100;
      const C = num(parts[1] ?? "");
      const H = num(parts[2] ?? "");
      if ([L, C, H].every(Number.isFinite)) return oklchToHex(L, C, H);
    }
    return null;
  }

  // Bare HSL triplet (Tailwind-v3 shadcn): "222.2 47.4% 11.2%".
  const triplet =
    /^(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%(?:\s*\/\s*[\d.]+%?)?$/.exec(v);
  if (triplet) {
    const h = parseFloat(triplet[1] ?? "");
    const s = parseFloat(triplet[2] ?? "");
    const l = parseFloat(triplet[3] ?? "");
    if ([h, s, l].every(Number.isFinite)) return hslToHex(h, s, l);
  }

  return null;
}

// ---------------------------------------------------------------------------
// CSS custom-property extraction (ported from the daemon's token-evidence
// extractor: apps/daemon/src/design-systems/token-evidence.ts).
// ---------------------------------------------------------------------------

export interface CssVar {
  name: string;
  value: string;
}

const CUSTOM_PROPERTY_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;{}\n]+);/g;

export function extractCssCustomProperties(text: string): CssVar[] {
  const out: CssVar[] = [];
  const seen = new Set<string>();
  CUSTOM_PROPERTY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CUSTOM_PROPERTY_RE.exec(text)) !== null) {
    const name = m[1];
    const value = m[2]?.trim();
    if (!name || !value || value.length > 200) continue;
    // First declaration wins (typically the light-mode :root), matching how a
    // reader resolves the cascade top-to-bottom for the default theme.
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, value });
  }
  return out;
}

// Semantic role → the substrings a var name may contain, in priority order.
// Chosen so the store's extractSwatches() (bg / support / fg / accent) always
// has strong hits for shadcn-style and generic token names alike.
const ROLE_LABELS: Array<{ label: string; needles: string[] }> = [
  { label: "Background", needles: ["background", "bg", "canvas", "page"] },
  { label: "Surface", needles: ["card", "surface", "popover", "panel"] },
  { label: "Foreground", needles: ["foreground", "text", "ink", "-fg", "fg-"] },
  { label: "Muted", needles: ["muted", "subtle", "secondary"] },
  { label: "Border", needles: ["border", "divider", "input", "ring", "outline"] },
  { label: "Primary / Brand", needles: ["primary", "brand", "accent-color"] },
  { label: "Accent", needles: ["accent"] },
  { label: "Success", needles: ["success", "positive", "green"] },
  { label: "Warning", needles: ["warning", "warn", "amber", "yellow"] },
  { label: "Danger", needles: ["destructive", "danger", "error", "red"] },
];

interface ColorPick {
  label: string;
  varName: string;
  hex: string;
}

/** Map extracted CSS vars → a labelled, hex-valued color list for the Color
 *  section. Each role picks the first var whose name matches + converts to a
 *  literal hex; unmatched color vars are appended so nothing meaningful is
 *  dropped. */
function buildColorList(vars: CssVar[]): ColorPick[] {
  const colorVars = vars
    .map((v) => ({ ...v, hex: cssColorToHex(v.value) }))
    .filter((v): v is CssVar & { hex: string } => v.hex !== null);

  const picks: ColorPick[] = [];
  const usedVars = new Set<string>();
  const usedLabels = new Set<string>();

  for (const { label, needles } of ROLE_LABELS) {
    if (usedLabels.has(label)) continue;
    const hit = colorVars.find(
      (v) =>
        !usedVars.has(v.name) &&
        needles.some((n) => v.name.toLowerCase().includes(n)),
    );
    if (hit) {
      picks.push({ label, varName: hit.name, hex: hit.hex });
      usedVars.add(hit.name);
      usedLabels.add(label);
    }
  }

  // Append remaining color vars (up to a cap) under their own names so the
  // palette stays representative for non-standard token vocabularies.
  for (const v of colorVars) {
    if (picks.length >= 16) break;
    if (usedVars.has(v.name)) continue;
    picks.push({
      label: prettyVarLabel(v.name),
      varName: v.name,
      hex: v.hex,
    });
    usedVars.add(v.name);
  }

  return picks;
}

function prettyVarLabel(varName: string): string {
  return varName
    .replace(/^--/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Reconstruct a `:root { --name: value; }` block from extracted vars, stored
 *  verbatim as the design system's `tokens`. */
function renderTokensCss(vars: CssVar[]): string {
  if (vars.length === 0) return "";
  const lines = vars.map((v) => `  ${v.name}: ${v.value};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

// ---------------------------------------------------------------------------
// GitHub import
// ---------------------------------------------------------------------------

export interface GitHubImportRequest {
  githubUrl: string;
  branch?: string;
  name?: string;
}

interface ParsedRepo {
  owner: string;
  repo: string;
  repoUrl: string;
}

function parseGitHubRepoUrl(input: string): ParsedRepo {
  const raw = (input ?? "").trim();
  if (!raw) throw badRequest("a GitHub repository URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Accept bare "owner/repo" shorthand too.
    const parts = raw.split("/").filter(Boolean);
    if (parts.length === 2 && isRepoSegment(parts[0]!) && isRepoSegment(parts[1]!)) {
      const owner = parts[0]!;
      const repo = parts[1]!.replace(/\.git$/i, "");
      return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` };
    }
    throw badRequest("GitHub URL must be a valid https://github.com/<owner>/<repo> URL");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw badRequest("only public https://github.com repositories are supported");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const rawRepo = parts[1];
  if (!owner || !rawRepo) {
    throw badRequest("GitHub URL must point to a repository (…/<owner>/<repo>)");
  }
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!isRepoSegment(owner) || !isRepoSegment(repo)) {
    throw badRequest("GitHub owner/repo contains unsupported characters");
  }
  return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` };
}

function isRepoSegment(v: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(v) && !v.startsWith(".") && !v.endsWith(".");
}

function cleanBranch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  if (!/^[A-Za-z0-9._/-]+$/.test(t) || t.includes("..") || t.startsWith("/")) {
    throw badRequest("branch contains unsupported characters");
  }
  return t;
}

// Candidate design/token files, relative to the repo root. Mirrors the file
// kinds the daemon's local scan cares about (CSS custom properties, Tailwind
// config, a DESIGN.md, package.json, README) without walking the whole tree.
const CSS_CANDIDATES = [
  "app/globals.css",
  "src/app/globals.css",
  "styles/globals.css",
  "src/styles/globals.css",
  "app/styles/globals.css",
  "src/index.css",
  "app/index.css",
  "index.css",
  "globals.css",
  "src/styles/tokens.css",
  "styles/tokens.css",
  "tokens.css",
  "src/app/app.css",
];
const TAILWIND_CANDIDATES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
];
const DESIGN_CANDIDATES = ["DESIGN.md", "design.md", "docs/DESIGN.md"];

const TAILWIND_HEX_RE = /['"](#[0-9a-fA-F]{3,8})['"]/g;

function rawUrl(owner: string, repo: string, ref: string, filePath: string): string {
  const encRef = ref.split("/").map(encodeURIComponent).join("/");
  const encPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encRef}/${encPath}`;
}

interface RepoMeta {
  defaultBranch: string | undefined;
  description: string | undefined;
}

async function fetchRepoMeta(
  owner: string,
  repo: string,
  fetchText: FetchText,
): Promise<RepoMeta> {
  const text = await fetchText(`https://api.github.com/repos/${owner}/${repo}`, {
    accept: "application/vnd.github+json",
    optional: true,
  });
  if (!text) return { defaultBranch: undefined, description: undefined };
  try {
    const json = JSON.parse(text) as {
      default_branch?: unknown;
      description?: unknown;
    };
    return {
      defaultBranch:
        typeof json.default_branch === "string" ? json.default_branch : undefined,
      description: typeof json.description === "string" ? json.description : undefined,
    };
  } catch {
    return { defaultBranch: undefined, description: undefined };
  }
}

export async function importGitHubDesignSystem(
  ctx: DesignContext,
  req: GitHubImportRequest,
): Promise<DesignSystemDetail> {
  const { owner, repo, repoUrl } = parseGitHubRepoUrl(req.githubUrl);
  const requestedBranch = cleanBranch(req.branch);
  // Budget covers two full candidate-file scans (main + master fallback, ~24
  // fetches each) plus the repo-metadata call, so a master-only repo still
  // imports when the GitHub API is rate-limited, and a truly empty repo reaches
  // the "no design signal" error rather than tripping the request cap.
  const fetchText = makeFetchBudget(80);

  const meta = await fetchRepoMeta(owner, repo, fetchText);
  // Branch resolution order: explicit request → repo default → main → master.
  const branchCandidates = requestedBranch
    ? [requestedBranch]
    : [meta.defaultBranch, "main", "master"].filter(
        (b, i, arr): b is string => !!b && arr.indexOf(b) === i,
      );

  // Fetch candidate files across branches until one branch yields signal.
  let usedBranch = branchCandidates[0] ?? "main";
  let cssTexts: string[] = [];
  let tailwindText: string | null = null;
  let designMdText: string | null = null;
  let packageJsonText: string | null = null;
  let readmeText: string | null = null;

  for (const branch of branchCandidates) {
    const [css, tw, design, pkg, readme] = await Promise.all([
      Promise.all(
        CSS_CANDIDATES.map((f) =>
          fetchText(rawUrl(owner, repo, branch, f), { optional: true }),
        ),
      ),
      firstOf(TAILWIND_CANDIDATES, (f) =>
        fetchText(rawUrl(owner, repo, branch, f), { optional: true }),
      ),
      firstOf(DESIGN_CANDIDATES, (f) =>
        fetchText(rawUrl(owner, repo, branch, f), { optional: true }),
      ),
      fetchText(rawUrl(owner, repo, branch, "package.json"), { optional: true }),
      firstOf(["README.md", "readme.md", "Readme.md"], (f) =>
        fetchText(rawUrl(owner, repo, branch, f), { optional: true }),
      ),
    ]);
    const cssHits = css.filter((t): t is string => !!t);
    if (
      cssHits.length > 0 ||
      tw ||
      design ||
      pkg ||
      readme
    ) {
      usedBranch = branch;
      cssTexts = cssHits;
      tailwindText = tw;
      designMdText = design;
      packageJsonText = pkg;
      readmeText = readme;
      break;
    }
  }

  // Derive tokens + palette.
  const cssVars: CssVar[] = [];
  const seenVar = new Set<string>();
  for (const css of cssTexts) {
    for (const v of extractCssCustomProperties(css)) {
      if (seenVar.has(v.name)) continue;
      seenVar.add(v.name);
      cssVars.push(v);
    }
  }

  const tailwindSignals = tailwindText ? detectTailwindSignals(tailwindText) : [];
  const tailwindHexes = tailwindText ? extractTailwindHexes(tailwindText) : [];

  let colors = buildColorList(cssVars);
  if (colors.length === 0 && tailwindHexes.length > 0) {
    colors = tailwindHexes.slice(0, 12).map((hex, i) => ({
      label: `Palette ${i + 1}`,
      varName: `tailwind[${i}]`,
      hex,
    }));
  }

  const pkg = parsePackageJson(packageJsonText);
  const displayName = cleanDisplayName(
    req.name || pkg.name || repo,
  );
  const description =
    cleanText(pkg.description) ||
    cleanText(meta.description) ||
    firstReadmeParagraph(readmeText) ||
    `Design system imported from the public GitHub repository ${owner}/${repo}.`;

  if (cssVars.length === 0 && colors.length === 0 && !designMdText && !readmeText && !pkg.name) {
    throw badRequest(
      `no design signal found in ${owner}/${repo}: no CSS custom properties, Tailwind config, DESIGN.md, README, or package.json were reachable on ${branchCandidates.join("/")}`,
    );
  }

  const body = renderGitHubDesignMd({
    displayName,
    description,
    owner,
    repo,
    repoUrl,
    branch: usedBranch,
    colors,
    cssVars,
    tailwindSignals,
    stack: pkg.tech,
    hasDesignMd: !!designMdText,
    readmeExcerpt: readmeExcerpt(readmeText),
  });

  const provenance: DesignSystemProvenance = {
    sourceUrls: [repoUrl],
    githubUrls: [repoUrl],
    sourceNotes: `Imported from GitHub ${owner}/${repo} (branch ${usedBranch}).`,
  };

  const input: UserDesignSystemInput = {
    title: displayName,
    category: "Imported",
    surface: "web",
    summary: description.slice(0, 240),
    body,
    tokens: renderTokensCss(cssVars) || undefined,
    provenance,
  };
  return createUserDesignSystem(ctx, input);
}

async function firstOf<T>(
  keys: string[],
  fn: (key: string) => Promise<T | null>,
): Promise<T | null> {
  for (const key of keys) {
    const result = await fn(key);
    if (result) return result;
  }
  return null;
}

function detectTailwindSignals(text: string): string[] {
  const signals = new Set<string>();
  for (const key of ["colors", "fontFamily", "borderRadius", "spacing", "boxShadow"]) {
    if (new RegExp(`\\b${key}\\s*:`).test(text)) signals.add(key);
  }
  return [...signals];
}

function extractTailwindHexes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  TAILWIND_HEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAILWIND_HEX_RE.exec(text)) !== null) {
    const hex = normalizeHexColor(m[1] ?? "");
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      out.push(hex);
    }
  }
  return out;
}

function parsePackageJson(text: string | null): {
  name?: string;
  description?: string;
  tech: string[];
} {
  if (!text) return { tech: [] };
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const deps = {
      ...(isRecord(json.dependencies) ? json.dependencies : {}),
      ...(isRecord(json.devDependencies) ? json.devDependencies : {}),
    };
    const tech = Object.keys(deps).filter((n) =>
      ["tailwindcss", "@tailwindcss", "react", "vue", "svelte", "next", "vite", "framer-motion"].some(
        (needle) => n.includes(needle),
      ),
    );
    return {
      name: typeof json.name === "string" ? json.name : undefined,
      description: typeof json.description === "string" ? json.description : undefined,
      tech,
    };
  } catch {
    return { tech: [] };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstReadmeParagraph(text: string | null): string | undefined {
  if (!text) return undefined;
  const compact = compactMarkdown(text);
  const first = compact.split("\n").find((l) => l.length > 0 && !l.startsWith("#"));
  return first ? first.slice(0, 240) : undefined;
}

function readmeExcerpt(text: string | null): string | undefined {
  if (!text) return undefined;
  return compactMarkdown(text).slice(0, 1200) || undefined;
}

function compactMarkdown(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join("\n");
}

interface GitHubDesignMdInput {
  displayName: string;
  description: string;
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  colors: ColorPick[];
  cssVars: CssVar[];
  tailwindSignals: string[];
  stack: string[];
  hasDesignMd: boolean;
  readmeExcerpt: string | undefined;
}

function renderGitHubDesignMd(i: GitHubDesignMdInput): string {
  const colorLines =
    i.colors.length > 0
      ? i.colors.map((c) => `- **${c.label}:** \`${c.hex}\` (\`${c.varName}\`)`)
      : ["- No literal color tokens were resolvable; using a neutral fallback palette."];
  const tokenLines =
    i.cssVars.length > 0
      ? i.cssVars.slice(0, 40).map((v) => `- \`${v.name}: ${v.value}\``)
      : ["- No CSS custom properties were found in the scanned stylesheets."];
  return [
    `# ${i.displayName}`,
    "",
    "> Category: Imported",
    "> Surface: web",
    "",
    i.description,
    "",
    "## Source",
    "",
    `- Repository: ${i.repoUrl}`,
    `- Branch: \`${i.branch}\``,
    `- Extracted CSS custom properties: ${i.cssVars.length}`,
    i.tailwindSignals.length > 0
      ? `- Tailwind config signals: ${i.tailwindSignals.join(", ")}`
      : "- Tailwind config signals: none detected",
    i.stack.length > 0
      ? `- Detected stack: ${i.stack.map((s) => `\`${s}\``).join(", ")}`
      : "- Detected stack: not declared",
    i.hasDesignMd ? "- Repository ships its own DESIGN.md (excerpted below)." : "",
    "",
    "## Color",
    "",
    ...colorLines,
    "",
    "## Design Tokens",
    "",
    ...tokenLines,
    "",
    "## Product Notes",
    "",
    i.readmeExcerpt ??
      "No README summary was found. Preserve the imported tokens and component proportions when generating new work.",
    "",
    "## Agent Guidance",
    "",
    "- Use the Color tokens above as the first source of truth for color roles.",
    "- Preserve the semantic role of each extracted token before inventing new values.",
    "- Treat the raw Design Tokens list as the source-of-record token vocabulary.",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n(##)/g, "\n\n$1")
    .concat("\n");
}

// ---------------------------------------------------------------------------
// shadcn import
// ---------------------------------------------------------------------------

export interface ShadcnImportRequest {
  reference: string;
  name?: string;
}

type ShadcnCssVars = {
  theme?: Record<string, unknown>;
  light?: Record<string, unknown>;
  dark?: Record<string, unknown>;
};

interface ShadcnRegistryItem {
  name?: string;
  type?: string;
  title?: string;
  description?: string;
  homepage?: string;
  cssVars?: ShadcnCssVars;
}

interface ShadcnRegistry {
  name?: string;
  homepage?: string;
  items?: ShadcnRegistryItem[];
  include?: unknown;
}

type ParsedShadcnRef =
  | { kind: "url"; url: string; item?: string }
  | { kind: "github"; owner: string; repo: string; item: string; ref?: string };

const DEFAULT_GITHUB_REFS = ["main", "master"] as const;
const MAX_INCLUDE_DEPTH = 3;

function parseShadcnReference(input: string): ParsedShadcnRef {
  const trimmed = (input ?? "").trim();
  if (!trimmed) throw badRequest("a shadcn registry reference is required");

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw badRequest("reference is not a valid URL");
    }
    // Host allowlist is enforced again at fetch time; validate up front too.
    assertAllowedUrl(url.toString());
    let fragment = "";
    if (url.hash) {
      try {
        fragment = decodeURIComponent(url.hash.replace(/^#/, "")).trim();
      } catch {
        throw badRequest("reference fragment is not valid percent-encoding");
      }
    }
    const clean = `${url.origin}${url.pathname}${url.search}`;
    return { kind: "url", url: clean, ...(fragment ? { item: fragment } : {}) };
  }

  const hashIndex = trimmed.indexOf("#");
  const pathPart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const refPart = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : "";
  const segments = pathPart.split("/").filter(Boolean);
  if (segments.length !== 3) {
    throw badRequest(
      'shadcn reference must be "<owner>/<repo>/<item>" or an https URL to a registry item',
    );
  }
  const [owner, repo, item] = segments as [string, string, string];
  for (const [label, seg] of [
    ["owner", owner],
    ["repo", repo],
    ["item", item],
  ] as const) {
    if (!isRepoSegment(seg)) {
      throw badRequest(`shadcn reference ${label} contains unsupported characters`);
    }
  }
  const ref = refPart.trim();
  if (ref && (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes("..") || ref.startsWith("/"))) {
    throw badRequest("shadcn reference git ref contains unsupported characters");
  }
  return { kind: "github", owner, repo, item, ...(ref ? { ref } : {}) };
}

interface ResolvedShadcnItem {
  item: ShadcnRegistryItem;
  registryUrl: string;
  homepage?: string;
}

async function fetchJson(url: string, fetchText: FetchText): Promise<unknown> {
  const text = await fetchText(url, { accept: "application/json" });
  try {
    return JSON.parse(text ?? "");
  } catch {
    throw badRequest(`registry document at ${url} is not valid JSON`);
  }
}

function isUsableItem(v: unknown): v is ShadcnRegistryItem {
  if (!isRecord(v)) return false;
  return (
    typeof v.name === "string" || v.cssVars !== undefined || Array.isArray(v.files)
  );
}

async function locateItemInRegistry(
  registryUrl: string,
  itemName: string,
  fetchText: FetchText,
  visited: Set<string>,
  depth: number,
): Promise<{ item: ShadcnRegistryItem; homepage?: string } | undefined> {
  if (depth > MAX_INCLUDE_DEPTH || visited.has(registryUrl)) return undefined;
  visited.add(registryUrl);
  const registry = (await fetchJson(registryUrl, fetchText)) as ShadcnRegistry;
  const homepage = typeof registry.homepage === "string" ? registry.homepage : undefined;
  if (Array.isArray(registry.items)) {
    const item = registry.items.find((e) => e?.name === itemName);
    if (item) return { item, ...(homepage ? { homepage } : {}) };
  }
  if (Array.isArray(registry.include)) {
    for (const entry of registry.include.slice(0, 50)) {
      if (typeof entry !== "string" || !entry.trim()) continue;
      let includedUrl: string;
      try {
        includedUrl = new URL(entry, registryUrl).toString();
      } catch {
        continue;
      }
      const match = await locateItemInRegistry(
        includedUrl,
        itemName,
        fetchText,
        visited,
        depth + 1,
      );
      if (match) return match;
    }
  }
  return undefined;
}

async function resolveShadcnItem(
  parsed: ParsedShadcnRef,
  fetchText: FetchText,
): Promise<ResolvedShadcnItem> {
  if (parsed.kind === "url") {
    const doc = await fetchJson(parsed.url, fetchText);
    const registry = doc as ShadcnRegistry;
    const isIndex = Array.isArray(registry.items) || Array.isArray(registry.include);
    if (isIndex) {
      if (!parsed.item) {
        throw badRequest('that URL is a registry index; append "#<item>" to choose an item');
      }
      const match = await locateItemInRegistry(parsed.url, parsed.item, fetchText, new Set(), 0);
      if (!match) throw badRequest(`registry has no item named "${parsed.item}"`);
      return {
        item: match.item,
        registryUrl: parsed.url,
        ...(match.homepage ? { homepage: match.homepage } : {}),
      };
    }
    if (!isUsableItem(doc)) {
      throw badRequest("URL did not return a shadcn registry item (no name, cssVars, or files)");
    }
    const item = doc as ShadcnRegistryItem;
    return {
      item,
      registryUrl: parsed.url,
      ...(typeof item.homepage === "string" ? { homepage: item.homepage } : {}),
    };
  }

  const refs = parsed.ref ? [parsed.ref] : [...DEFAULT_GITHUB_REFS];
  let lastError: unknown;
  for (const ref of refs) {
    const registryUrl = rawUrl(parsed.owner, parsed.repo, ref, "registry.json");
    try {
      const match = await locateItemInRegistry(registryUrl, parsed.item, fetchText, new Set(), 0);
      if (match) {
        return {
          item: match.item,
          registryUrl,
          homepage: match.homepage ?? `https://github.com/${parsed.owner}/${parsed.repo}`,
        };
      }
      lastError = badRequest(
        `registry for ${parsed.owner}/${parsed.repo} has no item named "${parsed.item}"`,
      );
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof DesignImportError) throw lastError;
  throw badRequest(
    `could not load registry.json for ${parsed.owner}/${parsed.repo}: ${errMessage(lastError)}`,
  );
}

/** Merge shadcn cssVars sections into a flat CssVar[] (theme first, then
 *  light), normalizing bare HSL triplets back into hsl() so downstream token
 *  readers and the color converter agree. */
function shadcnCssVars(cssVars: ShadcnCssVars | undefined, section: "light" | "dark"): CssVar[] {
  const out: CssVar[] = [];
  const seen = new Set<string>();
  const push = (obj: Record<string, unknown> | undefined) => {
    if (!obj) return;
    for (const [key, value] of Object.entries(obj)) {
      const name = `--${key.replace(/^--/, "")}`;
      if (!/^--[A-Za-z0-9_-]+$/.test(name) || seen.has(name)) continue;
      const raw = String(value);
      if (/[;{}]/.test(raw) || /[\r\n]/.test(raw)) continue;
      seen.add(name);
      out.push({ name, value: wrapBareHsl(raw) });
    }
  };
  push(cssVars?.theme);
  push(section === "light" ? cssVars?.light : cssVars?.dark);
  return out;
}

/** shadcn (Tailwind v3) stores bare HSL triplets because the config wraps them
 *  as `hsl(var(--token))`; wrap them back so they read as real colors. Values
 *  that are already functions/hex/keywords pass through. */
function wrapBareHsl(value: string): string {
  const t = value.trim();
  if (/^(#|rgb|hsl|hwb|oklch|oklab|lab|lch|color|var|color-mix|calc)/i.test(t)) return t;
  if (/^-?[\d.]+\s+-?[\d.]+%\s+-?[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(t)) return `hsl(${t})`;
  return t;
}

function renderShadcnTokensCss(cssVars: ShadcnCssVars | undefined): string {
  const light = shadcnCssVars(cssVars, "light");
  let css = light.length > 0 ? renderTokensCss(light) : "";
  if (cssVars?.dark && Object.keys(cssVars.dark).length > 0) {
    const darkOnly = Object.entries(cssVars.dark)
      .map(([k, val]) => ({ name: `--${k.replace(/^--/, "")}`, value: wrapBareHsl(String(val)) }))
      .filter((v) => /^--[A-Za-z0-9_-]+$/.test(v.name) && !/[;{}\r\n]/.test(v.value));
    if (darkOnly.length > 0) {
      css += `\n.dark {\n${darkOnly.map((v) => `  ${v.name}: ${v.value};`).join("\n")}\n}\n`;
    }
  }
  return css;
}

export async function importShadcnDesignSystem(
  ctx: DesignContext,
  req: ShadcnImportRequest,
): Promise<DesignSystemDetail> {
  const fetchText = makeFetchBudget(60);
  const parsed = parseShadcnReference(req.reference);
  const resolved = await resolveShadcnItem(parsed, fetchText);
  const item = resolved.item;

  const lightVars = shadcnCssVars(item.cssVars, "light");
  const darkVars = shadcnCssVars(item.cssVars, "dark");
  if (lightVars.length === 0 && darkVars.length === 0 && !item.name) {
    throw badRequest(
      "shadcn reference did not resolve to a usable theme (no cssVars or name)",
    );
  }

  const colors = buildColorList(lightVars.length > 0 ? lightVars : darkVars);
  const displayName = cleanDisplayName(
    req.name || item.title || item.name || "shadcn design system",
  );
  const description =
    cleanText(item.description) ||
    `Design system imported from the shadcn registry item "${item.name ?? displayName}".`;

  const body = renderShadcnDesignMd({
    displayName,
    description,
    reference: req.reference,
    registryUrl: resolved.registryUrl,
    homepage: resolved.homepage,
    item,
    colors,
    lightVars,
    darkVars,
  });

  const provenance: DesignSystemProvenance = {
    sourceUrls: [resolved.registryUrl, ...(resolved.homepage ? [resolved.homepage] : [])],
    sourceNotes: `Imported from the shadcn registry (${req.reference}).`,
  };

  const input: UserDesignSystemInput = {
    title: displayName,
    category: "Imported",
    surface: "web",
    summary: description.slice(0, 240),
    body,
    tokens: renderShadcnTokensCss(item.cssVars) || undefined,
    provenance,
  };
  return createUserDesignSystem(ctx, input);
}

interface ShadcnDesignMdInput {
  displayName: string;
  description: string;
  reference: string;
  registryUrl: string;
  homepage: string | undefined;
  item: ShadcnRegistryItem;
  colors: ColorPick[];
  lightVars: CssVar[];
  darkVars: CssVar[];
}

function renderShadcnDesignMd(i: ShadcnDesignMdInput): string {
  const colorLines =
    i.colors.length > 0
      ? i.colors.map((c) => `- **${c.label}:** \`${c.hex}\` (\`${c.varName}\`)`)
      : ["- No literal color tokens were resolvable; using a neutral fallback palette."];
  const tokenLines =
    i.lightVars.length > 0
      ? i.lightVars.slice(0, 48).map((v) => `- \`${v.name}: ${v.value}\``)
      : ["- The registry item declared no cssVars."];
  const darkLines = i.darkVars.slice(0, 24).map((v) => `- \`${v.name}: ${v.value}\``);
  return [
    `# ${i.displayName}`,
    "",
    "> Category: Imported",
    "> Surface: web",
    "",
    i.description,
    "",
    "## Source",
    "",
    `- Reference: \`${i.reference}\``,
    `- Registry document: ${i.registryUrl}`,
    i.homepage ? `- Registry homepage: ${i.homepage}` : "- Registry homepage: not declared",
    i.item.name ? `- Item: \`${i.item.name}\`${i.item.type ? ` (${i.item.type})` : ""}` : "",
    "",
    "## Color",
    "",
    ...colorLines,
    "",
    "## Design Tokens (light)",
    "",
    ...tokenLines,
    ...(darkLines.length > 0
      ? ["", "## Design Tokens (dark)", "", ...darkLines]
      : []),
    "",
    "## Agent Guidance",
    "",
    "- Use the Color tokens above as the first source of truth for color roles.",
    "- The token names follow the shadcn/ui convention (background, foreground, primary, accent, border, ...).",
    "- Preserve semantic roles before inventing new values; the dark variants mirror the light ones.",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n(##)/g, "\n\n$1")
    .concat("\n");
}

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

function cleanText(raw: string | undefined): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

function cleanDisplayName(value: string): string {
  return (
    value
      .replace(/^@[^/]+\//, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Imported Design System"
  );
}
