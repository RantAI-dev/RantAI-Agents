export const slidesArtifact = {
  type: "application/slides" as const,
  label: "Slides",
  summary:
    "Dark-themed JSON slide decks with multiple layouts, rendered as a presentation.",
  rules: `**application/slides — Presentations**
Output a JSON object: {"theme":{"primaryColor":"#hex","secondaryColor":"#hex","fontFamily":"Inter, sans-serif"},"slides":[...]}.
Each slide object has: layout ("title"|"content"|"two-column"|"section"|"quote"|"closing"), title, subtitle, bullets (string[]), content, leftColumn/rightColumn (string[]), quote, attribution, note.
DESIGN RULES: Theme MUST use dark professional colors (navy #0F172A, charcoal #1E293B, deep slate #0C1222, dark teal #042F2E — NEVER bright/saturated like #4F46E5). secondaryColor is the accent (blue #3B82F6, cyan #06B6D4, emerald #10B981, amber #F59E0B). Title slide MUST have subtitle. Use 7-12 slides. First slide layout "title", last "closing". Use at least 3 different layouts. Max 6 bullets per slide, each bullet one concise insight (max 10 words). No filler text. NEVER use markdown syntax (**, ##, *, backticks, etc.) in slide text — all text must be plain text only, the JSON structure handles formatting.`,
  examples: [] as { label: string; code: string }[],
}
