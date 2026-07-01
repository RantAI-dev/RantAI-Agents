/**
 * import-od-design-systems.ts
 *
 * Build-time generator. Reads the bundled open-design catalog under
 * `reference/open-design/{design-systems,design-templates}/*` and emits a
 * COMMITTED data module at
 * `src/design/server/design-catalog.generated.ts`.
 *
 * WHY a generated module instead of reading `reference/` at runtime:
 * the reference clone is git-excluded and is NOT part of the deployed build.
 * We snapshot it into a plain-data TS module (a build artifact) so the
 * `/api/design/design-systems` + `/api/design/design-templates` route
 * handlers can serve real data with no filesystem access to `reference/`.
 *
 * The logic below faithfully mirrors the open-design daemon so the emitted
 * objects match the daemon's JSON shapes:
 *   - design systems  -> apps/daemon/src/design-systems/index.ts (listDesignSystems)
 *   - design templates -> apps/daemon/src/skills.ts (listSkills)
 *
 * Source catalog: open-design (Apache-2.0). See src/design/NOTICE.md.
 *
 * Run: `bun scripts/import-od-design-systems.ts` (from packages/rantai-agents).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dep-free helpers imported verbatim from the reference daemon (build-time
// only; not shipped). Both modules have zero imports so bun resolves them
// standalone.
import { parseFrontmatter } from "../../../reference/open-design/apps/daemon/src/design-systems/frontmatter";
import { extractSwiftColors } from "../../../reference/open-design/apps/daemon/src/design-systems/swift-colors";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(SCRIPT_DIR, "..");
const REFERENCE_ROOT = path.resolve(PKG_ROOT, "../../reference/open-design");
const DESIGN_SYSTEMS_DIR = path.join(REFERENCE_ROOT, "design-systems");
const DESIGN_TEMPLATES_DIR = path.join(REFERENCE_ROOT, "design-templates");
const OUTPUT_FILE = path.join(
  PKG_ROOT,
  "src/design/server/design-catalog.generated.ts",
);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Frontmatter = Record<string, any>;

// ---------------------------------------------------------------------------
// Design-system helpers — ported from apps/daemon/src/design-systems/index.ts
// ---------------------------------------------------------------------------

type ColorToken = { name: string; value: string };
type SwatchRow = { values: string[]; filledAllSlots: boolean };

function readFileOptional(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function isProjectManifest(value: unknown, expectedId: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== "od-design-system-project/v1") return false;
  if (record.id !== expectedId) return false;
  if (typeof record.name !== "string" || record.name.trim().length === 0)
    return false;
  if (typeof record.category !== "string" || record.category.trim().length === 0)
    return false;
  if (record.description !== undefined && typeof record.description !== "string")
    return false;
  const files = record.files;
  if (typeof files !== "object" || files === null || Array.isArray(files))
    return false;
  const fileRecord = files as Record<string, unknown>;
  return (
    fileRecord.design === "DESIGN.md" &&
    fileRecord.tokens === "tokens.css" &&
    (fileRecord.designTokens === undefined ||
      fileRecord.designTokens === "design-tokens.json") &&
    (fileRecord.tailwind === undefined ||
      fileRecord.tailwind === "tailwind-v4.css") &&
    (fileRecord.components === undefined ||
      fileRecord.components === "components.html")
  );
}

function readProjectManifest(brandRoot: string, expectedId: string): any | null {
  const raw = readFileOptional(path.join(brandRoot, "manifest.json"));
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isProjectManifest(parsed, expectedId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stringField(data: Frontmatter, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v.trim() : "";
}

const KNOWN_SURFACES = new Set(["web", "image", "video", "audio"]);
function isDesignSystemSurface(value: string | undefined): boolean {
  return value !== undefined && KNOWN_SURFACES.has(value);
}

function frontmatterSurface(data: Frontmatter): string | undefined {
  const v = stringField(data, "surface").toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? "";
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  if (hex.length === 4)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("")
      .slice(0, 8);
  return "#" + hex.toLowerCase();
}

function swatchesFromFrontmatter(data: Frontmatter): SwatchRow | null {
  const raw = data["colors"];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const hex = normalizeHex(value);
    if (!hex) continue;
    const cleanName = name.replace(/\s+/g, " ").trim().toLowerCase();
    const key = `${cleanName}|${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push({ name: cleanName, value: hex });
  }
  if (colors.length === 0) return null;
  return pickSwatchRow(colors);
}

function pickFinalSwatchRow(
  frontmatter: SwatchRow | null,
  markdownSwatches: string[],
): string[] {
  if (frontmatter !== null && frontmatter.filledAllSlots)
    return frontmatter.values;
  if (markdownSwatches.length > 0) return markdownSwatches;
  return frontmatter?.values ?? [];
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
  const m = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  return m?.[1];
}

function extractSurface(raw: string): string | undefined {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  if (!m) return undefined;
  const v = m[1]?.trim().toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

function cleanTitle(raw: string): string {
  return raw.replace(/^Design System (Inspired by|for)\s+/i, "").trim();
}

function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string): void {
    const cleanName = name
      .replace(/[*_`]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  const reA =
    /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? "", m[2] ?? "");
  const reB =
    /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? "", m[2] ?? "");
  const reC = /^[ \t]*\|(.+)\|[ \t]*$/gm;
  while ((m = reC.exec(raw)) !== null) {
    const cells = (m[1] ?? "").split("|").map((cell) => cell.trim());
    const hexCell = cells.find((cell) => /#[0-9a-fA-F]{3,8}\b/.test(cell));
    if (!hexCell) continue;
    const hex = hexCell.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? "";
    const nameCell = cells.find(
      (cell) =>
        cell.length > 0 &&
        !/#[0-9a-fA-F]{3,8}/.test(cell) &&
        !/^[-:\s]+$/.test(cell),
    );
    push(nameCell ?? "", hex);
  }
  for (const token of extractSwiftColors(raw)) push(token.name, token.hex);
  if (colors.length === 0) return [];
  return pickSwatchRow(colors).values;
}

function pickSwatchRow(colors: ColorToken[]): SwatchRow {
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
    accentHit ??
    colors.find((c) => !isNeutral(c.value))?.value ??
    colors[0]?.value ??
    "#888888";
  const support =
    supportHit ??
    colors.find((c) => isNeutral(c.value) && c.value !== bg && c.value !== fg)
      ?.value ??
    "#cccccc";
  const filledAllSlots =
    bgHit !== null && fgHit !== null && accentHit !== null && supportHit !== null;
  return { values: [bg, support, fg, accent], filledAllSlots };
}

interface GeneratedDesignSystemOut {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  surface: string;
  source: string;
  status: string;
  isEditable: boolean;
  body: string;
  packageInfo?: { manifest: any };
}

function buildDesignSystem(name: string): GeneratedDesignSystemOut | null {
  const brandRoot = path.join(DESIGN_SYSTEMS_DIR, name);
  const manifest = readProjectManifest(brandRoot, name);
  const designPath = path.join(brandRoot, manifest?.files?.design ?? "DESIGN.md");
  let raw: string;
  try {
    if (!statSync(designPath).isFile()) return null;
    raw = readFileSync(designPath, "utf8");
  } catch {
    return null;
  }
  const { data: frontmatter, body } = parseFrontmatter(raw);
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(body);
  const markdownTitle =
    titleMatch?.[1] !== undefined ? cleanTitle(titleMatch[1]) : "";
  const fallbackTitle =
    markdownTitle || stringField(frontmatter, "name") || name;
  const title = cleanTitle(manifest?.name ?? fallbackTitle);
  const frontmatterCategory = stringField(frontmatter, "category");
  const category =
    (manifest?.category ??
      extractCategory(body) ??
      frontmatterCategory) ||
    "Uncategorized";
  const markdownSummary = summarize(body);
  const markdownSwatches = extractSwatches(body);
  const frontmatterSwatchRow = swatchesFromFrontmatter(frontmatter);
  const swatches = pickFinalSwatchRow(frontmatterSwatchRow, markdownSwatches);
  const out: GeneratedDesignSystemOut = {
    id: name,
    title,
    category,
    summary:
      (manifest?.description?.trim() || markdownSummary) ||
      stringField(frontmatter, "description") ||
      "",
    swatches,
    surface:
      extractSurface(body) ?? frontmatterSurface(frontmatter) ?? "web",
    source: "built-in",
    status: "published",
    isEditable: false,
    body: raw,
  };
  if (manifest) out.packageInfo = { manifest };
  return out;
}

// ---------------------------------------------------------------------------
// Design-template (skill) helpers — ported from apps/daemon/src/skills.ts
// ---------------------------------------------------------------------------

function normalizeCraftRequires(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const slug = v.trim().toLowerCase();
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function normalizeDefaultFor(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function normalizeFidelity(value: unknown): "wireframe" | "high-fidelity" | null {
  if (value === "wireframe" || value === "high-fidelity") return value;
  return null;
}

function normalizeBoolHint(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
  }
  return null;
}

function localizedMapFromFields(
  enValue: unknown,
  zhValue: unknown,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (typeof enValue === "string" && enValue.trim()) out.en = enValue.trim();
  if (typeof zhValue === "string" && zhValue.trim()) out["zh-CN"] = zhValue.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

function localizedMapFromRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    out[key] = raw.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeCritiquePolicy(
  value: unknown,
): "required" | "opt-in" | "opt-out" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "required" || v === "opt-in" || v === "opt-out") return v;
  return null;
}

function normalizeFeatured(value: unknown): number | null {
  if (value === true) return 1;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function derivePrompt(data: Frontmatter): string {
  const explicit = data.od?.example_prompt;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const desc = typeof data.description === "string" ? data.description.trim() : "";
  if (!desc) return "";
  const collapsed = desc.replace(/\s+/g, " ").trim();
  const firstSentence = collapsed.match(/^.+?[.!?。！？](?:\s|$)/)?.[0]?.trim();
  return (firstSentence || collapsed).slice(0, 320);
}

type SkillMode =
  | "prototype"
  | "deck"
  | "template"
  | "design-system"
  | "image"
  | "video"
  | "audio";

function inferMode(body: unknown, description: unknown): SkillMode {
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/\bimage|poster|illustration|photography|图片|海报|插画/.test(hay))
    return "image";
  if (/\bvideo|motion|shortform|animation|视频|动效|短片/.test(hay)) return "video";
  if (/\baudio|music|jingle|tts|sound|音频|音乐|配音|音效/.test(hay)) return "audio";
  if (/\bppt|deck|slide|presentation|幻灯|投影/.test(hay)) return "deck";
  if (/\bdesign[- ]system|\bdesign\.md|\bdesign tokens/.test(hay))
    return "design-system";
  if (/\btemplate\b/.test(hay)) return "template";
  return "prototype";
}

function normalizeMode(
  value: unknown,
  body: unknown,
  description: unknown,
): SkillMode {
  if (
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "deck" ||
    value === "design-system" ||
    value === "template" ||
    value === "prototype"
  )
    return value;
  return inferMode(body, description);
}

const SKILL_SURFACES = new Set(["web", "image", "video", "audio"]);
function normalizeSurface(value: unknown, mode: SkillMode): string {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (SKILL_SURFACES.has(v)) return v;
  }
  if (mode === "image" || mode === "video" || mode === "audio") return mode;
  return "web";
}

function normalizePlatform(
  value: unknown,
  mode: SkillMode,
  body: unknown,
  description: unknown,
): "desktop" | "mobile" | null {
  if (value === "desktop" || value === "mobile") return value;
  if (mode !== "prototype") return null;
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/mobile|phone|ios|android|手机|移动端/.test(hay)) return "mobile";
  return "desktop";
}

function normalizeCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  if (!slug) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return slug.slice(0, 64);
}

function normalizeScenario(
  value: unknown,
  body: unknown,
  description: unknown,
): string {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v) return v;
  }
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/finance|invoice|expense|budget|p&l|revenue/.test(hay)) return "finance";
  if (/\bhr\b|onboarding|payroll|employee|人事/.test(hay)) return "hr";
  if (/marketing|campaign|brand|landing/.test(hay)) return "marketing";
  if (/runbook|incident|deploy|engineering|sre|api/.test(hay))
    return "engineering";
  if (/spec|prd|roadmap|product manager|product team/.test(hay))
    return "product";
  if (/design system|moodboard|mockup|ui kit/.test(hay)) return "design";
  if (/sales|quote|proposal|lead/.test(hay)) return "sales";
  if (/operations|ops|logistics|inventory/.test(hay)) return "operations";
  return "general";
}

function isSafeExampleKey(key: string): boolean {
  if (!key || key.startsWith(".")) return false;
  if (key.includes(":")) return false;
  return /^[A-Za-z0-9._-]+$/.test(key);
}

function collectDerivedExamples(dir: string): { key: string }[] {
  const examplesDir = path.join(dir, "examples");
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = readdirSync(examplesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { key: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".html")) continue;
    const key = entry.name.replace(/\.html$/i, "");
    if (!isSafeExampleKey(key)) continue;
    out.push({ key });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function humanizeExampleName(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

interface GeneratedDesignTemplateOut {
  id: string;
  name: string;
  displayName?: Record<string, string>;
  description: string;
  descriptionI18n?: Record<string, string>;
  triggers: unknown[];
  mode: string;
  surface: string;
  source: string;
  craftRequires: string[];
  platform: "desktop" | "mobile" | null;
  scenario: string;
  category: string | null;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  featured: number | null;
  fidelity: "wireframe" | "high-fidelity" | null;
  speakerNotes: boolean | null;
  animations: boolean | null;
  examplePrompt: string;
  examplePromptI18n?: Record<string, string>;
  aggregatesExamples: boolean;
  critiquePolicy: "required" | "opt-in" | "opt-out" | null;
  body: string;
}

function buildDesignTemplates(
  name: string,
  seenIds: Set<string>,
): GeneratedDesignTemplateOut[] {
  const dir = path.join(DESIGN_TEMPLATES_DIR, name);
  const skillPath = path.join(dir, "SKILL.md");
  let raw: string;
  try {
    if (!statSync(skillPath).isFile()) return [];
    raw = readFileSync(skillPath, "utf8");
  } catch {
    return [];
  }
  const { data, body } = parseFrontmatter(raw) as { data: Frontmatter; body: string };
  const parentId =
    typeof data.name === "string" && data.name ? data.name : name;
  if (seenIds.has(parentId)) return [];
  seenIds.add(parentId);

  const mode = normalizeMode(data.od?.mode, body, data.description);
  const surface = normalizeSurface(data.od?.surface, mode);
  const platform = normalizePlatform(data.od?.platform, mode, body, data.description);
  const scenario = normalizeScenario(data.od?.scenario, body, data.description);
  const category = normalizeCategory(data.od?.category);
  const designSystemRequired =
    typeof data.od?.design_system?.requires === "boolean"
      ? data.od.design_system.requires
      : true;
  const upstream = typeof data.od?.upstream === "string" ? data.od.upstream : null;
  const previewType =
    typeof data.od?.preview?.type === "string" ? data.od.preview.type : "html";
  const description = typeof data.description === "string" ? data.description : "";
  const displayName = localizedMapFromFields(data.en_name, data.zh_name);
  const descriptionI18n = localizedMapFromFields(
    data.en_description,
    data.zh_description,
  );
  const examplePromptI18n = localizedMapFromRecord(data.od?.example_prompt_i18n);
  const triggers = Array.isArray(data.triggers) ? data.triggers : [];
  const derivedExamples = collectDerivedExamples(dir);
  const aggregatesExamples = derivedExamples.length > 0;

  const base: Omit<GeneratedDesignTemplateOut, "id" | "name" | "craftRequires" | "defaultFor" | "featured" | "aggregatesExamples"> = {
    ...(displayName ? { displayName } : {}),
    description,
    ...(descriptionI18n ? { descriptionI18n } : {}),
    triggers,
    mode,
    surface,
    source: "built-in",
    platform,
    scenario,
    category,
    previewType,
    designSystemRequired,
    upstream,
    fidelity: normalizeFidelity(data.od?.fidelity),
    speakerNotes: normalizeBoolHint(data.od?.speaker_notes),
    animations: normalizeBoolHint(data.od?.animations),
    examplePrompt: derivePrompt(data),
    ...(examplePromptI18n ? { examplePromptI18n } : {}),
    critiquePolicy: normalizeCritiquePolicy(data.od?.critique?.policy),
    body,
  };

  const out: GeneratedDesignTemplateOut[] = [];
  out.push({
    id: parentId,
    name: parentId,
    craftRequires: normalizeCraftRequires(data.od?.craft?.requires),
    defaultFor: normalizeDefaultFor(data.od?.default_for),
    featured: normalizeFeatured(data.od?.featured),
    aggregatesExamples,
    ...base,
  });

  for (const example of derivedExamples) {
    const derivedId = `${parentId}:${example.key}`;
    if (seenIds.has(derivedId)) continue;
    seenIds.add(derivedId);
    out.push({
      id: derivedId,
      name: humanizeExampleName(example.key),
      craftRequires: [],
      defaultFor: [],
      featured: null,
      aggregatesExamples: false,
      ...base,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function listDirNames(root: string): string[] {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function main(): void {
  if (!existsSync(DESIGN_SYSTEMS_DIR)) {
    throw new Error(
      `reference catalog not found at ${DESIGN_SYSTEMS_DIR}. ` +
        `This generator must run against the read-only reference clone.`,
    );
  }

  const systems: GeneratedDesignSystemOut[] = [];
  for (const name of listDirNames(DESIGN_SYSTEMS_DIR)) {
    const sys = buildDesignSystem(name);
    if (sys) systems.push(sys);
  }
  systems.sort((a, b) => a.id.localeCompare(b.id));

  const templates: GeneratedDesignTemplateOut[] = [];
  const seenIds = new Set<string>();
  for (const name of listDirNames(DESIGN_TEMPLATES_DIR)) {
    templates.push(...buildDesignTemplates(name, seenIds));
  }
  templates.sort((a, b) => a.id.localeCompare(b.id));

  const header = `/**
 * design-catalog.generated.ts
 *
 * AUTO-GENERATED by scripts/import-od-design-systems.ts — DO NOT EDIT BY HAND.
 * Regenerate with: bun scripts/import-od-design-systems.ts
 *
 * Snapshot of the bundled open-design catalog (design systems + design
 * templates). Source: open-design, Apache-2.0. See src/design/NOTICE.md for
 * attribution. Object shapes mirror the open-design daemon:
 *   - design systems  -> DesignSystemSummary / DesignSystemDetail
 *   - design templates -> SkillSummary / SkillDetail
 *
 * ${systems.length} design systems, ${templates.length} design templates.
 */
/* eslint-disable */

export interface GeneratedDesignSystem {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  surface: string;
  source: string;
  status: string;
  isEditable: boolean;
  body: string;
  packageInfo?: { manifest: unknown };
}

export interface GeneratedDesignTemplate {
  id: string;
  name: string;
  displayName?: Record<string, string>;
  description: string;
  descriptionI18n?: Record<string, string>;
  triggers: unknown[];
  mode: string;
  surface: string;
  source: string;
  craftRequires: string[];
  platform: "desktop" | "mobile" | null;
  scenario: string;
  category: string | null;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  featured: number | null;
  fidelity: "wireframe" | "high-fidelity" | null;
  speakerNotes: boolean | null;
  animations: boolean | null;
  examplePrompt: string;
  examplePromptI18n?: Record<string, string>;
  aggregatesExamples: boolean;
  critiquePolicy: "required" | "opt-in" | "opt-out" | null;
  body: string;
}
`;

  const content =
    header +
    `\nexport const designSystems: GeneratedDesignSystem[] = ${JSON.stringify(
      systems,
      null,
      2,
    )};\n\nexport const designTemplates: GeneratedDesignTemplate[] = ${JSON.stringify(
      templates,
      null,
      2,
    )};\n`;

  writeFileSync(OUTPUT_FILE, content, "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `[import-od] wrote ${OUTPUT_FILE}\n` +
      `  design systems : ${systems.length}\n` +
      `  design templates: ${templates.length}\n` +
      `  file size       : ${(content.length / 1024).toFixed(1)} KiB`,
  );
}

main();
