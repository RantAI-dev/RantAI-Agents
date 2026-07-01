/**
 * Design SPA critique orchestrator — the CLI→model-gateway swap for Critique
 * Theater (a.k.a. Design Jury).
 *
 * Upstream (reference/open-design/apps/daemon/src/critique/orchestrator.ts) the
 * daemon spawned an agent CLI, fed it the panel prompt, and parsed the child's
 * stdout into `PanelEvent`s while scoring each round, persisting to SQLite, and
 * fanning the events onto the project SSE bus. This port keeps the exact scoring
 * state-machine and terminal-status policy, but the character stream now comes
 * from OUR gateway (`generateText` / `streamText` over `getChatProvider()`),
 * persistence goes through Prisma (`OdCritiqueRun`), and the SSE frames use the
 * shared `panelEventToSse` wire shape so the SPA's reducer renders identically.
 *
 * Two entry points, both ownership-scoped by the parent project/conversation:
 *   - runCritique(ctx, params)     → JSON result (score + rounds + findings).
 *   - streamCritique(ctx, params)  → text/event-stream of `critique.*` frames,
 *                                    matching the daemon's bus event shapes.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, streamText, type ModelMessage } from "ai";
import { getChatProvider, resolveModelId } from "@/lib/llm/provider";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import {
  defaultCritiqueConfig,
  panelEventToSse,
  type CritiqueConfig,
  type CritiqueRoundSummary,
  type PanelEvent,
  type PanelistRole,
} from "@open-design/contracts/critique";
import type { CritiqueRunStatus } from "@open-design/contracts/critique";
import type { DesignContext } from "./auth";
import { renderCritiquePrompt } from "./critique-prompt";
import { findDesignSystem } from "./prompt-compose";
import {
  computeComposite,
  decideRound,
  MalformedBlockError,
  MissingArtifactError,
  OversizeBlockError,
  parseCritiqueStream,
  selectFallbackRound,
  type RoundState,
} from "./critique-parser";
import {
  insertCritiqueRun,
  isProjectOwned,
  updateCritiqueRun,
  type CritiqueRunRow,
} from "./critique-store";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Effective critique config. The daemon reads `OD_CRITIQUE_*` env vars
 * (config.ts); the port honors the same keys for the fields that matter to a
 * single synchronous run, falling back to the shared `defaultCritiqueConfig()`.
 */
export function loadCritiqueConfig(env: NodeJS.ProcessEnv = process.env): CritiqueConfig {
  const cfg = defaultCritiqueConfig();
  cfg.enabled = true;
  const maxRounds = Number(env["OD_CRITIQUE_MAX_ROUNDS"]);
  if (Number.isInteger(maxRounds) && maxRounds >= 1 && maxRounds <= 10) {
    cfg.maxRounds = maxRounds;
  }
  const threshold = Number(env["OD_CRITIQUE_SCORE_THRESHOLD"]);
  if (Number.isFinite(threshold) && threshold >= 0 && threshold <= cfg.scoreScale) {
    cfg.scoreThreshold = threshold;
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface CritiqueFinding {
  round: number;
  role: PanelistRole;
  text: string;
}

export interface CritiqueRunResult {
  /** The persisted OdCritiqueRun row (public, terminal shape). */
  run: CritiqueRunRow;
  /** Full transcript of PanelEvents, same shape the SSE stream emits. */
  events: PanelEvent[];
  /** Flattened MUST_FIX findings across every round. */
  findings: CritiqueFinding[];
  /** SHIP summary sentence, when the run shipped. */
  summary: string | null;
  /** The shipped artifact body + mime, when present (inlined, not on disk). */
  artifact: { mime: string; body: string } | null;
}

export type RunCritiqueParams = {
  projectId: string;
  conversationId?: string | null;
  /** Artifact HTML to critique; when omitted, the latest assistant artifact is used. */
  artifact?: string | null;
  /** Optional per-request model override; falls back to DEFAULT_MODEL_ID. */
  model?: string | null;
};

export type RunCritiqueError =
  | { ok: false; status: number; code: string; message: string };

// ---------------------------------------------------------------------------
// Target resolution (ownership-scoped)
// ---------------------------------------------------------------------------

interface CritiqueTarget {
  projectId: string;
  conversationId: string | null;
  designSystemId: string | null;
  skillId: string | null;
  artifact: { mime: string; body: string };
}

/** Extract the inner HTML of the last `<artifact …>…</artifact>` tag a run
 *  streamed into an assistant message (lowercase tag; see web/artifacts/parser). */
function extractRunArtifact(content: string): string | null {
  const re = /<artifact\b[^>]*>([\s\S]*?)<\/artifact>/gi;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(content)) !== null) {
    if (m[1] && m[1].trim().length > 0) last = m[1];
  }
  return last ? last.trim() : null;
}

async function resolveTarget(
  ctx: DesignContext,
  params: RunCritiqueParams,
): Promise<CritiqueTarget | RunCritiqueError> {
  const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
  const project = await prisma.odProject.findFirst({
    where: { id: params.projectId, ...scope },
    select: { id: true, designSystemId: true, skillId: true },
  });
  if (!project) {
    return { ok: false, status: 404, code: "PROJECT_NOT_FOUND", message: "project not found" };
  }

  // Resolve the conversation (explicit id must belong to the project; else latest).
  let conversationId: string | null = null;
  if (params.conversationId) {
    const convo = await prisma.odConversation.findFirst({
      where: { id: params.conversationId, projectId: project.id },
      select: { id: true },
    });
    if (!convo) {
      return { ok: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: "conversation not found" };
    }
    conversationId = convo.id;
  } else {
    const convo = await prisma.odConversation.findFirst({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    conversationId = convo?.id ?? null;
  }

  // Resolve the artifact under review.
  let body: string | null =
    typeof params.artifact === "string" && params.artifact.trim().length > 0
      ? params.artifact
      : null;
  if (!body && conversationId) {
    const msg = await prisma.odMessage.findFirst({
      where: { conversationId, role: "assistant" },
      orderBy: { position: "desc" },
      select: { content: true },
    });
    if (msg?.content) body = extractRunArtifact(msg.content);
  }
  if (!body) {
    return {
      ok: false,
      status: 422,
      code: "NO_ARTIFACT",
      message: "no artifact to critique (provide `artifact` or run a generation first)",
    };
  }

  return {
    projectId: project.id,
    conversationId,
    designSystemId: project.designSystemId ?? null,
    skillId: project.skillId ?? null,
    artifact: { mime: "text/html", body },
  };
}

// ---------------------------------------------------------------------------
// Prompt / brand
// ---------------------------------------------------------------------------

function resolveBrand(designSystemId: string | null): { name: string; design_md: string } {
  const system = findDesignSystem(designSystemId);
  const body = system?.body?.trim();
  if (system && body) {
    return { name: system.title?.trim() || system.id, design_md: body };
  }
  return {
    name: "General design principles",
    design_md:
      "No brand DESIGN.md is bound to this project. Judge against universal craft: " +
      "clear visual hierarchy, consistent type scale and spacing rhythm, WCAG 2.1 AA " +
      "contrast and focus order, and specific, non-generic copy.",
  };
}

// ---------------------------------------------------------------------------
// Core state-machine (port of runOrchestrator, gateway-driven, DB-free)
// ---------------------------------------------------------------------------

const COMPOSITE_TOLERANCE = 0.01;

interface DriveOutcome {
  status: CritiqueRunStatus;
  composite: number | null;
  rounds: CritiqueRoundSummary[];
  events: PanelEvent[];
  summary: string | null;
  artifact: { mime: string; body: string } | null;
}

/**
 * Consume the model's character stream, score each round, resolve the terminal
 * status, and (for the streaming path) emit each `PanelEvent` via `emit`.
 * Faithful port of `runOrchestrator`'s collect+finalize loop minus SQLite,
 * OTel, metrics, and child-process plumbing.
 */
async function driveCritique(
  runId: string,
  projectId: string,
  adapter: string,
  cfg: CritiqueConfig,
  source: AsyncIterable<string>,
  emit: (event: PanelEvent) => void,
): Promise<DriveOutcome> {
  const collectedEvents: PanelEvent[] = [];
  const roundStates = new Map<number, RoundState>();
  const completedRounds: RoundState[] = [];
  let shipEvent: Extract<PanelEvent, { type: "ship" }> | null = null;
  const artifactBuffer: { value: { round: number; mime: string; body: string } | null } = {
    value: null,
  };
  let finalStatus: CritiqueRunStatus = "failed";
  let finalComposite: number | null = null;
  let shipSummary: string | null = null;

  const record = (event: PanelEvent): void => {
    collectedEvents.push(event);
    emit(event);
  };
  const emitParserWarning = (
    kind: Extract<PanelEvent, { type: "parser_warning" }>["kind"],
  ): void => {
    record({ type: "parser_warning", runId, kind, position: 0 });
  };

  try {
    for await (const event of parseCritiqueStream(source, {
      runId,
      adapter,
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
      projectId,
      artifactId: runId,
      onArtifact: (payload) => {
        artifactBuffer.value = payload;
      },
    })) {
      // Ship is buffered, not emitted raw — the daemon-authoritative ship is
      // emitted after decideRound runs against the daemon scoreboard.
      if (event.type !== "ship") record(event);

      switch (event.type) {
        case "panelist_open": {
          if (!roundStates.has(event.round)) {
            roundStates.set(event.round, {
              n: event.round,
              scores: {},
              mustFix: 0,
              composite: 0,
            });
          }
          break;
        }
        case "panelist_close": {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            rs.scores[event.role] = event.score;
            rs.composite = computeComposite(rs.scores, cfg.weights);
          }
          break;
        }
        case "panelist_must_fix": {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) rs.mustFix += 1;
          break;
        }
        case "round_end": {
          const rs = roundStates.get(event.round);
          if (rs !== undefined) {
            if (
              Math.abs(event.composite - rs.composite) > COMPOSITE_TOLERANCE ||
              event.mustFix !== rs.mustFix
            ) {
              emitParserWarning("composite_mismatch");
            }
            completedRounds.push({ ...rs });
          }
          break;
        }
        case "ship": {
          shipEvent = event;
          break;
        }
        default:
          break;
      }
    }

    // Resolve the buffered SHIP against the daemon scoreboard.
    let resolvedShip = shipEvent;
    if (resolvedShip !== null) {
      const shippedRound = completedRounds.find((r) => r.n === resolvedShip!.round);
      if (shippedRound === undefined) {
        emitParserWarning("duplicate_ship");
        resolvedShip = null;
      }
    }

    if (resolvedShip !== null) {
      const ship = resolvedShip;
      const shippedRound = completedRounds.find((r) => r.n === ship.round)!;
      if (Math.abs(ship.composite - shippedRound.composite) > COMPOSITE_TOLERANCE) {
        emitParserWarning("composite_mismatch");
      }
      const decision = decideRound(shippedRound.composite, shippedRound.mustFix, cfg);
      finalStatus = decision === "ship" ? "shipped" : "below_threshold";
      finalComposite = shippedRound.composite;
      shipSummary = ship.summary;
      record({
        type: "ship",
        runId,
        round: shippedRound.n,
        composite: shippedRound.composite,
        status: finalStatus === "shipped" ? "shipped" : "below_threshold",
        artifactRef: { projectId, artifactId: runId },
        summary: ship.summary,
      });
    } else {
      const fallback = selectFallbackRound(completedRounds, cfg.fallbackPolicy);
      if (fallback !== null) {
        finalStatus = "below_threshold";
        finalComposite = fallback.composite;
        const summary = `Fallback: best round ${fallback.n} composite ${fallback.composite.toFixed(2)}`;
        shipSummary = summary;
        record({
          type: "ship",
          runId,
          round: fallback.n,
          composite: fallback.composite,
          status: "below_threshold",
          artifactRef: { projectId, artifactId: runId },
          summary,
        });
      } else {
        finalStatus = "failed";
        finalComposite = null;
        record({ type: "failed", runId, cause: "orchestrator_internal" });
      }
    }
  } catch (err) {
    if (
      err instanceof MalformedBlockError ||
      err instanceof OversizeBlockError ||
      err instanceof MissingArtifactError
    ) {
      finalStatus = "degraded";
      const reason =
        err instanceof MalformedBlockError
          ? "malformed_block"
          : err instanceof OversizeBlockError
            ? "oversize_block"
            : "missing_artifact";
      record({ type: "degraded", runId, reason, adapter });
    } else {
      finalStatus = "failed";
      record({ type: "failed", runId, cause: "orchestrator_internal" });
    }
  }

  const rounds: CritiqueRoundSummary[] = completedRounds.map((r) => ({
    n: r.n,
    composite: r.composite,
    mustFix: r.mustFix,
    decision: decideRound(r.composite, r.mustFix, cfg),
  }));

  return {
    status: finalStatus,
    composite: finalComposite,
    rounds,
    events: collectedEvents,
    summary: shipSummary,
    artifact: artifactBuffer.value
      ? { mime: artifactBuffer.value.mime, body: artifactBuffer.value.body }
      : null,
  };
}

function findingsFromEvents(events: PanelEvent[]): CritiqueFinding[] {
  const out: CritiqueFinding[] = [];
  for (const e of events) {
    if (e.type === "panelist_must_fix") {
      out.push({ round: e.round, role: e.role, text: e.text });
    }
  }
  return out;
}

/** Slice from the first `<CRITIQUE_RUN` marker so leading prose / code fences a
 *  model may add never reach the strict in-run parser (which rejects stray
 *  characters inside the envelope). */
function extractProtocol(text: string): string {
  const idx = text.indexOf("<CRITIQUE_RUN");
  return idx >= 0 ? text.slice(idx) : text;
}

async function* once(value: string): AsyncIterable<string> {
  yield value;
}

// ---------------------------------------------------------------------------
// Entry point: JSON result
// ---------------------------------------------------------------------------

export async function runCritique(
  ctx: DesignContext,
  params: RunCritiqueParams,
  signal?: AbortSignal,
): Promise<CritiqueRunResult | RunCritiqueError> {
  const target = await resolveTarget(ctx, params);
  if ("ok" in target) return target;

  const cfg = loadCritiqueConfig();
  const brand = resolveBrand(target.designSystemId);
  const skill = { id: target.skillId ?? "design-critique" };
  const system = renderCritiquePrompt({ cfg, brand, skill, artifact: target.artifact });
  const modelId = resolveModelId(params.model || DEFAULT_MODEL_ID);
  const runId = randomUUID();

  await insertCritiqueRun({
    id: runId,
    projectId: target.projectId,
    conversationId: target.conversationId,
    status: "running",
    protocolVersion: cfg.protocolVersion,
  });

  const messages: ModelMessage[] = [
    { role: "user", content: "Begin the critique run now. Emit only the CRITIQUE_RUN protocol." },
  ];

  let text: string;
  try {
    const result = await generateText({
      model: getChatProvider()(modelId),
      system,
      messages,
      abortSignal: signal,
    });
    text = result.text;
  } catch (err) {
    await updateCritiqueRun(runId, { status: "failed" });
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "GATEWAY_ERROR", message };
  }

  const outcome = await driveCritique(
    runId,
    target.projectId,
    modelId,
    cfg,
    once(extractProtocol(text)),
    () => {
      /* JSON path: events are collected, not streamed */
    },
  );

  const row = await updateCritiqueRun(runId, {
    status: outcome.status,
    score: outcome.composite,
    rounds: outcome.rounds,
  });

  return {
    run: row ?? {
      id: runId,
      projectId: target.projectId,
      conversationId: target.conversationId,
      artifactPath: null,
      status: outcome.status,
      score: outcome.composite,
      rounds: outcome.rounds,
      transcriptPath: null,
      protocolVersion: cfg.protocolVersion,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    events: outcome.events,
    findings: findingsFromEvents(outcome.events),
    summary: outcome.summary,
    artifact: outcome.artifact,
  };
}

// ---------------------------------------------------------------------------
// Entry point: SSE stream (daemon bus shape)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown, id: string): string {
  return `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function prepareStreamCritique(
  ctx: DesignContext,
  params: RunCritiqueParams,
): Promise<{ ok: true; stream: (signal: AbortSignal) => ReadableStream<Uint8Array> } | RunCritiqueError> {
  const target = await resolveTarget(ctx, params);
  if ("ok" in target) return target;

  const cfg = loadCritiqueConfig();
  const brand = resolveBrand(target.designSystemId);
  const skill = { id: target.skillId ?? "design-critique" };
  const system = renderCritiquePrompt({ cfg, brand, skill, artifact: target.artifact });
  const modelId = resolveModelId(params.model || DEFAULT_MODEL_ID);
  const runId = randomUUID();

  await insertCritiqueRun({
    id: runId,
    projectId: target.projectId,
    conversationId: target.conversationId,
    status: "running",
    protocolVersion: cfg.protocolVersion,
  });

  const stream = (signal: AbortSignal): ReadableStream<Uint8Array> =>
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let seq = 0;
        let closed = false;
        const send = (event: string, data: unknown): void => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(sseFrame(event, data, `${runId}:${seq++}`)));
          } catch {
            closed = true;
          }
        };
        const close = (): void => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        send("ready", { runId });

        const messages: ModelMessage[] = [
          { role: "user", content: "Begin the critique run now. Emit only the CRITIQUE_RUN protocol." },
        ];

        // Buffer the model text, then drive the protocol parser once the stream
        // completes. The parser's SHIP finalization (round scoreboard, fallback)
        // is a post-stream pass, so we stream the raw model output for progress
        // but score + emit `critique.*` frames after the text is in hand.
        let text = "";
        try {
          const result = streamText({
            model: getChatProvider()(modelId),
            system,
            messages,
            abortSignal: signal,
          });
          for await (const delta of result.textStream) {
            if (signal.aborted) break;
            if (delta) text += delta;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await updateCritiqueRun(runId, { status: "failed" });
          send("critique.failed", { runId, cause: "orchestrator_internal" });
          send("error", { message });
          close();
          return;
        }

        const outcome = await driveCritique(
          runId,
          target.projectId,
          modelId,
          cfg,
          once(extractProtocol(text)),
          (event) => {
            const wire = panelEventToSse(event);
            send(wire.event, wire.data);
          },
        );

        await updateCritiqueRun(runId, {
          status: outcome.status,
          score: outcome.composite,
          rounds: outcome.rounds,
        });

        send("end", { runId, status: outcome.status, score: outcome.composite });
        close();
      },
    });

  return { ok: true, stream };
}
