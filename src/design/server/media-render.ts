/**
 * Headless-Chrome (Playwright) frame capture → ffmpeg → S3 media render.
 *
 * This is the cloud port of open-design's HyperFrames / media video pipeline
 * (apps/daemon/src/media/index.ts → `renderHyperFramesViaCli`). Upstream ran
 * `npx hyperframes render <compositionDir>` which spawned a puppeteer-controlled
 * Chrome to capture frames and ffmpeg to mux them into an MP4 — Electron /
 * desktop-only, and reliant on the vendored HyperFrames CLI + composition
 * format (`hyperframes.json` / `meta.json` / `index.html`).
 *
 * The cloud port swaps that for portable primitives already installed on the
 * host, keeping the SAME task lifecycle + output shape:
 *   - Playwright (via `@playwright/test`) drives /usr/bin/google-chrome-stable
 *     headless, loads the animated HTML artifact, sizes the viewport to the
 *     requested dimensions, and screenshots frames at the requested fps for the
 *     requested duration (real-time capture — the browser advances CSS / WAAPI
 *     / rAF animations against the wall clock between shots).
 *   - /usr/bin/ffmpeg muxes `frame-%05d.png` → H.264 MP4 (yuv420p) and,
 *     optionally, a GIF.
 *   - The MP4 is uploaded to S3 as a project file (storage.ts → `putDesignFile`)
 *     so the SPA's FileViewer displays it like any produced video, and the
 *     `OdMediaTask` row is transitioned queued → running → done / failed for the
 *     `GET .../media/tasks` poll. The `file` meta mirrors the daemon's
 *     generateMedia shape (`{ name, size, mtime, kind, mime, model, surface,
 *     providerNote, providerId }`).
 *
 * Everything runs against `os.tmpdir()/rantai-media-*` which is removed in a
 * `finally` — only the final MP4/GIF bytes reach S3.
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { DesignContext } from "./auth";
import { getDesignFile, putDesignFile } from "./storage";

// ---------------------------------------------------------------------------
// Host tooling (portable — see task brief).
// ---------------------------------------------------------------------------
const CHROME_PATH = "/usr/bin/google-chrome-stable";
const FFMPEG_PATH = "/usr/bin/ffmpeg";

// ---------------------------------------------------------------------------
// Guard rails. A render holds a Chrome process + writes N PNGs, so cap the
// work: duration/fps/frame-count/dimensions all clamp to sane ceilings.
// ---------------------------------------------------------------------------
const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 15;
const MIN_FPS = 1;
const MAX_FPS = 60;
const MAX_FRAMES = 900; // ceiling on captured PNGs (15s × 60fps)
const MIN_DIM = 16;
const MAX_DIM = 1920;
const DEFAULT_DURATION_SEC = 3;
const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
// Absolute wall-clock ceiling for a single render (matches the daemon's HF
// timeout). Bounds the fire-and-forget task so a wedged Chrome can't run forever.
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Minimal Playwright contract (dynamic-import behind a widened specifier so the
// isolated `src/design/tsconfig.json` program does not pull the test runner's
// types into its checked file set — same pattern storage.ts uses for @/lib/s3).
// ---------------------------------------------------------------------------
interface PwPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  setContent(html: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  screenshot(opts: { path: string; type?: "png" | "jpeg"; timeout?: number }): Promise<Buffer>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(opts?: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
  }): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(opts: {
    executablePath?: string;
    headless?: boolean;
    args?: string[];
    timeout?: number;
  }): Promise<PwBrowser>;
}

// Fully-opaque dynamic import: `@playwright/test` is a heavy EXTERNAL node_module
// (not app-internal like @/lib/s3), so a bundler-visible `import()` would try to
// pull the whole test runner into the route bundle. Hiding it behind `Function`
// forces a native runtime `import()` resolved from the server process's cwd
// (apps/cloud, where @playwright/test is installed). Keeps the isolated tsconfig
// clean too, since there is no static specifier to resolve.
const runtimeImport = new Function("s", "return import(s)") as (
  s: string,
) => Promise<unknown>;

async function loadChromium(): Promise<PwChromium> {
  const mod = (await runtimeImport("@playwright/test")) as { chromium: PwChromium };
  return mod.chromium;
}

// ---------------------------------------------------------------------------
// Request parsing / validation.
// ---------------------------------------------------------------------------
export interface RenderParams {
  surface: string;
  model: string;
  /** Inline HTML (highest priority source). */
  html: string | null;
  /** Project-relative path to a single HTML artifact. */
  source: string | null;
  /** Project-relative directory scaffolded HyperFrames-style; loads its index.html. */
  compositionDir: string | null;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  loop: boolean;
  /** Output filename for the produced MP4 (always `.mp4`). */
  output: string;
  /** Also produce a sibling `.gif` (best-effort). */
  gif: boolean;
}

export type ParseResult =
  | { ok: true; params: RenderParams }
  | { ok: false; message: string };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function toEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** aspect → base dimensions (long edge 1280), used when width/height omitted. */
function aspectToDims(aspect: string): { width: number; height: number } | null {
  switch (aspect) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 720, height: 720 };
    case "4:3":
      return { width: 960, height: 720 };
    case "3:4":
      return { width: 720, height: 960 };
    default:
      return null;
  }
}

function ensureMp4Name(name: string | null): string {
  const fallback = `video-${Date.now().toString(36)}.mp4`;
  if (!name) return fallback;
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const trimmed = base.trim();
  if (!trimmed) return fallback;
  return /\.mp4$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\.[^.]+$/, "")}.mp4`;
}

/**
 * Parse + clamp the render request body into resolved params. Mirrors the
 * daemon's media/generate body keys (surface/model/aspect/duration/loop/output/
 * compositionDir) while adding the cloud port's direct HTML sources
 * (`html` inline / `source` path) + explicit `fps` / `width` / `height` / `gif`.
 */
export function parseRenderRequest(body: Record<string, unknown>): ParseResult {
  const surface = strOrNull(body.surface) ?? "video";
  if (surface !== "video") {
    return { ok: false, message: "surface must be 'video' for the HTML→MP4 renderer" };
  }
  const model = strOrNull(body.model) ?? "hyperframes-html";

  const html = strOrNull(body.html);
  const source =
    strOrNull(body.source) ?? strOrNull(body.input) ?? strOrNull(body.artifact);
  const compositionDir = strOrNull(body.compositionDir);

  const durationSec = clamp(
    numOr(body.duration, numOr(body.durationSec, DEFAULT_DURATION_SEC)),
    MIN_DURATION_SEC,
    MAX_DURATION_SEC,
  );
  const fps = Math.round(clamp(numOr(body.fps, DEFAULT_FPS), MIN_FPS, MAX_FPS));

  let width = numOr(body.width, 0);
  let height = numOr(body.height, 0);
  if (!(width > 0 && height > 0)) {
    const aspect = strOrNull(body.aspect);
    const dims = aspect ? aspectToDims(aspect) : null;
    width = dims?.width ?? DEFAULT_WIDTH;
    height = dims?.height ?? DEFAULT_HEIGHT;
  }
  width = toEven(clamp(width, MIN_DIM, MAX_DIM));
  height = toEven(clamp(height, MIN_DIM, MAX_DIM));

  const loop = body.loop === true;
  const gif = body.gif === true;
  const output = ensureMp4Name(strOrNull(body.output));

  return {
    ok: true,
    params: {
      surface,
      model,
      html,
      source,
      compositionDir,
      durationSec,
      fps,
      width,
      height,
      loop,
      output,
      gif,
    },
  };
}

// ---------------------------------------------------------------------------
// Task lifecycle (OdMediaTask). The task row is created queued by the route
// (workspace-store.createDesignMediaTask); this module owns every transition
// after that. Progress is kept in memory (one render owns one task) and the
// row's progressJson is rewritten at phase boundaries.
// ---------------------------------------------------------------------------
class TaskProgress {
  private lines: string[] = ["queued"];
  private lastPersist = 0;

  constructor(private readonly taskId: string) {}

  async setRunning(line: string): Promise<void> {
    this.lines.push(line);
    const now = BigInt(Date.now());
    await prisma.odMediaTask.update({
      where: { id: this.taskId },
      data: {
        status: "running",
        progressJson: JSON.stringify(this.lines),
        updatedAt: now,
      },
    });
    this.lastPersist = Date.now();
  }

  /** Append a progress line; persists at most ~2×/s to bound DB writes. */
  async push(line: string, force = false): Promise<void> {
    this.lines.push(line);
    if (!force && Date.now() - this.lastPersist < 500) return;
    await prisma.odMediaTask.update({
      where: { id: this.taskId },
      data: {
        progressJson: JSON.stringify(this.lines),
        updatedAt: BigInt(Date.now()),
      },
    });
    this.lastPersist = Date.now();
  }

  async succeed(file: unknown): Promise<void> {
    this.lines.push("done");
    const now = BigInt(Date.now());
    await prisma.odMediaTask.update({
      where: { id: this.taskId },
      data: {
        status: "done",
        progressJson: JSON.stringify(this.lines),
        fileJson: JSON.stringify(file),
        endedAt: now,
        updatedAt: now,
      },
    });
  }

  async fail(message: string): Promise<void> {
    this.lines.push(`error: ${message}`);
    const now = BigInt(Date.now());
    await prisma.odMediaTask
      .update({
        where: { id: this.taskId },
        data: {
          status: "failed",
          progressJson: JSON.stringify(this.lines),
          errorJson: JSON.stringify({ message, status: 400 }),
          endedAt: now,
          updatedAt: now,
        },
      })
      .catch(() => {
        // best-effort — never let a failure-recording failure mask the original
      });
  }
}

// ---------------------------------------------------------------------------
// Input staging: materialize the animated HTML into the temp work dir.
// ---------------------------------------------------------------------------
async function stageHtml(
  ctx: DesignContext,
  projectId: string,
  params: RenderParams,
  workDir: string,
): Promise<string> {
  if (params.html) {
    const dest = path.join(workDir, "index.html");
    await writeFile(dest, params.html, "utf8");
    return dest;
  }
  // compositionDir (HyperFrames-style) → its index.html; single-file only. Rich
  // compositions should inline their assets (the artifact pipeline already
  // produces self-contained HTML — see inline-assets.ts).
  const rel = params.compositionDir
    ? `${params.compositionDir.replace(/\/+$/, "")}/index.html`
    : params.source ?? "index.html";
  let bytes: Buffer;
  try {
    bytes = await getDesignFile(ctx, projectId, rel);
  } catch {
    throw new Error(
      `animated HTML source not found: ${rel}. Provide inline \`html\`, a ` +
        `\`source\` path, or a \`compositionDir\` containing index.html.`,
    );
  }
  const dest = path.join(workDir, "index.html");
  await writeFile(dest, bytes);
  return dest;
}

/** Best-effort: read a HyperFrames-ish meta.json for duration/fps overrides. */
async function readCompositionMeta(
  ctx: DesignContext,
  projectId: string,
  compositionDir: string | null,
): Promise<{ durationSec?: number; fps?: number }> {
  if (!compositionDir) return {};
  try {
    const bytes = await getDesignFile(
      ctx,
      projectId,
      `${compositionDir.replace(/\/+$/, "")}/meta.json`,
    );
    const meta = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    const fps = numOr(meta.fps, 0) || undefined;
    let durationSec: number | undefined;
    if (typeof meta.durationSeconds === "number") durationSec = meta.durationSeconds;
    else if (typeof meta.duration === "number") durationSec = meta.duration;
    else if (typeof meta.durationInFrames === "number" && fps) {
      durationSec = meta.durationInFrames / fps;
    }
    return { durationSec, fps };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Frame capture.
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureFrames(
  page: PwPage,
  framesDir: string,
  fps: number,
  frameCount: number,
  progress: TaskProgress,
): Promise<void> {
  const frameIntervalMs = 1000 / fps;
  const startWall = Date.now();
  const reportEvery = Math.max(1, Math.round(fps)); // ~once per second
  for (let i = 0; i < frameCount; i++) {
    // Pace to the wall clock so the browser advances the animation in real time
    // between shots. (Output length is frameCount/fps regardless of drift.)
    const targetElapsed = i * frameIntervalMs;
    const drift = targetElapsed - (Date.now() - startWall);
    if (drift > 4) await sleep(drift);
    const frameFile = path.join(framesDir, `frame-${String(i).padStart(5, "0")}.png`);
    await page.screenshot({ path: frameFile, type: "png", timeout: 30_000 });
    if (i % reportEvery === 0) {
      await progress.push(`capturing frame ${i + 1}/${frameCount}`);
    }
  }
  await progress.push(`captured ${frameCount}/${frameCount} frames`, true);
}

// ---------------------------------------------------------------------------
// ffmpeg encode.
// ---------------------------------------------------------------------------
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderrTail = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail += chunk.toString("utf8");
      if (stderrTail.length > 8000) stderrTail = stderrTail.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const tail = stderrTail.trim().split("\n").slice(-8).join("\n");
      reject(new Error(`ffmpeg exited ${code}${tail ? `\n${tail}` : ""}`));
    });
  });
}

function encodeMp4(framesDir: string, fps: number, outPath: string): Promise<void> {
  return runFfmpeg([
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%05d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    // Guarantee even dims for the yuv420p chroma subsampling.
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

function encodeGif(
  framesDir: string,
  fps: number,
  width: number,
  outPath: string,
): Promise<void> {
  return runFfmpeg([
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%05d.png"),
    "-vf",
    `fps=${fps},scale=${width}:-1:flags=lanczos`,
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// The `file` meta mirrors the daemon's generateMedia return so the SPA's
// FileViewer / media-task poll render it identically.
// ---------------------------------------------------------------------------
interface ProducedFileMeta {
  name: string;
  size: number;
  mtime: number;
  kind: string;
  mime: string;
  model: string;
  surface: string;
  providerNote: string;
  providerId: string;
}

// ---------------------------------------------------------------------------
// Orchestrator: run the render for a queued OdMediaTask. Never throws — every
// failure is recorded on the task row (fire-and-forget from the route).
// ---------------------------------------------------------------------------
export async function runMediaRender(
  ctx: DesignContext,
  projectId: string,
  taskId: string,
  params: RenderParams,
): Promise<void> {
  const progress = new TaskProgress(taskId);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "rantai-media-"));
  const framesDir = path.join(workDir, "frames");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`render timed out after ${RENDER_TIMEOUT_MS / 1000}s`)),
      RENDER_TIMEOUT_MS,
    ),
  );

  try {
    await Promise.race([
      renderInner(ctx, projectId, params, workDir, framesDir, progress),
      timeout,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await progress.fail(message.slice(0, 480));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderInner(
  ctx: DesignContext,
  projectId: string,
  params: RenderParams,
  workDir: string,
  framesDir: string,
  progress: TaskProgress,
): Promise<void> {
  await mkdir(framesDir, { recursive: true });

  // Honor a HyperFrames meta.json (duration/fps) when the caller didn't pin them.
  const meta = await readCompositionMeta(ctx, projectId, params.compositionDir);
  const durationSec =
    params.compositionDir && meta.durationSec
      ? clamp(meta.durationSec, MIN_DURATION_SEC, MAX_DURATION_SEC)
      : params.durationSec;
  const fps =
    params.compositionDir && meta.fps
      ? Math.round(clamp(meta.fps, MIN_FPS, MAX_FPS))
      : params.fps;
  const frameCount = Math.min(Math.max(1, Math.round(durationSec * fps)), MAX_FRAMES);

  await progress.setRunning(
    `render start · ${params.width}×${params.height} · ${fps}fps · ${frameCount} frames`,
  );

  const htmlPath = await stageHtml(ctx, projectId, params, workDir);

  // Launch system Chrome (no playwright-managed download) headless.
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--allow-file-access-from-files",
    ],
    timeout: 60_000,
  });

  const mp4Path = path.join(workDir, "out.mp4");
  try {
    const page = await browser.newPage({
      viewport: { width: params.width, height: params.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    // Let fonts / first paint / animation kick-off settle before frame 0.
    await sleep(200);
    await progress.push("browser ready · capturing frames");
    await captureFrames(page, framesDir, fps, frameCount, progress);
    await page.close();
  } finally {
    await browser.close().catch(() => {});
  }

  await progress.push("encoding mp4 (ffmpeg)", true);
  await encodeMp4(framesDir, fps, mp4Path);
  const mp4Bytes = await readFile(mp4Path);

  // Optional GIF (best-effort — a gif failure must not fail the video task).
  if (params.gif) {
    try {
      const gifPath = path.join(workDir, "out.gif");
      await encodeGif(framesDir, fps, params.width, gifPath);
      const gifBytes = await readFile(gifPath);
      const gifName = params.output.replace(/\.mp4$/i, ".gif");
      await putDesignFile(ctx, projectId, gifName, gifBytes, "image/gif");
      await progress.push(`gif written · ${gifName} · ${gifBytes.length} bytes`);
    } catch {
      await progress.push("gif encode skipped (failed)");
    }
  }

  await progress.push("uploading mp4", true);
  await putDesignFile(ctx, projectId, params.output, mp4Bytes, "video/mp4");

  const file: ProducedFileMeta = {
    name: params.output,
    size: mp4Bytes.length,
    mtime: Date.now(),
    kind: "video",
    mime: "video/mp4",
    model: params.model,
    surface: params.surface,
    providerNote: `chrome-capture/local-html · ${params.width}×${params.height} · ${fps}fps · ${(frameCount / fps).toFixed(2)}s · ${mp4Bytes.length} bytes`,
    providerId: "hyperframes",
  };
  await progress.succeed(file);
}
