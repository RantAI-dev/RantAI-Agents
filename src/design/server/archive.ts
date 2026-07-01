/**
 * Server-side project ZIP builder for the design SPA's "Download as .zip"
 * export.
 *
 * Upstream open-design's daemon (`apps/daemon/src/projects.ts:buildProjectArchive`)
 * walked the on-disk project tree, packed it with JSZip (DEFLATE), and appended a
 * `DESIGN-HANDOFF.md` + `DESIGN-MANIFEST.json` coding-handoff guide. The cloud
 * port stores project bytes in S3, so the route handler
 * (`src/app/api/design/projects/[id]/archive`) lists + fetches the bytes and
 * hands them to `buildProjectArchive` here.
 *
 * ZIP encoding is STORE (no compression), a self-contained port of the SPA's
 * vendored `web/runtime/zip.ts` encoder extended to binary bytes + Node Buffer.
 * We avoid JSZip/DEFLATE deliberately: the port must not add a new dependency,
 * and generated design projects (HTML/CSS/JS + a handful of assets) are small
 * enough that the compression ratio is not worth a vendored deflate. The
 * archives are standards-compliant STORE-mode ZIPs any tool can open.
 *
 * The `DESIGN-MANIFEST.json` / `DESIGN-HANDOFF.md` content mirrors the daemon's
 * builders verbatim so the exported package reads identically to open-design.
 */

export const DESIGN_HANDOFF_FILENAME = "DESIGN-HANDOFF.md";
export const DESIGN_MANIFEST_FILENAME = "DESIGN-MANIFEST.json";

// Mirrors apps/daemon/src/project-ignored-dirs.ts — generated/installed/cache
// trees excluded from the archive.
const IGNORED_PROJECT_DIR_NAMES = new Set(
  [
    ".git",
    "node_modules",
    "vendor",
    ".od",
    "debug",
    "dist",
    "build",
    ".build",
    "deriveddata",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".output",
    "out",
    "coverage",
    ".gradle",
    ".swiftpm",
    ".tmp",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    ".ruff_cache",
  ].map((name) => name.toLowerCase()),
);

export function isIgnoredProjectDirName(name: unknown): boolean {
  const normalized = String(name).toLowerCase();
  return (
    IGNORED_PROJECT_DIR_NAMES.has(normalized) ||
    normalized.startsWith("deriveddata-")
  );
}

/** Mirrors the daemon's `sanitizeArchiveFilename` (server.ts). */
export function sanitizeArchiveFilename(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// STORE-mode ZIP encoder (binary-capable port of web/runtime/zip.ts)
// ---------------------------------------------------------------------------

export interface ZipInput {
  path: string;
  bytes: Uint8Array;
  /** File mtime in ms; defaults to now. */
  mtime?: number;
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  // The DOS date field encodes the year as an offset from 1980; anything
  // earlier (e.g. `new Date(0)` epoch sentinels used for generated files)
  // underflows the 7-bit field and reads back as a nonsense future year, so
  // clamp to the 1980 floor.
  const year = Math.max(1980, d.getFullYear());
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

/** Encode a list of entries into a standards-compliant STORE-mode ZIP Buffer. */
export function buildStoredZip(inputs: ZipInput[]): Buffer {
  const enc = new TextEncoder();

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const input of inputs) {
    const nameBytes = enc.encode(input.path);
    const dataBytes = input.bytes;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;
    const { time, date } = dosTime(
      new Date(typeof input.mtime === "number" ? input.mtime : Date.now()),
    );

    // Local file header (30 bytes + name).
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 filenames
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true); // mod time
    lv.setUint16(12, date, true); // mod date
    lv.setUint32(14, crc, true); // crc-32
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);

    // Central directory header (46 bytes + name).
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // flags: UTF-8
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra len
    cv.setUint16(32, 0, true); // comment len
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // relative offset of local header
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
    centralSize += central.length;
  }

  // End of central directory record.
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, inputs.length, true);
  ev.setUint16(10, inputs.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize =
    localChunks.reduce((n, c) => n + c.length, 0) +
    centralChunks.reduce((n, c) => n + c.length, 0) +
    eocd.length;
  const out = Buffer.allocUnsafe(totalSize);
  let p = 0;
  for (const c of localChunks) {
    out.set(c, p);
    p += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

// ---------------------------------------------------------------------------
// DESIGN-MANIFEST.json / DESIGN-HANDOFF.md builders (ported from the daemon)
// ---------------------------------------------------------------------------

const FRAME_WRAPPER_FILE_RE =
  /(^|\/)(frames?\/|device-frames?\/)|(^|\/)(browser-chrome|device-frame)\.html?$/i;

function isFrameWrapperHtmlFile(file: string): boolean {
  return FRAME_WRAPPER_FILE_RE.test(file);
}

interface ProjectFileMap {
  files: string[];
  htmlFiles: string[];
  screenHtmlFiles: string[];
  cssFiles: string[];
  jsFiles: string[];
  assetFiles: string[];
  entryFile: string;
}

function projectFileMap(relPaths: string[]): ProjectFileMap {
  const files = [...relPaths].sort((a, b) => a.localeCompare(b));
  const htmlFiles = files.filter((name) => /\.html?$/i.test(name));
  const screenHtmlFiles = htmlFiles.filter(
    (name) => !isFrameWrapperHtmlFile(name),
  );
  const cssFiles = files.filter((name) => /\.css$/i.test(name));
  const jsFiles = files.filter((name) => /\.[cm]?[jt]sx?$/i.test(name));
  const assetFiles = files.filter(
    (name) =>
      !htmlFiles.includes(name) &&
      !cssFiles.includes(name) &&
      !jsFiles.includes(name),
  );
  const entryFile =
    screenHtmlFiles.find((name) => /(^|\/)index\.html$/i.test(name)) ||
    screenHtmlFiles[0] ||
    htmlFiles.find((name) => /(^|\/)index\.html$/i.test(name)) ||
    htmlFiles[0] ||
    files[0] ||
    "index.html";
  return {
    files,
    htmlFiles,
    screenHtmlFiles,
    cssFiles,
    jsFiles,
    assetFiles,
    entryFile,
  };
}

export function buildDesignManifest(
  relPaths: string[],
  projectLabel: string,
): string {
  const {
    files,
    htmlFiles,
    screenHtmlFiles,
    cssFiles,
    jsFiles,
    assetFiles,
    entryFile,
  } = projectFileMap(relPaths);
  const screenFiles = screenHtmlFiles.length > 0 ? screenHtmlFiles : [entryFile];
  return JSON.stringify(
    {
      schema: "open-design.design-manifest.v1",
      title: projectLabel || "Open Design project",
      entryFile,
      sourceFiles: {
        all: files,
        html: htmlFiles,
        css: cssFiles,
        scriptsAndComponents: jsFiles,
        assets: assetFiles,
      },
      screens: screenFiles.map((file) => {
        const isIndex = /(^|\/)index\.html?$/i.test(file);
        const isLanding =
          /(^|\/)(landing|marketing)\.html?$/i.test(file) ||
          /landing|marketing/i.test(file);
        const isOsWidget =
          /widget|live-activity|lock-screen|home-screen/i.test(file);
        const isApp =
          /app|dashboard|workspace|generator|translator|editor|screen/i.test(
            file,
          );
        return {
          file,
          role:
            isIndex && screenFiles.length > 1
              ? "launcher-overview"
              : isLanding
                ? "landing-page"
                : isOsWidget
                  ? "os-widget-surface"
                  : isApp
                    ? "product-screen"
                    : "screen",
          implementationNote:
            isIndex && screenFiles.length > 1
              ? "Use this as the navigation/overview entry only; implement each linked screen file as its own route/surface."
              : "Preserve visual hierarchy, responsive behavior, and interactive states from this screen.",
        };
      }),
      screenFilePolicy: {
        mode: "screen-file-first",
        entryFileRole:
          screenFiles.length > 1 && /(^|\/)index\.html?$/i.test(entryFile)
            ? "launcher-overview"
            : "primary-screen",
        rules: [
          "Each distinct user-facing screen or surface must be delivered and implemented as its own file/route.",
          "If a landing page is present or requested, keep it in landing.html and do not merge it into the product app screen.",
          "When multiple HTML screens exist, index.html is a launcher/overview only; it must not be treated as the combined final UI.",
          "Keep product app screens, landing pages, platform screens, and OS widget surfaces separate in production code.",
        ],
      },
      appModules: [
        "Identify domain-specific in-app modules from the exported UI; do not reduce them to generic cards.",
        "For each major module, implement purpose, default/loading/empty/error/success states, and responsive behavior.",
        "Keep app modules separate from OS home-screen widgets in the production component model.",
      ],
      osWidgets: [
        "If the export includes home-screen, lock-screen, Live Activity, tablet glance, or Android widget surfaces, implement them as platform quick-access surfaces outside the app UI.",
        "If none are present, do not invent OS widgets unless the product requirements request them.",
      ],
      landingPage: {
        detection:
          "Inspect files and screen names for a marketing/landing page surface. If present, keep it separate from product app screens.",
        requiredSections: [
          "hero",
          "value props",
          "product proof/screenshots",
          "feature proof",
          "CTA",
        ],
      },
      tokens: {
        source: cssFiles.length > 0 ? cssFiles : [entryFile],
        required: [
          "background",
          "surface",
          "foreground",
          "muted text",
          "border",
          "accent",
          "radius",
          "shadow",
          "spacing",
          "type scale",
          "motion",
        ],
        note: "Extract/freeze tokens before framework implementation so coding tools do not substitute default theme colors or typography.",
      },
      interactions: {
        source: jsFiles.length > 0 ? jsFiles : [entryFile],
        requiredStates: [
          "default",
          "hover",
          "focus",
          "active",
          "disabled",
          "loading",
          "empty",
          "error",
          "success",
        ],
        requiredBehaviors: [
          "forms/validation where present",
          "tabs/filters where present",
          "dialogs/sheets/drawers where present",
          "copy/generate/share actions where present",
          "player or quick controls where present",
        ],
        note: "If the prototype is static, derive missing behavior from visible controls and document it before coding.",
      },
      responsiveViewports: [
        { name: "mobile-compact", width: 360, height: 800, category: "mobile", mustAvoidHorizontalScroll: true },
        { name: "mobile-standard", width: 390, height: 844, category: "mobile", mustAvoidHorizontalScroll: true },
        { name: "mobile-large", width: 430, height: 932, category: "mobile", mustAvoidHorizontalScroll: true },
        { name: "foldable-small-tablet", width: 600, height: 960, category: "foldable-tablet", mustAvoidHorizontalScroll: true },
        { name: "tablet-portrait", width: 820, height: 1180, category: "tablet", mustAvoidHorizontalScroll: true },
        { name: "tablet-landscape", width: 1024, height: 768, category: "tablet", mustAvoidHorizontalScroll: true },
        { name: "laptop", width: 1366, height: 768, category: "desktop", mustAvoidHorizontalScroll: true },
        { name: "desktop", width: 1440, height: 900, category: "desktop", mustAvoidHorizontalScroll: true },
        { name: "wide", width: 1920, height: 1080, category: "wide", mustAvoidHorizontalScroll: true },
      ],
      implementationChecklist: [
        "Open entryFile first and map screens, modules, tokens, and interactions.",
        "Extract tokens before writing framework components.",
        "Implement app-specific modules with real states instead of generic card grids.",
        "Preserve or rebuild JS interactions for meaningful UX actions.",
        "Validate screenshots at desktop/tablet/mobile viewports with no horizontal overflow.",
        "Keep landing pages, in-app modules, and OS widgets as separate implementation surfaces.",
      ],
    },
    null,
    2,
  );
}

export function buildDesignHandoff(
  relPaths: string[],
  projectLabel: string,
): string {
  const { files, htmlFiles, cssFiles, jsFiles, assetFiles, entryFile } =
    projectFileMap(relPaths);
  const accentLikelyBrandLed =
    files.some((name) =>
      /(design|brand|tokens?|theme|style|tailwind|variables)\.(css|scss|sass|less|json|ts|tsx|js|jsx|md)$/i.test(
        name,
      ),
    ) || cssFiles.length > 0;
  const hasResponsiveClues =
    htmlFiles.length > 0 ||
    cssFiles.length > 0 ||
    files.some((name) => /(screens?|pages?|components?|app|src)\//i.test(name));
  const list = (items: string[]) =>
    items.length > 0
      ? items.map((name) => `- \`${name}\``).join("\n")
      : "- None detected";

  return `# ${projectLabel || "Open Design project"} implementation handoff

This archive is the source of truth for turning the design into production code. Start from \`${entryFile}\`, then preserve the visual system, responsive behavior, and interactions found in the exported files.

## Implementation target
- Build production UI from the exported design, not a loose reinterpretation.
- Preserve typography scale, spacing rhythm, color tokens, border radii, shadows, motion timing, and component states.
- Replace static placeholders only when the target app has real data or functional equivalents.
- Keep generated product UI free of Open Design chrome, preview labels, or design-process annotations.
- Treat this handoff as a visual contract: if implementation choices conflict, match the exported pixels and behavior first, then refactor internals.

## Source map
- Primary entry: \`${entryFile}\`
- HTML screens detected: ${htmlFiles.length}
- Stylesheets detected: ${cssFiles.length}
- Script/component files detected: ${jsFiles.length}
- Supporting assets detected: ${assetFiles.length}

## Responsive contract
Validate the implementation across this 2025–2026 viewport matrix:
- Mobile compact: 360×800
- Mobile standard: 390×844
- Mobile large: 430×932
- Foldable / small tablet: 600×960
- Tablet portrait: 820×1180
- Tablet landscape: 1024×768
- Laptop: 1366×768
- Desktop: 1440×900
- Wide desktop: 1920×1080

For responsive web exports, treat these as a modern breakpoint system for one adaptive web experience, not three fixed screenshots. Do not split responsive web into unrelated native app screens unless the project explicitly includes native targets. Use semantic layout thresholds, fluid \`clamp()\` type/spacing, and container queries where component width matters more than viewport width. ${hasResponsiveClues ? "Preserve any CSS media queries, container queries, fluid \`clamp()\` scales, and layout changes already present in the exported files." : "If responsive rules are not present in the export, add them in the target implementation before shipping."}

## Design fidelity contract
- Extract reusable tokens before writing components: background, surface, foreground, muted text, border, accent, radius, shadow, spacing, type scale, and motion duration/easing.
- Map product screens, in-app modules/components, optional landing page, and optional OS widget surfaces before coding. Keep these surfaces separate in the target architecture.
- Match layout geometry: max-widths, gutters, grid columns, card proportions, sticky/fixed elements, and viewport-specific navigation.
- Preserve real copy, labels, and data shown in the export. Do not replace specific text with generic marketing filler.
- Preserve interactive affordances: hover, focus, pressed, disabled, loading, validation, copy/share, tab/accordion, modal/sheet, and keyboard states where present.
- Preserve accessibility semantics when converting: headings stay hierarchical, controls remain buttons/links/inputs, focus states stay visible.
- Do not keep prototype-only annotations, frame labels, or Open Design chrome in the production UI.

## CJX-ready UX contract
- Use \`${DESIGN_MANIFEST_FILENAME}\` as the machine-readable map for screens, app modules, OS widgets, landing pages, tokens, interactions, and viewport checks.
- Screen-file-first: when multiple user-facing surfaces exist, implement each HTML screen as its own route/file. Treat \`index.html\` as a launcher/overview when the manifest marks it that way, not as a combined final UI.
- If \`landing.html\`, app screens, platform screens, or OS widget files exist, preserve those boundaries in the target app instead of merging them into one page.
- A single self-contained \`${entryFile}\` is acceptable only when the export truly contains one user-facing screen and its CSS/JS are structured enough to extract tokens, components, states, and behavior.
- If separate \`css/\` or \`js/\` files exist, treat them as source of truth for token/component/interactions before porting to React, Vue, SwiftUI, Compose, or another target stack.
- In-app modules/components are product UI blocks inside the app. OS widgets are home-screen/lock-screen/quick-access surfaces outside the app. Do not merge those concepts.

## Color and brand contract
- Use the exported design tokens and product/domain context as the color source of truth.
- Do not introduce warm beige / cream / peach / pink / orange-brown background washes unless they are already explicit brand/reference colors in the export.
- ${accentLikelyBrandLed ? "A stylesheet or design/token file was detected; inspect it for canonical color variables before choosing framework theme tokens." : "No obvious token stylesheet was detected; sample colors from the entry file and convert them into named tokens before coding."}

## Implementation sequence for AI coding tools
1. Open \`${entryFile}\` and \`${DESIGN_MANIFEST_FILENAME}\`; identify every screen file, launcher/overview file, app module, and interaction before coding.
2. If multiple HTML screens exist, map them to separate routes/surfaces first; do not merge \`landing.html\`, product app screens, platform screens, or OS widgets into one route.
3. Extract a token table from CSS/root styles and inline styles before building framework components.
4. Build product screens and domain-specific in-app modules from largest layout regions down to controls; avoid starting with isolated atoms that lose spatial intent.
5. Port responsive behavior across the modern viewport matrix and test each semantic breakpoint before cleanup.
6. Port interactions and states, then replace static placeholders only with real app data or functional equivalents.
7. Keep optional landing page and OS widget surfaces as separate surfaces if present.
8. Compare final screenshots against the export at 360×800, 390×844, 430×932, 820×1180, 1024×768, 1366×768, 1440×900, and 1920×1080 before declaring done.

## Entry points
${list(htmlFiles)}

## Styles
${list(cssFiles)}

## Scripts/components
${list(jsFiles)}

## Assets and supporting files
${list(assetFiles)}

## Coding checklist for AI tools
1. Inspect \`${entryFile}\` and \`${DESIGN_MANIFEST_FILENAME}\` first and identify reusable components before coding.
2. Implement each user-facing screen file as its own route/surface; keep launcher, landing, app, platform, and OS widget files separate.
3. Extract design tokens into the target stack: colors, type scale, spacing, radius, shadows, and motion.
4. Implement layout with real 2025–2026 responsive breakpoints, fluid type/spacing, and container-query-aware component behavior; test with no horizontal overflow.
5. Preserve interactive controls, hover/focus/pressed states, form behavior, validation, and copy actions where present.
6. Implement domain-specific in-app modules with real states; do not flatten them into generic cards.
7. Keep landing page, product screens, and OS widget/quick-access surfaces separate when present.
8. Confirm the production result visually matches the exported design before refactoring internals.
9. Reject implementation shortcuts that flatten the design into generic cards, generic gradients, placeholder stats, or framework-default typography.
10. If a detail is ambiguous, keep the exported HTML/CSS/JS behavior rather than inventing a new pattern.
`;
}

// ---------------------------------------------------------------------------
// High-level archive assembly
// ---------------------------------------------------------------------------

export interface ArchiveFileEntry {
  /** Path inside the archive (project-relative, or root-relative when scoped). */
  relPath: string;
  bytes: Uint8Array;
  mtime?: number;
}

/**
 * Pack the project's files into a STORE-mode ZIP Buffer, appending the
 * DESIGN-HANDOFF.md + DESIGN-MANIFEST.json coding-handoff guide (unless the
 * project already ships its own). Mirrors the daemon's `buildProjectArchive`
 * output shape.
 */
export function buildProjectArchive(
  entries: ArchiveFileEntry[],
  projectLabel: string,
): Buffer {
  const relPaths = entries.map((e) => e.relPath);
  const inputs: ZipInput[] = entries.map((e) => ({
    path: e.relPath,
    bytes: e.bytes,
    mtime: e.mtime,
  }));

  const enc = new TextEncoder();
  if (!relPaths.includes(DESIGN_HANDOFF_FILENAME)) {
    inputs.push({
      path: DESIGN_HANDOFF_FILENAME,
      bytes: enc.encode(buildDesignHandoff(relPaths, projectLabel)),
      mtime: 0,
    });
  }
  if (!relPaths.includes(DESIGN_MANIFEST_FILENAME)) {
    inputs.push({
      path: DESIGN_MANIFEST_FILENAME,
      bytes: enc.encode(buildDesignManifest(relPaths, projectLabel)),
      mtime: 0,
    });
  }

  return buildStoredZip(inputs);
}
