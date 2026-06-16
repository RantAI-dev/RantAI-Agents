/**
 * House models — white-labeled, first-party model options served by a DIRECT
 * upstream provider (currently MiniMax, via its OpenAI-compatible API), NOT
 * through OpenRouter. Users see only the RantAI branding; the upstream vendor
 * is an implementation detail and must not be surfaced in the UI.
 *
 * Why this exists: house models are billed to us on a flat / committed basis
 * (not OpenRouter pay-as-you-go), so we expose them as a cheap, high-headroom
 * option and charge a LOW, SYNTHETIC per-token credit price (see `pricing`) that
 * is intentionally decoupled from the real upstream cost — tune it to whatever
 * deal you have with the upstream.
 *
 * This module is intentionally dependency-free and env-free so it is safe to
 * import from both server and client code:
 *   - upstream provider selection + API key live in `provider.ts` (server-only)
 *   - the synthetic credit price is consumed by `model-pricing.ts`
 *   - the catalog listing is consumed by the dashboard models route + wizard
 */

export interface HouseModel {
  /** White-labeled, client-visible id (namespaced under the `rantai/` slug). */
  id: string
  /** Display name shown to users. Must not reveal the upstream provider. */
  name: string
  /** Display provider / brand. */
  provider: string
  description: string
  contextWindow: number
  /**
   * Synthetic credit price ($ per 1M tokens) — what the USER is charged, NOT
   * what the upstream costs us. Deliberately cheap; tune to your contract.
   * (1 credit = $0.001 of this synthetic cost; see credits/model-pricing.)
   */
  pricing: { input: number; output: number }
  capabilities: { vision: boolean; functionCalling: boolean; streaming: boolean }
  /** Real upstream model name sent to the direct provider (server-side only). */
  backendModel: string
}

export const HOUSE_MODELS: HouseModel[] = [
  {
    id: "rantai/nano",
    name: "RantAI Nano",
    provider: "RantAI",
    description:
      "Ultra-economical model for high-volume, everyday tasks — the lowest credit cost.",
    contextWindow: 204_800,
    pricing: { input: 0.08, output: 0.3 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
    backendModel: "MiniMax-M2.5",
  },
  {
    id: "rantai/swift",
    name: "RantAI Swift",
    provider: "RantAI",
    description: "Fast, balanced model for everyday chat and tool-using agents.",
    contextWindow: 204_800,
    // Synthetic price — what the USER is charged, decoupled from upstream cost.
    pricing: { input: 0.1, output: 0.4 },
    capabilities: { vision: false, functionCalling: true, streaming: true },
    backendModel: "MiniMax-M2.7",
  },
  {
    id: "rantai/prime",
    name: "RantAI Prime",
    provider: "RantAI",
    description:
      "Flagship — 1M-token context, understands images, strongest reasoning and tool use.",
    contextWindow: 1_000_000,
    // Priced at upstream pass-through so margin holds even off a flat plan.
    pricing: { input: 0.6, output: 2.4 },
    capabilities: { vision: true, functionCalling: true, streaming: true },
    backendModel: "MiniMax-M3",
  },
]

const byId = new Map(HOUSE_MODELS.map((m) => [m.id, m]))

/** Whether `id` is a white-labeled house model served by a direct provider. */
export function isHouseModel(id: string): boolean {
  return byId.has(id)
}

export function getHouseModel(id: string): HouseModel | undefined {
  return byId.get(id)
}

/** Map a house id to its upstream model name; passthrough for non-house ids. */
export function houseBackendModel(id: string): string {
  return byId.get(id)?.backendModel ?? id
}
