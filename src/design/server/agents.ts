/**
 * Design SPA agent registry — the CLI-detection → cloud-gateway swap.
 *
 * Upstream open-design's daemon answered `GET /api/agents` by probing the local
 * machine for installed coding-agent CLIs (Claude Code / codex / gemini / …)
 * and reporting each one's availability + auth status
 * (apps/daemon/src/routes/static-resource.ts → `detectAgents`). The cloud port
 * has no local CLIs: every generation runs through OUR model gateway
 * (`src/design/server/gateway.ts` over the RantAI model provider). So instead of
 * a detection list we report a SINGLE, always-ready synthetic agent that stands
 * in for the cloud gateway.
 *
 * Reporting one `available: true` + `authStatus: 'ok'` agent is what lets the
 * SPA treat runtime setup as complete: the onboarding gate + the composer's
 * `InlineModelSwitcher` both key off an agent being available/authenticated
 * (see web/App.tsx auto-pick + web/components/InlineModelSwitcher.tsx), and the
 * app auto-selects the first available agent once onboarding is done.
 */
import type { AgentInfo, AgentModelOption } from "@open-design/contracts"
import { AVAILABLE_MODELS } from "@/lib/models"

/**
 * Stable id for the single cloud gateway agent. Not in the SPA's
 * CANONICAL_AGENT_ORDER (that list is upstream's local CLIs), so it sorts last —
 * harmless when it is the only entry. Deliberately NOT `'amr'`: that id triggers
 * the SPA's AMR/Vela-specific model-probe + sign-in paths, which don't apply to
 * our gateway.
 */
export const CLOUD_AGENT_ID = "cloud"

/** Human-facing name shown in the agent picker / model switcher. */
export const CLOUD_AGENT_NAME = "RantAI Cloud"

/** Advertise the gateway's catalog as the agent's selectable models. */
function cloudAgentModels(): AgentModelOption[] {
  return AVAILABLE_MODELS.map((model) => ({ id: model.id, label: model.name }))
}

/**
 * The single cloud-gateway agent, always available + authenticated. Empty
 * diagnostics === healthy (per the AgentInfo contract). `supportsCustomModel`
 * is false so the model picker stays on the curated gateway catalog instead of
 * offering a free-text CLI model field that has no meaning for a hosted gateway.
 */
export function buildCloudAgent(): AgentInfo {
  return {
    id: CLOUD_AGENT_ID,
    name: CLOUD_AGENT_NAME,
    bin: CLOUD_AGENT_ID,
    available: true,
    authStatus: "ok",
    version: null,
    models: cloudAgentModels(),
    modelsSource: "live",
    supportsCustomModel: false,
  }
}

/** The `{ agents }` list the non-streaming `GET /api/agents` returns. */
export function listCloudAgents(): AgentInfo[] {
  return [buildCloudAgent()]
}

/**
 * Serialize the agent list into the daemon's SSE wire format for the
 * `GET /api/agents?stream=1` variant: one `event: agent` record per AgentInfo,
 * then a terminal `event: done`. Mirrors
 * apps/daemon/src/routes/static-resource.ts and matches the SPA's parser in
 * web/providers/registry.ts::fetchAgentsStream (records split on `\n\n`,
 * terminates on the `done` event).
 */
export function serializeCloudAgentsSse(): string {
  const frames = listCloudAgents().map(
    (agent) => `event: agent\ndata: ${JSON.stringify(agent)}\n\n`,
  )
  frames.push(`event: done\ndata: {}\n\n`)
  return frames.join("")
}
