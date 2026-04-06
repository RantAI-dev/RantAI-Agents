/**
 * Tracked AI labs whose models are synced 1:1 from OpenRouter.
 * Adding a new lab = one entry here.
 */
export const TRACKED_PROVIDERS = [
  { slug: "anthropic", name: "Anthropic" },
  { slug: "openai", name: "OpenAI" },
  { slug: "moonshotai", name: "Moonshot" },
  { slug: "qwen", name: "Qwen" },
  { slug: "z-ai", name: "Z.AI" },
  { slug: "google", name: "Google" },
  { slug: "meta-llama", name: "Meta" },
  { slug: "deepseek", name: "DeepSeek" },
  { slug: "mistralai", name: "Mistral" },
  { slug: "cohere", name: "Cohere" },
  { slug: "x-ai", name: "xAI" },
  { slug: "microsoft", name: "Microsoft" },
] as const

export type TrackedProviderSlug = (typeof TRACKED_PROVIDERS)[number]["slug"]

const slugToName = new Map<string, string>(TRACKED_PROVIDERS.map((p) => [p.slug, p.name]))

/** Get the display name for a provider slug, or format it as a fallback. */
export function getProviderName(slug: string): string {
  return slugToName.get(slug) ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}

/** Check if a provider slug is in the tracked list. */
export function isTrackedProvider(slug: string): boolean {
  return slugToName.has(slug)
}
