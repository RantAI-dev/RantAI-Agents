/**
 * User-authored design systems store (Prisma-backed).
 *
 * The read-only bundled catalog (`design-catalog.generated.ts`, 150 systems) is
 * served by the design-systems routes as built-in presets. User-created and
 * generated systems need their OWN persistence, scoped per user + organization
 * — that lives here, in the `OdDesignSystem` table.
 *
 * This is the daemon's filesystem `USER_DESIGN_SYSTEMS_DIR` store swapped for a
 * multi-tenant Prisma table. It faithfully mirrors the daemon's derivation
 * behavior (upstream open-design
 * `apps/daemon/src/design-systems/index.ts`):
 *   - `user:` id prefix so the SPA can tell editable user systems from presets
 *   - `source: 'user'`, `isEditable: true`
 *   - a scaffolded 9-section DESIGN.md when no body is supplied
 *   - swatches extracted from the DESIGN.md body ([bg, support, fg, accent])
 *   - title/category/summary/surface derived from the body + input
 *
 * Bodies (DESIGN.md) and tokens are stored inline (`@db.Text`); the row id is
 * the full `user:<slug>-<rand>` string so route lookups round-trip directly.
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type {
  DesignSystemDetail,
  DesignSystemProvenance,
  DesignSystemSummary,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";

export const USER_ID_PREFIX = "user:";

type Surface = NonNullable<DesignSystemSummary["surface"]>;
type Status = NonNullable<DesignSystemSummary["status"]>;

/** Draft input accepted by create/update/generation, mirroring the daemon's
 *  `UserDesignSystemInput` / the SPA's `DesignSystemDraftInput`. */
export interface UserDesignSystemInput {
  title?: string;
  summary?: string;
  category?: string;
  surface?: Surface;
  status?: Status;
  body?: string;
  tokens?: string;
  sourceNotes?: string;
  provenance?: DesignSystemProvenance;
}

// ---------------------------------------------------------------------------
// Text derivation helpers — ported verbatim (behavior-preserving) from
// reference/open-design/apps/daemon/src/design-systems/index.ts.
// ---------------------------------------------------------------------------

function cleanText(raw: string | undefined): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

function cleanMultiline(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(raw: string): string {
  const ascii = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return ascii || "design-system";
}

function normalizeTitle(raw: string | undefined): string {
  return cleanText(raw) || "Untitled Design System";
}

function normalizeBody(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  return body.length > 0 ? `${body}\n` : null;
}

function firstHeading(raw: string): string | null {
  return /^#\s+(.+?)\s*$/m.exec(raw)?.[1]?.trim() ?? null;
}

function summarize(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return "";
  const afterH1 = lines.slice(firstH1 + 1);
  const nextHeading = afterH1.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? afterH1 : afterH1.slice(0, nextHeading))
    .join("\n")
    .replace(/^>\s*Category:.*$/gim, "")
    .replace(/^>\s*Surface:.*$/gim, "")
    .replace(/^>\s*/gm, "")
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? "";
}

function extractCategory(raw: string): string | undefined {
  return /^>\s*Category:\s*(.+?)\s*$/im.exec(raw)?.[1];
}

const KNOWN_SURFACES = new Set<Surface>(["web", "image", "video", "audio"]);
function extractSurface(raw: string): Surface | undefined {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  const v = m?.[1]?.trim().toLowerCase();
  return v && KNOWN_SURFACES.has(v as Surface) ? (v as Surface) : undefined;
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? "";
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 4) hex = hex.split("").map((c) => c + c).join("").slice(0, 8);
  return "#" + hex.toLowerCase();
}

interface ColorToken {
  name: string;
  value: string;
}

/** Extract up to 4 representative swatches from DESIGN.md — [bg, support, fg,
 *  accent] — mirroring the daemon's `extractSwatches` / `pickSwatchRow`. */
export function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string): void {
    const cleanName = name.replace(/[*_`]+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  // Form A: "- **Background:** `#FAFAFA`"
  const reA = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? "", m[2] ?? "");
  // Form B: "**Stripe Purple** (`#533afd`)"
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? "", m[2] ?? "");
  // Form C: markdown table rows.
  const reC = /^[ \t]*\|(.+)\|[ \t]*$/gm;
  while ((m = reC.exec(raw)) !== null) {
    const cells = (m[1] ?? "").split("|").map((cell) => cell.trim());
    const hexCell = cells.find((cell) => /#[0-9a-fA-F]{3,8}\b/.test(cell));
    if (!hexCell) continue;
    const hex = hexCell.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? "";
    const nameCell = cells.find(
      (cell) => cell.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(cell) && !/^[-:\s]+$/.test(cell),
    );
    push(nameCell ?? "", hex);
  }
  if (colors.length === 0) return [];

  function pick(hints: string[]): string | null {
    for (const h of hints) {
      const found = colors.find((c) => c.name.includes(h));
      if (found) return found.value;
    }
    return null;
  }
  function isNeutral(hex: string): boolean {
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 10;
  }

  const bgHit = pick(["page background", "background", "canvas", "paper", "surface"]);
  const fgHit = pick(["heading", "foreground", "ink", "fg", "text", "navy", "graphite"]);
  const accentHit = pick(["primary brand", "brand primary", "accent", "brand", "primary"]);
  const supportHit = pick(["border", "divider", "rule", "muted", "secondary", "subtle"]);

  const bg = bgHit ?? "#ffffff";
  const fg = fgHit ?? "#111111";
  const accent =
    accentHit ?? colors.find((c) => !isNeutral(c.value))?.value ?? colors[0]?.value ?? "#888888";
  const support =
    supportHit ??
    colors.find((c) => isNeutral(c.value) && c.value !== bg && c.value !== fg)?.value ??
    "#cccccc";

  return [bg, support, fg, accent];
}

function upsertBlockquoteMeta(body: string, key: string, value: string): string {
  const re = new RegExp(`^>\\s*${key}:\\s*.*$`, "im");
  if (re.test(body)) return body.replace(re, `> ${key}: ${value}`);
  const h1 = /^#\s+.*$/m.exec(body);
  if (!h1) return `> ${key}: ${value}\n\n${body}`;
  const insertAt = h1.index + h1[0].length;
  return `${body.slice(0, insertAt)}\n> ${key}: ${value}${body.slice(insertAt)}`;
}

function withDesignSystemHeader(
  body: string,
  input: { title: string; category: string; surface: Surface },
): string {
  let next = body.replace(/^#\s+.*$/m, `# ${input.title}`);
  if (next === body && !/^#\s+/.test(next)) next = `# ${input.title}\n\n${next}`;
  next = upsertBlockquoteMeta(next, "Category", input.category);
  next = upsertBlockquoteMeta(next, "Surface", input.surface);
  return next.endsWith("\n") ? next : `${next}\n`;
}

/** Scaffold a 9-section DESIGN.md draft — the daemon's
 *  `buildDraftDesignSystemBody`, used when no body is supplied. */
export function buildDraftDesignSystemBody(
  input: UserDesignSystemInput & { title: string },
): string {
  const category = cleanText(input.category) || "Custom";
  const surface = input.surface ?? "web";
  const summary =
    cleanText(input.summary) || "A user-authored design system for future projects.";
  const sourceNotes = cleanText(input.sourceNotes);
  return `# ${input.title}

> Category: ${category}
> Surface: ${surface}

${summary}

## 1. Visual Theme & Atmosphere

Describe the visual mood, product context, and the feeling this system should create.
${sourceNotes ? `\nSource context: ${sourceNotes}\n` : ""}
## 2. Color

List brand colors, semantic roles, background surfaces, text colors, borders, and states.

## 3. Typography

Define display, heading, body, caption, and code typography. Include fallback stacks.

## 4. Spacing

Define the spacing scale, density, radius, and layout rhythm.

## 5. Layout & Composition

Describe grids, page structure, information density, navigation, and responsive behavior.

## 6. Components

Document buttons, cards, forms, tables, navigation, modals, and product-specific components.

## 7. Motion & Interaction

Define hover, focus, loading, transition, and reduced-motion behavior.

## 8. Voice & Brand

Describe copy style, terminology, capitalization, and tone.

## 9. Anti-patterns

List visual and interaction choices the agent must avoid when generating with this system.
`;
}

function provenanceToNotes(p: DesignSystemProvenance | undefined): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.companyBlurb) parts.push(cleanMultiline(p.companyBlurb));
  if (p.notes) parts.push(cleanMultiline(p.notes));
  if (p.sourceNotes) parts.push(cleanMultiline(p.sourceNotes));
  return parts.filter(Boolean).join("\n\n");
}

function normalizeProvenance(
  input: DesignSystemProvenance | undefined,
  extra: Partial<DesignSystemProvenance>,
): DesignSystemProvenance | undefined {
  const merged: DesignSystemProvenance = { ...(input ?? {}), ...extra };
  const hasAny = Object.values(merged).some(
    (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : !!v),
  );
  return hasAny ? merged : undefined;
}

// ---------------------------------------------------------------------------
// Row <-> DTO mapping
// ---------------------------------------------------------------------------

interface DesignSystemRow {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  tokens: string | null;
  swatchesJson: string;
  surface: string;
  source: string;
  status: string;
  provenanceJson: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toSummary(row: DesignSystemRow): DesignSystemSummary {
  const provenance = parseJson<DesignSystemProvenance | undefined>(row.provenanceJson, undefined);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    swatches: parseJson<string[]>(row.swatchesJson, []),
    surface: (row.surface as Surface) || "web",
    source: "user",
    status: (row.status as Status) || "draft",
    isEditable: true,
    createdAt: new Date(Number(row.createdAt)).toISOString(),
    updatedAt: new Date(Number(row.updatedAt)).toISOString(),
    ...(provenance ? { provenance } : {}),
  };
}

function toDetail(row: DesignSystemRow): DesignSystemDetail {
  return { ...toSummary(row), body: row.body };
}

// ---------------------------------------------------------------------------
// Store operations (all scoped by userId + organizationId)
// ---------------------------------------------------------------------------

function scope(ctx: DesignContext) {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

/** List the caller's user design systems (newest first) as summaries. */
export async function listUserDesignSystems(
  ctx: DesignContext,
): Promise<DesignSystemSummary[]> {
  const rows = await prisma.odDesignSystem.findMany({
    where: scope(ctx),
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => toSummary(r as DesignSystemRow));
}

/** Fetch one user design system detail (with body), or null. */
export async function getUserDesignSystem(
  ctx: DesignContext,
  id: string,
): Promise<DesignSystemDetail | null> {
  const row = await prisma.odDesignSystem.findFirst({ where: { id, ...scope(ctx) } });
  return row ? toDetail(row as DesignSystemRow) : null;
}

/** True when an id belongs to a user (editable) system, not a preset. */
export function isUserDesignSystemId(id: string): boolean {
  return id.startsWith(USER_ID_PREFIX);
}

/** Create a user design system from an input draft. Scaffolds a DESIGN.md when
 *  no body is provided, derives category/surface/summary/swatches. */
export async function createUserDesignSystem(
  ctx: DesignContext,
  input: UserDesignSystemInput,
): Promise<DesignSystemDetail> {
  const title = normalizeTitle(input.title);
  const id = `${USER_ID_PREFIX}${slugify(title)}-${randomBytes(3).toString("hex")}`;
  const provenance = normalizeProvenance(input.provenance, {
    ...(input.summary ? { companyBlurb: input.summary } : {}),
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const sourceNotes = provenanceToNotes(provenance) || cleanMultiline(input.sourceNotes);
  const body =
    normalizeBody(input.body) ?? buildDraftDesignSystemBody({ ...input, title, sourceNotes });
  const surface = input.surface ?? extractSurface(body) ?? "web";
  const category = cleanText(input.category) || extractCategory(body) || "Custom";
  const summary = cleanText(input.summary) || summarize(body);
  const now = BigInt(Date.now());

  const row = await prisma.odDesignSystem.create({
    data: {
      id,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      title,
      category,
      summary,
      body,
      tokens: input.tokens ?? null,
      swatchesJson: JSON.stringify(extractSwatches(body)),
      surface,
      source: "user",
      status: input.status ?? "draft",
      provenanceJson: provenance ? JSON.stringify(provenance) : null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return toDetail(row as DesignSystemRow);
}

/** Update a user design system. Returns null when the id is not an editable
 *  user system owned by the caller (mirrors the daemon's guard). */
export async function updateUserDesignSystem(
  ctx: DesignContext,
  id: string,
  input: UserDesignSystemInput,
): Promise<DesignSystemDetail | null> {
  if (!isUserDesignSystemId(id)) return null;
  const existing = await prisma.odDesignSystem.findFirst({ where: { id, ...scope(ctx) } });
  if (!existing) return null;
  const existingBody = existing.body;
  const title = normalizeTitle(
    input.title ?? existing.title ?? firstHeading(existingBody) ?? id,
  );
  const category =
    cleanText(input.category) || existing.category || extractCategory(existingBody) || "Custom";
  const surface = (input.surface ??
    (existing.surface as Surface) ??
    extractSurface(existingBody) ??
    "web") as Surface;
  const nextProvenance = normalizeProvenance(input.provenance, {
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const provenance =
    nextProvenance ??
    parseJson<DesignSystemProvenance | undefined>(existing.provenanceJson, undefined);
  const body =
    normalizeBody(input.body) ?? withDesignSystemHeader(existingBody, { title, category, surface });
  const summary = cleanText(input.summary) || summarize(body);

  const row = await prisma.odDesignSystem.update({
    where: { id },
    data: {
      title,
      category,
      summary,
      body,
      ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
      swatchesJson: JSON.stringify(extractSwatches(body)),
      surface,
      status: input.status ?? (existing.status as Status) ?? "draft",
      provenanceJson: provenance ? JSON.stringify(provenance) : null,
      updatedAt: BigInt(Date.now()),
    },
  });
  return toDetail(row as DesignSystemRow);
}

/** Delete a user design system. Returns false when not an owned user system. */
export async function deleteUserDesignSystem(
  ctx: DesignContext,
  id: string,
): Promise<boolean> {
  if (!isUserDesignSystemId(id)) return false;
  const result = await prisma.odDesignSystem.deleteMany({ where: { id, ...scope(ctx) } });
  return result.count > 0;
}

/** Random id used by generation jobs. */
export function newJobId(): string {
  return randomUUID();
}
