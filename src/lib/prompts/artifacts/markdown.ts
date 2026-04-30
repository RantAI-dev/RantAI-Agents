export const markdownArtifact = {
  type: "text/markdown" as const,
  // Distinct from the `text/document` artifact's "Document" label —
  // both labels surface in canvas-mode UI, and sharing a string left
  // users guessing which option produced what. "Markdown" matches the
  // registry's shortLabel for this type.
  label: "Markdown",
  summary:
    "Documents, reports, READMEs, articles, tutorials — rendered Markdown with GFM tables, Shiki-highlighted code blocks, KaTeX math, and mermaid diagrams.",
  rules: `**text/markdown — Documents**

You are generating a long-form document that will be rendered as Markdown in a read-only panel. The reader's goal is to **read and understand**, not to interact. Pick this type for READMEs, technical documentation, reports, comparison articles, tutorials, design notes, and explanatory content.

## Runtime Environment
- **Renderer:** Streamdown (a streaming-friendly react-markdown wrapper) with GitHub Flavored Markdown enabled.
- **Code blocks** are syntax-highlighted by Shiki — you MUST tag every fenced block with a language (\`\`\`typescript, \`\`\`python, \`\`\`bash, \`\`\`json, \`\`\`sql, etc.). Untagged blocks render as unstyled plain text.
- **Tables** (GFM pipe tables) render natively. Use them for structured comparisons.
- **Math:** KaTeX is wired in via remark-math + rehype-katex. Inline math uses \`$...$\` and display math uses \`$$...$$\`. You can include equations directly in a markdown document — you do NOT need to switch to the LaTeX artifact type for an equation or two.
- **Mermaid diagrams:** \`\`\`mermaid fenced blocks render as live diagrams. Use them inline when a diagram clarifies the prose.
- **Task lists:** \`- [ ]\` and \`- [x]\` render as checkboxes (GFM).
- **Strikethrough:** \`~~text~~\` works (GFM).
- **Links** are clickable. **Images** via \`![alt](url)\` work for absolute URLs.
- **Raw HTML is unreliable.** The renderer is not guaranteed to pass HTML through. Do not write \`<details>\`, \`<kbd>\`, \`<sub>\`, \`<script>\`, etc. — express everything in Markdown.

## Type Boundary — Markdown vs. HTML vs. LaTeX
| Use case | Correct type | Why |
|---|---|---|
| README, technical docs, design notes, reports, articles, tutorials | \`text/markdown\` | Document to READ |
| Interactive page, dashboard, calculator, form, landing page | \`text/html\` | Page to INTERACT with |
| Pure mathematical proof or derivation, equation reference sheet | \`text/latex\` | Math-heavy, needs LaTeX environments |
| A document with a few inline equations | \`text/markdown\` | Markdown supports KaTeX inline |
| A diagram with an explanation | \`text/markdown\` (with a \`\`\`mermaid block) | Mixed content |
| Just a diagram | \`application/mermaid\` | Pure visual |

If the user wants to **read words and look at structure**, it's Markdown. If they want to **click, type, or compute**, it's HTML.

## Hard Limits
- **Size cap: 128 KiB** for new artifacts. The validator hard-fails new \`create_artifact\` calls above this limit. Updates to existing artifacts can grow past it but should not. As a rule of thumb, 128 KiB ≈ 25,000 words of prose or ≈ 3,500 lines of mixed code+prose. If your draft would exceed this, split into multiple artifacts (e.g. one per major section) and link between them.

## Document Structure
- Start with a single \`# Title\` (one H1, at the top).
- Use heading hierarchy consistently: \`##\` for major sections, \`###\` for subsections, \`####\` for sub-subsections. **Never skip levels** (no \`#\` followed directly by \`###\`).
- For documents with more than 3 major sections, include a brief **Table of Contents** right after the title with anchor links: \`- [Installation](#installation)\`.
- For reports, comparisons, and tutorials, end with a **Conclusion**, **Summary**, or **Next Steps** section.
- Group related content under sections — don't pile everything under one heading.

## Formatting Rules
- **Headings:** Title Case for \`#\` and \`##\`. Sentence case for \`###\` and below.
- **Paragraphs:** 2–4 sentences each. Separate paragraphs with a blank line. Never write a wall of text — break up anything longer than ~6 sentences.
- **Lists vs. prose:** Use bullet lists for genuinely enumerable items, numbered lists for ordered steps. Use prose paragraphs for explanations, arguments, and narrative. **Don't bullet everything** — alternating prose and lists reads better.
- **Code blocks:** Always include the language tag. Use fenced blocks (\`\`\`lang) not indented blocks. Inline code with single backticks: \`useState\`.
- **Tables:** Use for structured comparisons (feature × option). Keep cells concise. Align the pipes for readability in the source.
- **Emphasis:** Use \`**bold**\` for key terms, important warnings, and table headers in prose. Use \`*italic*\` for the first mention of a defined term, titles of works, or foreign words. Don't overuse either — emphasis loses meaning when half the page is bold.
- **Links:** Use descriptive text. Write \`[the Prisma docs](https://www.prisma.io/docs)\`, not raw \`https://www.prisma.io/docs\`.
- **Images:** \`![descriptive alt text](url)\` — alt text is required for accessibility.
- **Blockquotes:** \`> \` for callouts, quotes from other sources, or important asides.

## Content Quality
- Write **substantive content**. Every section should add real information.
- **No placeholders.** Never write \`[TODO]\`, \`[Add content here]\`, \`Lorem ipsum\`, \`...\`, \`(content omitted)\`, or "and so on."
- For technical docs: include **real code examples** in fenced blocks with language tags.
- For comparisons and reports: use **specifics** (numbers, names, versions) over vague generalities.
- For tutorials: number the steps and show the output the reader should expect.
- **Output the COMPLETE document.** Do not truncate. Do not write "the rest is left as an exercise."

## Anti-Patterns (Do NOT do these)
- ❌ Skipping heading levels (\`#\` then \`###\` with no \`##\` in between).
- ❌ Code fences without a language tag.
- ❌ Raw URLs instead of \`[descriptive text](url)\` links.
- ❌ Walls of text — paragraphs longer than ~6 sentences with no break.
- ❌ Bulleting everything when prose would read better.
- ❌ \`Lorem ipsum\`, \`[TODO]\`, \`...\`, or any placeholder.
- ❌ Truncation. Write the complete document.
- ❌ Raw HTML tags (\`<details>\`, \`<script>\`, \`<kbd>\`, etc.) — they're not guaranteed to render.
- ❌ More than one \`# H1\` per document.
- ❌ Mixing \`*\` and \`-\` bullet styles in the same list.
`,
  examples: [
    {
      label: "Technical README",
      code: `# Acme API — Node.js REST Service

A production-ready REST API for the Acme platform, built with Express, PostgreSQL, and JWT authentication.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Deployment](#deployment)

## Features

The service exposes a JSON REST API with the following capabilities:

- JWT-based authentication with refresh tokens
- Rate limiting (100 requests / minute / IP) via \`express-rate-limit\`
- Structured logging with \`pino\` and request correlation IDs
- Health and readiness probes for Kubernetes
- OpenAPI 3.1 schema served at \`/docs\`

## Requirements

| Component  | Version  | Notes                            |
|------------|----------|----------------------------------|
| Node.js    | >= 20.10 | LTS recommended                  |
| PostgreSQL | >= 15    | 16 used in CI                    |
| Redis      | >= 7     | Used for rate limit + sessions   |

## Installation

\`\`\`bash
git clone https://github.com/acme/api.git
cd api
npm install
cp .env.example .env
\`\`\`

## Configuration

Set the following environment variables in \`.env\`:

\`\`\`bash
DATABASE_URL=postgres://user:pass@localhost:5432/acme
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me-with-32-bytes
PORT=3000
\`\`\`

## API Reference

### \`POST /auth/login\`

Exchanges credentials for a JWT pair.

\`\`\`json
{
  "email": "user@example.com",
  "password": "hunter2"
}
\`\`\`

Returns:

\`\`\`json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900
}
\`\`\`

### \`GET /users/:id\`

Returns the user record. Requires a valid \`Authorization: Bearer <token>\` header.

## Deployment

The recommended deployment target is a Kubernetes cluster with the included Helm chart:

1. Build the image: \`docker build -t acme/api:latest .\`
2. Push to your registry: \`docker push acme/api:latest\`
3. Install the chart: \`helm install acme-api ./charts/api\`
4. Verify the readiness probe: \`kubectl get pods -l app=acme-api\`

## Conclusion

This service is designed for horizontal scaling — it stores no session state outside Redis and Postgres. For production hardening, enable TLS termination at the ingress and rotate \`JWT_SECRET\` on a regular schedule.
`,
    },
    {
      label: "Tutorial / explainer with math and a Mermaid diagram",
      code: `# Understanding Backpropagation

Backpropagation is the algorithm that lets a neural network learn from its mistakes. This tutorial walks through the intuition, the math, and a worked example for a single hidden-layer network.

## The Big Picture

Training a neural network is an optimization problem: we want to find the weights \`W\` that minimize a loss function \`L\`. Backpropagation is just the chain rule from calculus, applied efficiently using dynamic programming.

The training loop has three phases:

1. **Forward pass** — feed an input through the network, compute the prediction.
2. **Loss computation** — compare the prediction to the ground truth.
3. **Backward pass** — propagate the error gradient back through the layers and update each weight.

\`\`\`mermaid
flowchart LR
  A[Input x] --> B[Hidden layer]
  B --> C[Output ŷ]
  C --> D[Loss L]
  D -.gradient.-> C
  C -.gradient.-> B
  B -.gradient.-> A
\`\`\`

## The Math

For a single hidden-layer network with weights $W_1$ and $W_2$, the forward pass is:

$$
h = \\sigma(W_1 x), \\quad \\hat{y} = W_2 h
$$

Where $\\sigma$ is a non-linearity like ReLU or tanh. The loss for a single example is the squared error:

$$
L = \\frac{1}{2} (\\hat{y} - y)^2
$$

The gradient with respect to $W_2$ is straightforward:

$$
\\frac{\\partial L}{\\partial W_2} = (\\hat{y} - y) \\cdot h^\\top
$$

For $W_1$ we apply the chain rule once more:

$$
\\frac{\\partial L}{\\partial W_1} = \\left( W_2^\\top (\\hat{y} - y) \\odot \\sigma'(W_1 x) \\right) x^\\top
$$

## Worked Example

Suppose we have a single training example with $x = [1, 2]$, $y = 3$, and randomly initialized weights:

| Weight | Value |
|--------|-------|
| $W_1$  | $[[0.5, -0.3], [0.1, 0.4]]$ |
| $W_2$  | $[0.6, -0.2]$ |

After one forward pass we get $\\hat{y} \\approx 0.04$, so the error is large ($\\hat{y} - y = -2.96$). One backward step with learning rate $\\eta = 0.01$ pulls $W_2$ toward the correct direction by approximately $0.03$ per coordinate.

## Common Pitfalls

- **Vanishing gradients**: with deep networks and saturating non-linearities, gradients shrink exponentially. Use ReLU and skip connections.
- **Exploding gradients**: the opposite — gradients grow until they overflow. Clip gradient norms.
- **Wrong sign**: a missing minus sign in the update rule will make the network *un-learn*. Always check the loss decreases on the first few steps.

## Further Reading

- Rumelhart, Hinton & Williams (1986) — the original paper.
- Karpathy's [\`micrograd\`](https://github.com/karpathy/micrograd) — backprop in 100 lines of Python.
- Goodfellow et al., *Deep Learning*, chapter 6.

Backpropagation is conceptually simple but easy to misimplement. When in doubt, gradient-check a small example by hand.
`,
    },
  ] as { label: string; code: string }[],
}
