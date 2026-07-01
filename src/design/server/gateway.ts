/**
 * Design SPA generation gateway — the CLI→model-gateway swap.
 *
 * Upstream open-design's daemon answered `POST /api/runs` + `GET
 * /api/runs/:id/events` by spawning an agent CLI subprocess (Claude Code /
 * codex / …) and mirroring its stream-json output onto the chat SSE protocol.
 * The cloud port keeps the EXACT same two-request wire contract the SPA's run
 * client (`web/providers/daemon.ts`) speaks, but replaces the subprocess with
 * OUR model gateway (`streamText` over `getChatProvider()`), and replaces the
 * daemon's SQLite message store with Prisma (`OdMessage` / `OdConversation`).
 *
 * Wire contract this module honors (see
 * `design/packages/contracts/src/sse/chat.ts` +
 * `web/providers/daemon.ts::consumeDaemonRun`):
 *
 *   1. POST /api/design/runs  (ChatRequest)  → { runId, conversationId,
 *      assistantMessageId }  (ChatRunCreateResponse). Persists the user turn.
 *   2. GET  /api/design/runs/:id/events      → text/event-stream of ChatSseEvent
 *      frames: `start` → `agent`(text_delta …) → `end`. The whole model
 *      generation happens inside this GET so no cross-request run state is
 *      needed beyond a short-lived in-memory handoff of the request params.
 *
 * Only the run/generation halves are ported here (the marquee endpoint). Tool
 * calls, filesystem artifacts, live-artifacts, and title generation are NOT
 * emitted — the model runs through a plain Messages API and delivers its result
 * as `<artifact type="text/html">` HTML inside the streamed assistant text,
 * which the SPA parses client-side (`web/artifacts/parser.ts`).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { streamText, type ModelMessage } from "ai";
import { getChatProvider, resolveModelId } from "@/lib/llm/provider";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import type { ChatRequest } from "@open-design/contracts";
import type { DesignContext } from "./auth";
import { composeSystemPrompt } from "./prompt-compose";

// ---------------------------------------------------------------------------
// System-prompt composition
//
// The design-system/skill-steered composer lives in ./prompt-compose.ts (a
// pure, catalog-only module so it stays unit-testable). It mirrors the daemon's
// order (reference/open-design/apps/daemon/src/prompts/system.ts): base charter
// → active design system (DESIGN.md authoritative + tokens) → active skill
// (SKILL.md workflow) → project block. Here we resolve the effective
// designSystemId / skillId (run request first, else the project's stored
// values) and hand them to the composer.
// ---------------------------------------------------------------------------

/** Effective skill id for a run: per-turn request wins over the project's stored skill. */
function effectiveSkillId(request: ChatRequest, projectSkillId: string | null): string | null {
  return request.skillId ?? request.skillIds?.[0] ?? projectSkillId ?? null;
}

/** Effective design-system id for a run: request wins over the project's stored brand. */
function effectiveDesignSystemId(
  request: ChatRequest,
  projectDesignSystemId: string | null,
): string | null {
  return request.designSystemId ?? projectDesignSystemId ?? null;
}

// ---------------------------------------------------------------------------
// Short-lived pending-run registry
//
// POST creates the run and GET streams it; the request params (message, model,
// project scope, …) are handed off in-memory keyed by runId. The window between
// the two requests is a single user gesture (milliseconds), so a module-level
// map on the long-running Node server is sufficient. Entries are consumed once
// by the events stream and swept after a TTL so a POST whose GET never arrives
// cannot leak.
// ---------------------------------------------------------------------------

interface PendingRun {
  userId: string;
  organizationId: string | null;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  agentId: string;
  request: ChatRequest;
  createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingRuns = new Map<string, PendingRun>();

function sweepPending(now: number): void {
  for (const [id, run] of pendingRuns) {
    if (now - run.createdAt > PENDING_TTL_MS) pendingRuns.delete(id);
  }
}

function takePendingRun(runId: string): PendingRun | undefined {
  const run = pendingRuns.get(runId);
  if (run) pendingRuns.delete(runId);
  return run;
}

// ---------------------------------------------------------------------------
// Persistence helpers (SQLite → Prisma swap)
// ---------------------------------------------------------------------------

interface ResolvedConversation {
  id: string;
  projectId: string;
  projectName: string;
  customInstructions: string | null;
  /** Project's stored brand — the run request may override it per-turn. */
  designSystemId: string | null;
  /** Project's stored skill — the run request may override it per-turn. */
  skillId: string | null;
}

async function resolveConversation(
  ctx: DesignContext,
  projectId: string | null | undefined,
  conversationId: string | null | undefined,
): Promise<ResolvedConversation | null> {
  const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
  const include = { project: true } as const;
  const shape = (convo: {
    id: string;
    projectId: string;
    project: {
      name: string;
      customInstructions: string | null;
      designSystemId: string | null;
      skillId: string | null;
    };
  }): ResolvedConversation => ({
    id: convo.id,
    projectId: convo.projectId,
    projectName: convo.project.name,
    customInstructions: convo.project.customInstructions ?? null,
    designSystemId: convo.project.designSystemId ?? null,
    skillId: convo.project.skillId ?? null,
  });

  if (conversationId) {
    const convo = await prisma.odConversation.findFirst({
      where: { id: conversationId, project: scope },
      include,
    });
    if (convo) return shape(convo);
  }

  if (projectId) {
    const convo = await prisma.odConversation.findFirst({
      where: { projectId, project: scope },
      orderBy: { updatedAt: "desc" },
      include,
    });
    if (convo) return shape(convo);
  }

  return null;
}

/** Latest `## user` block from a daemon transcript, used only when the request
 *  omits `currentPrompt`. */
function latestUserTurnFromTranscript(transcript: string): string {
  const matches = [...transcript.matchAll(/^## user[ \t]*\r?\n([\s\S]*?)(?=\r?\n## (?:user|assistant|system)\b|$)/gm)];
  const last = matches[matches.length - 1];
  return last ? last[1].trim() : transcript.trim();
}

async function persistUserMessage(conversationId: string, content: string): Promise<void> {
  if (!content) return;
  // Dedupe retries: a retried run reuses the same user turn, already persisted.
  const last = await prisma.odMessage.findFirst({
    where: { conversationId },
    orderBy: { position: "desc" },
  });
  if (last && last.role === "user" && last.content === content) return;

  const position = await prisma.odMessage.count({ where: { conversationId } });
  await prisma.odMessage.create({
    data: {
      id: randomUUID(),
      conversationId,
      role: "user",
      content,
      position,
      createdAt: BigInt(Date.now()),
    },
  });
}

async function loadModelMessages(conversationId: string): Promise<ModelMessage[]> {
  const rows = await prisma.odMessage.findMany({
    where: { conversationId },
    orderBy: { position: "asc" },
    select: { role: true, content: true },
  });
  const messages: ModelMessage[] = [];
  for (const row of rows) {
    const content = row.content?.trim();
    if (!content) continue;
    if (row.role === "assistant") messages.push({ role: "assistant", content });
    else if (row.role === "user") messages.push({ role: "user", content });
  }
  return messages;
}

async function persistAssistantMessage(
  pending: PendingRun,
  content: string,
  runId: string,
): Promise<void> {
  const now = BigInt(Date.now());
  const events = content ? JSON.stringify([{ kind: "text", text: content }]) : null;
  const position = await prisma.odMessage.count({ where: { conversationId: pending.conversationId } });

  await prisma.odMessage.upsert({
    where: { id: pending.assistantMessageId },
    create: {
      id: pending.assistantMessageId,
      conversationId: pending.conversationId,
      role: "assistant",
      content,
      agentId: pending.agentId,
      eventsJson: events,
      sessionMode: pending.request.sessionMode ?? "design",
      position,
      createdAt: now,
      endedAt: now,
      runId,
      runStatus: "succeeded",
    },
    update: {
      content,
      eventsJson: events,
      endedAt: now,
      runId,
      runStatus: "succeeded",
    },
  });

  await prisma.odConversation.update({
    where: { id: pending.conversationId },
    data: { updatedAt: now },
  });
}

// ---------------------------------------------------------------------------
// POST /api/design/runs  — create the run + persist the user turn.
// ---------------------------------------------------------------------------

export type CreateRunResult =
  | { ok: true; runId: string; conversationId: string; assistantMessageId: string }
  | { ok: false; status: number; code: string; message: string };

export async function createDesignRun(
  ctx: DesignContext,
  request: ChatRequest,
): Promise<CreateRunResult> {
  if (!request || typeof request !== "object") {
    return { ok: false, status: 400, code: "BAD_REQUEST", message: "invalid request body" };
  }

  const resolved = await resolveConversation(ctx, request.projectId, request.conversationId);
  if (!resolved) {
    return {
      ok: false,
      status: 404,
      code: "CONVERSATION_NOT_FOUND",
      message: "project or conversation not found",
    };
  }

  const userContent =
    (typeof request.currentPrompt === "string" && request.currentPrompt.trim()) ||
    (typeof request.message === "string" ? latestUserTurnFromTranscript(request.message) : "");

  await persistUserMessage(resolved.id, userContent);

  const runId = randomUUID();
  const assistantMessageId = request.assistantMessageId ?? randomUUID();
  const agentId = typeof request.agentId === "string" && request.agentId ? request.agentId : "design";

  sweepPending(Date.now());
  pendingRuns.set(runId, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    projectId: resolved.projectId,
    conversationId: resolved.id,
    assistantMessageId,
    agentId,
    request,
    createdAt: Date.now(),
  });

  return { ok: true, runId, conversationId: resolved.id, assistantMessageId };
}

// ---------------------------------------------------------------------------
// GET /api/design/runs/:id/events  — run the model + stream ChatSseEvent frames.
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown, id: string): string {
  return `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function streamDesignRun(
  ctx: DesignContext,
  runId: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
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

      const pending = takePendingRun(runId);
      if (!pending || pending.userId !== ctx.userId) {
        send("error", { message: "run not found or unauthorized" });
        send("end", { code: 1, status: "failed" });
        close();
        return;
      }

      try {
        // Re-validate ownership + fetch fresh project context (double auth).
        const resolved = await resolveConversation(
          ctx,
          pending.projectId,
          pending.conversationId,
        );
        if (!resolved) {
          send("error", { message: "conversation not found" });
          send("end", { code: 1, status: "failed" });
          close();
          return;
        }

        const modelId = resolveModelId(pending.request.model || DEFAULT_MODEL_ID);
        const system = composeSystemPrompt({
          projectName: resolved.projectName,
          customInstructions: resolved.customInstructions,
          designSystemId: effectiveDesignSystemId(pending.request, resolved.designSystemId),
          skillId: effectiveSkillId(pending.request, resolved.skillId),
        });
        const messages = await loadModelMessages(pending.conversationId);

        send("start", {
          runId,
          agentId: pending.agentId,
          bin: modelId,
          model: modelId,
          projectId: resolved.projectId,
          protocolVersion: 1,
        });

        const result = streamText({
          model: getChatProvider()(modelId),
          system,
          messages,
          abortSignal: signal,
        });

        let acc = "";
        for await (const delta of result.textStream) {
          if (signal.aborted) break;
          if (!delta) continue;
          acc += delta;
          send("agent", { type: "text_delta", delta });
        }

        // Best-effort usage frame — the SPA renders token/cost when present.
        try {
          const usage = await result.usage;
          if (usage) {
            send("agent", {
              type: "usage",
              usage: {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
              },
            });
          }
        } catch {
          /* usage is optional */
        }

        if (signal.aborted) {
          // Client dropped the stream; persist whatever we produced and end
          // as canceled (the SPA treats canceled as a clean finish).
          try {
            await persistAssistantMessage(pending, acc, runId);
          } catch {
            /* best-effort */
          }
          send("end", { code: null, signal: "SIGTERM", status: "canceled" });
          close();
          return;
        }

        try {
          await persistAssistantMessage(pending, acc, runId);
        } catch {
          /* durability is best-effort; the live reply already rendered */
        }

        send("end", { code: 0, status: "succeeded" });
        close();
      } catch (err) {
        if (signal.aborted) {
          send("end", { code: null, signal: "SIGTERM", status: "canceled" });
          close();
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
        send("end", { code: 1, status: "failed" });
        close();
      }
    },
  });
}
