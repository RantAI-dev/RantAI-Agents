export const MODEL_PRICING: Record<string, { promptPer1M: number; completionPer1M: number }> = {
  "anthropic/claude-sonnet-4": { promptPer1M: 3.0, completionPer1M: 15.0 },
  "anthropic/claude-haiku-4.5": { promptPer1M: 0.8, completionPer1M: 4.0 },
  "openai/gpt-4o": { promptPer1M: 2.5, completionPer1M: 10.0 },
  "openai/gpt-4o-mini": { promptPer1M: 0.15, completionPer1M: 0.6 },
}

const DEFAULT_COST_PER_1M = 2.0

export function estimateCostFromTokens(totalTokens: number, model?: string): number {
  const pricing = model ? MODEL_PRICING[model] : undefined
  const rate = pricing
    ? (pricing.promptPer1M + pricing.completionPer1M) / 2
    : DEFAULT_COST_PER_1M
  return (totalTokens / 1_000_000) * rate
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00"
  if (usd < 0.01) return "<$0.01"
  return `$${usd.toFixed(2)}`
}
