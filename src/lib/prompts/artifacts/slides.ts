export const slidesArtifact = {
  type: "application/slides" as const,
  label: "Slides",
  summary:
    "Presentation decks as JSON — 6 layouts, dark/light slide alternation, arrow-key navigation, and PPTX export.",
  rules: `**application/slides — Presentations**

You are generating a complete slide deck as a JSON object that will render in an iframe with arrow-key navigation, dot pagination, and a "Download PPTX" button. The deck must look professional out of the box — title and section slides get a dark gradient background with white text; content/two-column/quote slides get a clean white background with dark text. **Both previews and PPTX export are driven from the same JSON, so what you write is exactly what the user gets.**

## Output Format — JSON ONLY

Output **a single JSON object**. No markdown, no fences, no explanation, no leading/trailing prose. The renderer parses raw JSON; anything else will be rejected by the validator.

\`\`\`json
{
  "theme": {
    "primaryColor": "#0F172A",
    "secondaryColor": "#3B82F6",
    "fontFamily": "Inter, sans-serif"
  },
  "slides": [
    { "layout": "title", "title": "...", "subtitle": "..." },
    { "layout": "content", "title": "...", "bullets": ["...", "..."] },
    { "layout": "closing", "title": "..." }
  ]
}
\`\`\`

Top-level **must** have \`theme\` and \`slides\`. \`slides\` must be a non-empty array. Every slide object must have a \`layout\` field set to one of the seven valid values listed below.

## Theme

| Field | Required | Notes |
|---|---|---|
| \`primaryColor\` | yes | Hex string. Background of \`title\`/\`section\`/\`closing\` slides + PPTX title color. **Must be dark and desaturated.** The renderer auto-derives a darker gradient pair from this value, so anything bright will look washed out and clash with the white text overlaid on it. |
| \`secondaryColor\` | yes | Hex string. Accent line, title accent bar, and PPTX bullet color. **Must be vivid** so accents pop against both the dark and white slide backgrounds. |
| \`fontFamily\` | yes | Always \`"Inter, sans-serif"\` unless the user explicitly requests another font. The renderer loads Inter from Google Fonts. |

**Approved \`primaryColor\` values** (pick one — don't invent others without a clear reason):

- \`#0F172A\` — slate 900 (default — works for almost any topic)
- \`#1E293B\` — slate 800 (slightly softer)
- \`#0C1222\` — deep navy (formal / financial)
- \`#042F2E\` — dark teal (sustainability / health)
- \`#1C1917\` — warm dark (creative / agency)
- \`#1A1A2E\` — indigo black (tech / launches)

**Approved \`secondaryColor\` values** (pair with the primary above):

- \`#3B82F6\` — blue (default, pairs with any primary)
- \`#06B6D4\` — cyan (tech, fintech)
- \`#10B981\` — emerald (growth, sustainability)
- \`#F59E0B\` — amber (warm, sales)
- \`#8B5CF6\` — violet (creative)
- \`#EC4899\` — pink (consumer)

**NEVER use:** white/near-white as \`primaryColor\`, bright saturated indigo (\`#4F46E5\`) as \`primaryColor\`, system colors like \`black\`, RGB/HSL syntax, or shorthand hex (\`#000\`). Always 6-digit hex with leading \`#\`.

## Layouts — Six Valid Values

There are six layouts you should use, listed below with their **required** and **optional** fields. A seventh value (\`image-text\`) exists for backwards compatibility but renders identically to \`content\` and adds nothing — **do not use it**, use \`content\`.

### \`title\` — opening slide
Dark gradient background, white text, centered. **Must be the first slide of every deck.**

| Field | Required | Notes |
|---|---|---|
| \`title\` | **yes** | The deck title. 2–8 words, no trailing punctuation. |
| \`subtitle\` | **yes** | One short sentence — author name + date, tagline, or one-line context. The validator warns if missing. |
| \`note\` | optional | Small text below the subtitle (e.g. "Internal — Q1 2026"). |

### \`content\` — main workhorse
White background, dark text, accent-bar title, bullets or paragraph body.

| Field | Required | Notes |
|---|---|---|
| \`title\` | strongly recommended | Slide heading. Without it the content has no anchor. |
| \`bullets\` | one of \`bullets\` / \`content\` is required | Array of strings. **Max 6 bullets.** Each bullet ≤ 10 words. |
| \`content\` | one of \`bullets\` / \`content\` is required | A short paragraph (1–3 sentences) when bullets don't fit the message. Use one or the other, not both. |
| \`note\` | optional | Small italic footer line. |

### \`two-column\` — comparison / paired-list
White background, two parallel bullet lists separated by a divider. Use for **before/after, problem/solution, pros/cons, our approach vs theirs, features split into categories**.

| Field | Required | Notes |
|---|---|---|
| \`title\` | strongly recommended | Slide heading. |
| \`leftColumn\` | **yes** | Array of strings. ≤ 5 items. ≤ 10 words each. |
| \`rightColumn\` | **yes** | Array of strings, same shape. Try to balance the column lengths. |
| \`note\` | optional | Footer line. |

### \`section\` — chapter divider
Dark gradient background, white text, centered. Use to **break a long deck into 2–4 logical sections** when the talk has clear act breaks. Optional and only worth it for decks of 9+ slides.

| Field | Required | Notes |
|---|---|---|
| \`title\` | **yes** | The section title. 1–4 words. |
| \`subtitle\` | optional | One short sentence framing what's in the section. |

### \`quote\` — testimonial / pull quote
White background, large quotation marks, centered blockquote. Use sparingly — at most one per deck. Great for customer testimonials, expert claims, or a memorable statistic phrased as a quote.

| Field | Required | Notes |
|---|---|---|
| \`quote\` | **yes** | The quoted text. Plain prose, no quotation marks (the renderer adds them). 5–25 words. |
| \`attribution\` | strongly recommended | \`Name, Title, Company\` format. |

### \`closing\` — final slide
Dark gradient background, white text, centered. **Must be the last slide of every deck.**

| Field | Required | Notes |
|---|---|---|
| \`title\` | **yes** | The closing line — a CTA, a thank-you, or the headline takeaway. |
| \`subtitle\` | optional | A short follow-up line. \`subtitle\` is preferred over \`content\` here; if both are set, \`subtitle\` wins. |
| \`content\` | optional | Fallback if you didn't set \`subtitle\`. Same role. |

## Deck Structure Rules

- **Total slide count: 7–12.** Fewer feels thin; more loses the audience.
- **First slide MUST be \`layout: "title"\`.** Validator convention.
- **Last slide MUST be \`layout: "closing"\`.** Validator convention.
- **Use at least 3 different layouts** across the deck. A deck of 10 \`content\` slides is boring and the audit penalizes it.
- **Narrative arc:** opening → context/problem → core content → evidence (data or quote) → closing. Don't dump bullets in arbitrary order.
- For decks ≥ 9 slides, insert 1–2 \`section\` slides as act breaks.

## Content Rules

- **Plain text only.** No markdown syntax — no \`**bold**\`, no \`## headings\`, no backtick code, no \`*italics*\`, no \`>\` blockquotes, no list dashes inside fields. The JSON structure handles all formatting, and the validator warns when it detects markdown leaking into text fields.
- **Bullets ≤ 10 words each.** A bullet is a takeaway, not a sentence. If you need a full sentence, use \`content\` instead.
- **Bullets ≤ 6 per slide.** The validator warns on more.
- **Realistic, substantive copy.** No placeholder text — no \`Lorem ipsum\`, no \`Company Name\`, no \`Add your point here\`, no \`TBD\`. If the user gives you a topic, fill in plausible numbers, names, and concrete claims.
- **Numbers anchor claims.** "Increased revenue" is filler; "Revenue grew 23% to $4.2M" is content. Prefer specific over vague.
- **Title slide title is the deck name**, not "Welcome" or "Introduction". Subtitle is the framing, not "by AI".
- **Closing slide is a CTA or a takeaway**, not "Thank You" alone. "Thank you — questions?" or "Next: pilot launch in May" is acceptable.
- **\`note\` field is visible**, not just speaker notes. It renders as small footer text in the preview AND as a footer in the PPTX export. Use it for source citations, "Internal", or dates — not for stage directions.

## Tone — match the user's request

If the user asks for a pitch deck, write like a founder pitching investors. If they ask for an educational deck, write like a teacher introducing a concept. If they ask for a status report, write like a PM reporting to leadership. **Never default to a generic "AI deck" voice.** Specific tone choices (sourced from how Presenton/SlideDeck AI categorize it):

- **Pitch / sales:** confident, outcome-focused, numbers-forward, short bullets.
- **Educational:** define terms, build from simple to complex, use analogies in \`content\` paragraphs.
- **Technical overview:** name actual systems and tools, prefer two-column for "before/after" architecture.
- **Status report:** lead with the headline metric, then risks and next steps.

## Anti-Patterns

- ❌ Outputting anything before \`{\` or after \`}\` (no preamble, no explanation)
- ❌ Wrapping JSON in markdown fences (\`\`\`json … \`\`\`)
- ❌ Using \`image-text\` layout — it has no image support, use \`content\`
- ❌ Bright \`primaryColor\` (\`#FFFFFF\`, \`#4F46E5\`, \`#3B82F6\`) — title slides will be unreadable
- ❌ Missing \`subtitle\` on the \`title\` slide
- ❌ First slide layout other than \`title\`
- ❌ Last slide layout other than \`closing\`
- ❌ Fewer than 7 or more than 12 slides
- ❌ Same layout for every slide
- ❌ Bullets longer than 10 words / more than 6 per slide
- ❌ Placeholder text (\`Lorem ipsum\`, \`Company Name\`, \`TBD\`, \`Add your point here\`)
- ❌ Markdown syntax inside any text field (\`**bold**\`, \`## heading\`, backticks, leading \`-\`)
- ❌ Two-column missing \`leftColumn\` or \`rightColumn\`
- ❌ \`quote\` slide without a \`quote\` field
- ❌ Truncation — output every slide in full, no \`"... etc"\``,
  examples: [
    {
      label: "Startup pitch deck — fintech, 8 slides, mixed layouts",
      code: `{
  "theme": {
    "primaryColor": "#0C1222",
    "secondaryColor": "#06B6D4",
    "fontFamily": "Inter, sans-serif"
  },
  "slides": [
    {
      "layout": "title",
      "title": "PayFlow",
      "subtitle": "Cross-border payments built for Southeast Asian SMEs",
      "note": "Series A pitch — March 2026"
    },
    {
      "layout": "content",
      "title": "The problem",
      "bullets": [
        "SMEs lose 6.4% per cross-border transaction on average",
        "Settlement takes 3-5 business days through correspondent banks",
        "Compliance paperwork blocks 1 in 4 first-time exporters",
        "Existing fintechs target consumers, not B2B flows"
      ]
    },
    {
      "layout": "content",
      "title": "Our solution",
      "content": "PayFlow is a B2B cross-border payment rail purpose-built for Southeast Asia. We connect to local clearing systems in Indonesia, Vietnam, the Philippines, and Thailand directly, settling in 90 seconds at a flat 0.9% fee with KYC pre-cleared at onboarding."
    },
    {
      "layout": "two-column",
      "title": "How we compare",
      "leftColumn": [
        "Wise: consumer-first, 1.5% avg fee",
        "Bank wires: 6.4% all-in, 3-5 days",
        "Crypto rails: regulatory grey zone",
        "Local agents: opaque, untraceable"
      ],
      "rightColumn": [
        "PayFlow: 0.9% flat, 90 seconds",
        "Direct local clearing integration",
        "KYB pre-cleared, audit trail built in",
        "API + dashboard from day one"
      ]
    },
    {
      "layout": "content",
      "title": "Traction",
      "bullets": [
        "$48M processed in the last 90 days",
        "612 active SMEs across 4 countries",
        "Net revenue retention of 138%",
        "Live integrations with BCA, Vietcombank, BPI"
      ]
    },
    {
      "layout": "quote",
      "quote": "PayFlow cut our payment ops from a half-day job to a single click. We moved our entire APAC vendor flow over in two weeks.",
      "attribution": "Maya Chen, COO, Reka Apparel (Jakarta)"
    },
    {
      "layout": "content",
      "title": "Use of funds",
      "bullets": [
        "Engineering 40% — local-rail integrations for MY and SG",
        "Compliance 25% — full PSP licensing in IDN and VNM",
        "Go-to-market 25% — partner with 50 trade associations",
        "Reserve 10% — runway buffer through Q4 2027"
      ]
    },
    {
      "layout": "closing",
      "title": "Raising $12M Series A",
      "subtitle": "Lead investors confirmed. Closing May 2026.",
      "note": "payflow.example / founders@payflow.example"
    }
  ]
}`,
    },
    {
      label: "Technical overview — microservice migration, 9 slides, includes section divider",
      code: `{
  "theme": {
    "primaryColor": "#1E293B",
    "secondaryColor": "#10B981",
    "fontFamily": "Inter, sans-serif"
  },
  "slides": [
    {
      "layout": "title",
      "title": "From Monolith to Kubernetes",
      "subtitle": "How the Orders platform shipped 312 deploys per week in Q1 2026"
    },
    {
      "layout": "content",
      "title": "Why we migrated",
      "bullets": [
        "Single Rails monolith — no team isolation",
        "Deploy lead time: 4.5 hours average, p95 a day",
        "Lock contention killed checkout twice in 2025",
        "Hiring stalled — candidates wanted modern infra"
      ]
    },
    {
      "layout": "section",
      "title": "Architecture",
      "subtitle": "What replaced the monolith"
    },
    {
      "layout": "two-column",
      "title": "Before vs after",
      "leftColumn": [
        "1 Rails monolith, 480k LOC",
        "Shared Postgres, 1.8 TB",
        "Capistrano deploys, 4.5h lead time",
        "Single staging environment"
      ],
      "rightColumn": [
        "11 Go services on EKS",
        "Per-service Postgres with CDC stream",
        "ArgoCD GitOps, 9 minute lead time",
        "Per-PR ephemeral environments"
      ]
    },
    {
      "layout": "content",
      "title": "Service boundaries",
      "content": "We split along noun ownership rather than verb workflows. Each domain (orders, fulfillment, billing, identity, catalog) owns its own data, exposes a versioned gRPC API, and emits domain events to NATS. Cross-service queries go through a thin BFF instead of joining tables."
    },
    {
      "layout": "section",
      "title": "Results",
      "subtitle": "What changed for engineers and customers"
    },
    {
      "layout": "content",
      "title": "Numbers after 8 months",
      "bullets": [
        "Deploy lead time: 4.5h → 9 min",
        "Incidents: 18 in Q4 2025, 4 in Q1 2026",
        "Engineering NPS rose from 12 to 47",
        "Checkout p99 latency dropped 38%"
      ]
    },
    {
      "layout": "quote",
      "quote": "I shipped my first change on day three. In the monolith that took new hires almost a month.",
      "attribution": "Tomasz Kowalski, SRE (joined Feb 2026)"
    },
    {
      "layout": "closing",
      "title": "What's next",
      "subtitle": "Multi-region active-active by Q4 — runbook ships next sprint"
    }
  ]
}`,
    },
  ] as { label: string; code: string }[],
}
