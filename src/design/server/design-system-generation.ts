/**
 * Design-system generation jobs — the daemon's agent-driven generation swapped
 * for OUR model gateway.
 *
 * Upstream open-design's daemon (apps/daemon/src/design-systems/generation-jobs.ts)
 * ran a stepped job that scaffolded a DESIGN.md draft; the real authoring was
 * delegated to a local agent runtime. The cloud port keeps the SAME job wire
 * contract the SPA speaks (`POST /design-systems/generation-jobs` → `202 {job}`,
 * `GET .../generation-jobs/:jobId` → `{job}`) but produces a REAL DESIGN.md by
 * composing a design-system-generation prompt from the user's brief and calling
 * `generateText` over `getChatProvider()` — the same gateway the run endpoint
 * uses. The finished system is persisted as a user `OdDesignSystem`, and the
 * job's `designSystemId` points at it so the SPA can fetch the detail on
 * completion (its poll loop: DesignSystemFlow.tsx `pollGenerationJob`).
 *
 * Jobs are ephemeral, held in a `globalThis` singleton map keyed by jobId and
 * scoped by userId, mirroring the daemon's in-memory job store and the run
 * registry in gateway.ts (a `Symbol.for` global survives Next.js dev's
 * duplicate module instances so the POST-created job is visible to the GET
 * poll). The design system it creates is the durable artifact.
 */
import "server-only";
import { generateText } from "ai";
import { getChatProvider, resolveModelId } from "@/lib/llm/provider";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import type {
  DesignSystemGenerationJob,
  DesignSystemGenerationJobStatus,
  DesignSystemGenerationStep,
} from "@open-design/contracts";
import type { DesignContext } from "./auth";
import {
  createUserDesignSystem,
  newJobId,
  type UserDesignSystemInput,
} from "./user-design-systems";

// ---------------------------------------------------------------------------
// Job registry (globalThis singleton, scoped by userId)
// ---------------------------------------------------------------------------

interface JobRecord extends DesignSystemGenerationJob {
  userId: string;
}

const JOBS_KEY = Symbol.for("rantai.design.designSystemGenerationJobs");
type JobsGlobal = typeof globalThis & { [JOBS_KEY]?: Map<string, JobRecord> };
const jobs: Map<string, JobRecord> =
  ((globalThis as JobsGlobal)[JOBS_KEY] ??= new Map<string, JobRecord>());

const JOB_TTL_MS = 30 * 60 * 1000;

function sweep(now: number): void {
  for (const [id, job] of jobs) {
    const ts = Date.parse(job.updatedAt);
    if (Number.isFinite(ts) && now - ts > JOB_TTL_MS) jobs.delete(id);
  }
}

const STEP_DEFS = [
  { id: "explore-resources", title: "Explore provided resources" },
  { id: "create-draft", title: "Create design system draft" },
  { id: "generate-files", title: "Generate preview cards and files" },
  { id: "register-files", title: "Register files for review" },
  { id: "prepare-review", title: "Prepare review workspace" },
] as const;

function snapshot(job: JobRecord): DesignSystemGenerationJob {
  const { userId: _userId, ...rest } = job;
  return { ...rest, steps: rest.steps.map((s) => ({ ...s })) };
}

function touch(job: JobRecord): void {
  job.updatedAt = new Date().toISOString();
}

function setStep(
  job: JobRecord,
  stepId: string,
  status: DesignSystemGenerationStep["status"],
  message?: string,
): void {
  const step = job.steps.find((s) => s.id === stepId);
  if (!step) return;
  step.status = status;
  if (message !== undefined) step.message = message;
  if (status === "running" && !step.startedAt) step.startedAt = new Date().toISOString();
  if (status === "succeeded" || status === "failed") step.completedAt = new Date().toISOString();
  job.progress = Math.round(
    (job.steps.filter((s) => s.status === "succeeded").length / job.steps.length) * 100,
  );
  touch(job);
}

function mark(job: JobRecord, status: DesignSystemGenerationJobStatus, message: string): void {
  job.status = status;
  job.message = message;
  if (status === "succeeded" || status === "failed") job.completedAt = new Date().toISOString();
  if (status === "succeeded") job.progress = 100;
  touch(job);
}

// ---------------------------------------------------------------------------
// Prompt composition — the design-system-generation prompt fed to the gateway.
//
// Mirrors the daemon's DESIGN.md contract (the 9-section structure the built-in
// catalog uses, e.g. design-catalog.generated.ts) so downstream consumers and
// the swatch/category extractors behave identically for generated systems.
// ---------------------------------------------------------------------------

function briefFromInput(input: UserDesignSystemInput): string {
  const p = input.provenance;
  const lines: string[] = [];
  if (input.title) lines.push(`Title: ${input.title}`);
  if (input.category) lines.push(`Category: ${input.category}`);
  if (input.surface) lines.push(`Surface: ${input.surface}`);
  if (input.summary) lines.push(`Brief: ${input.summary}`);
  if (input.sourceNotes) lines.push(`Notes: ${input.sourceNotes}`);
  if (p?.companyBlurb) lines.push(`Company: ${p.companyBlurb}`);
  if (p?.notes) lines.push(`Additional notes: ${p.notes}`);
  if (p?.sourceUrls?.length) lines.push(`Reference URLs: ${p.sourceUrls.join(", ")}`);
  return lines.join("\n").trim() || "A modern, versatile product design system.";
}

const GENERATION_SYSTEM_PROMPT = `You are a senior design systems author. From a short brief you write a complete, opinionated DESIGN.md — a brand/design-system specification an AI agent will follow to generate on-brand web UI.

Return ONLY the DESIGN.md markdown. No preamble, no explanation, no code fences.

Requirements:
- Start with a single H1 title, then a blockquote metadata block with EXACTLY these two lines:
  > Category: <one short category, e.g. "Editorial & Warm" >
  > Surface: web
- Follow the H1/metadata with a one-paragraph summary of the visual identity.
- Then these nine sections, in this order, as H2 headings:
  ## 1. Visual Theme & Atmosphere
  ## 2. Color
  ## 3. Typography
  ## 4. Spacing
  ## 5. Layout & Composition
  ## 6. Components
  ## 7. Motion & Interaction
  ## 8. Voice & Brand
  ## 9. Anti-patterns
- In "## 2. Color", define a concrete palette using markdown list items with LITERAL hex codes, e.g.:
  - **Background:** \`#FBF7F0\`
  - **Surface:** \`#FFFFFF\`
  - **Primary / Brand:** \`#B5502E\`
  - **Text / Foreground:** \`#211A15\`
  - **Border:** \`#E4D9CC\`
  - **Accent:** \`#C77D4A\`
  Include background, surface, primary/brand, text/foreground, border, and at least one accent — all as real hex values.
- Be specific and concrete (name real font families, real spacing scales, real component treatments). Write for THIS brief, not generic advice. Aim for a substantial, production-grade document (well over 60 lines).`;

async function generateDesignMd(
  input: UserDesignSystemInput,
  modelId: string,
): Promise<string> {
  const brief = briefFromInput(input);
  const result = await generateText({
    model: getChatProvider()(modelId),
    system: GENERATION_SYSTEM_PROMPT,
    prompt: `Write the DESIGN.md for this design system.\n\n${brief}`,
  });
  return stripFences(result.text ?? "").trim();
}

/** Strip a wrapping ```markdown / ``` fence if the model added one. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/;
  const m = fence.exec(trimmed);
  return m ? (m[1] ?? "").trim() : trimmed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a generation job and start it in the background. Returns the initial
 * (queued) snapshot immediately, matching the daemon's `202 {job}`.
 */
export function startDesignSystemGenerationJob(
  ctx: DesignContext,
  input: UserDesignSystemInput,
): DesignSystemGenerationJob {
  const now = new Date().toISOString();
  sweep(Date.now());
  const job: JobRecord = {
    id: newJobId(),
    userId: ctx.userId,
    kind: "generation",
    status: "queued",
    progress: 0,
    steps: STEP_DEFS.map((s) => ({ ...s, status: "pending" })),
    createdAt: now,
    updatedAt: now,
    message: "Queued",
  };
  jobs.set(job.id, job);
  void run(job, ctx, input);
  return snapshot(job);
}

/** Read a job snapshot for the owning user, or null (→ 404). */
export function getDesignSystemGenerationJob(
  ctx: DesignContext,
  jobId: string,
): DesignSystemGenerationJob | null {
  sweep(Date.now());
  const job = jobs.get(jobId);
  if (!job || job.userId !== ctx.userId) return null;
  return snapshot(job);
}

async function run(
  job: JobRecord,
  ctx: DesignContext,
  input: UserDesignSystemInput,
): Promise<void> {
  try {
    mark(job, "running", "Starting generation");

    setStep(job, "explore-resources", "running");
    setStep(
      job,
      "explore-resources",
      "succeeded",
      input.provenance?.sourceUrls?.length
        ? `Using brief + ${input.provenance.sourceUrls.length} reference link(s)`
        : "Using brief and company context",
    );

    setStep(job, "create-draft", "running", "Generating DESIGN.md with the model");
    const modelId = resolveModelId(DEFAULT_MODEL_ID);
    const body = await generateDesignMd(input, modelId);
    if (!body || body.length < 40) {
      throw new Error("model returned an empty or too-short DESIGN.md");
    }
    const created = await createUserDesignSystem(ctx, { ...input, body });
    job.designSystemId = created.id;
    setStep(job, "create-draft", "succeeded", `Created ${created.title}`);

    setStep(job, "generate-files", "running");
    setStep(job, "generate-files", "succeeded", "Derived tokens, swatches, and summary");

    setStep(job, "register-files", "running");
    setStep(job, "register-files", "succeeded", "Registered DESIGN.md");

    setStep(job, "prepare-review", "running");
    setStep(job, "prepare-review", "succeeded", "Review workspace is ready");

    mark(job, "succeeded", "Design system ready for review");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const running = job.steps.find((s) => s.status === "running");
    if (running) setStep(job, running.id, "failed", message);
    job.error = message;
    mark(job, "failed", "Generation failed");
  }
}
