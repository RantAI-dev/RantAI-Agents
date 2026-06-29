export const htmlArtifact = {
  type: "text/html" as const,
  label: "HTML Page",
  summary:
    "Self-contained interactive HTML pages with Tailwind CSS v3 and JS interactivity, rendered in a sandboxed iframe.",
  rules: `**text/html — Self-contained Interactive HTML Pages**

You are generating a complete, production-quality HTML document that will render inside a sandboxed iframe. The result must look and feel like it was designed by a senior product designer — not a generic AI.

## Runtime Environment
- **Tailwind CSS v3 is auto-injected** from \`https://cdn.tailwindcss.com\`. Do NOT add another Tailwind <script>.
- **You MUST include the Inter font yourself** via \`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">\` and apply \`font-family: 'Inter', system-ui, sans-serif\` on body.
- **Sandbox restrictions**: \`allow-scripts\` only — \`allow-modals\` is intentionally NOT granted. \`location.*\`, \`history.*\`, \`window.open()\`, anchor navigation, form submission, AND browser-native dialogs (\`alert()\`, \`confirm()\`, \`prompt()\`) are all blocked. Build single-page interactivity with JS state and a custom in-page modal — never rely on real navigation, form POST, or alert/confirm/prompt.
- **No external network** beyond Google Fonts and the Tailwind CDN. No \`fetch()\` to real APIs. Mock data inline.
- \`localStorage\` works inside the iframe — use it for user preferences if relevant.

## Images — Unsplash Syntax
When you need a contextual photo, use the special \`unsplash:\` protocol:
\`\`\`html
<img src="unsplash:mountain sunset" alt="Mountain at sunset" />
<img src="unsplash:coffee shop interior" alt="Cozy coffee shop" />
\`\`\`
The server resolves these to real Unsplash photos before rendering. Rules:
- Use **descriptive keywords** (2-4 words) that describe the desired image
- Only works in \`src\` attributes — not CSS \`background-image\` or JS
- Always provide meaningful \`alt\` text (do NOT repeat the keyword verbatim)
- If you need a placeholder/decorative shape, use inline SVG or Tailwind gradients instead

## Required Document Structure
Every artifact MUST start with:
\`\`\`html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><!-- descriptive, <60 chars --></title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
  <style>body{font-family:var(--ds-font-sans)}</style>
</head>
<body class="min-h-full antialiased" style="background:var(--ds-bg);color:var(--ds-ink)">
  <!-- semantic content here -->
</body>
</html>
\`\`\`
Use semantic landmarks: \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<aside>\`, \`<footer>\`. Exactly one \`<h1>\` per document.

## Design System
This artifact is steered by the active design system (see the "Active design system" section below — RantAI Warm Paper by default). Its \`--ds-*\` CSS variables are already loaded in the runtime; build with them and do NOT introduce off-brand palettes (no slate/indigo) unless the user explicitly asks for a different look.
- **Surfaces:** page \`bg-[var(--ds-bg)]\`; cards \`bg-[var(--ds-surface)] rounded-[var(--ds-radius-lg)] shadow-[var(--ds-shadow-card)]\`. Depth comes from 1px rings, not heavy borders.
- **Text:** primary \`text-[var(--ds-ink)]\`; secondary \`text-[var(--ds-muted)]\`; small labels \`text-[var(--ds-faint)]\`.
- **Accent:** exactly ONE accent moment per view — \`bg-[var(--ds-accent)] text-[var(--ds-accent-ink)]\` for the main CTA, \`text-[var(--ds-accent)]\` for the single emphasized number.
- **Typography:** headings use the serif display font — \`style="font-family:var(--ds-font-display)"\` + \`tracking-tight\`; body/UI stays sans (\`var(--ds-font-sans)\`). \`text-balance\` on headings, \`text-pretty\` on long body. Display \`text-5xl\` · H1 \`text-4xl\` · H2 \`text-2xl\` · H3 \`text-lg\`.

**Spacing — Tailwind scale ONLY (no \`p-[16px]\`):**
- Section padding: \`py-12 md:py-16\`  · Card padding: \`p-5 md:p-6\`  · Gaps: \`gap-4\` / \`gap-6\` / \`gap-8\`

**Container:** \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`. Mobile-first: design 360px first, then \`sm:\` / \`md:\` / \`lg:\` / \`xl:\`. Touch targets ≥ \`h-11\` (44px).

**Layout priority:** Flexbox first, Grid only for true 2D, never absolute positioning unless overlaying.

## Accessibility (non-negotiable)
- Visible focus ring on every interactive element: \`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)] focus-visible:ring-offset-2\`
- Buttons: \`<button type="button" aria-label="...">\`. Icon-only: include \`<span class="sr-only">...</span>\`.
- Images: meaningful \`alt\`; decorative use \`alt=""\`.
- Form fields: paired \`<label for>\` + \`id\`. Color contrast ≥ 4.5:1.

## Code Quality — STRICT
- **NEVER truncate.** No \`<!-- ... -->\`, no "add more here". Output the COMPLETE document.
- **NEVER use placeholders** like \`Lorem ipsum\` for product content — write realistic, on-brand copy.
- No inline \`style="..."\` when a Tailwind class exists. Inline \`<style>\` blocks only for things Tailwind cannot express (e.g. \`@keyframes\`) and ≤ 10 lines.
- No \`!important\`. No hardcoded px in JS-set styles.
- Wrap top-level JS in \`(() => { ... })()\` or \`DOMContentLoaded\` listener. Mock data as \`const DATA = [...]\`.
- Use \`<button type="button">\` instead of \`<a href="#">\` for click handlers.

## Anti-Patterns
- ❌ Emoji as functional icons (use inline SVG)
- ❌ Hand-drawn complex SVG illustrations or geographic maps
- ❌ Gradient circles / blurry blobs as filler
- ❌ \`<form action="/submit">\` — sandbox blocks submission
- ❌ \`window.location = "..."\` — sandbox blocks navigation
- ❌ More than 2 font families · more than 5 colors
- ❌ Truncating "for brevity"
- ❌ External image URLs (use \`unsplash:keyword\` instead)
- ❌ Picsum, placeholder.com, or random image services`,
  examples: [
    {
      label: "complete interactive widget (house style)",
      code: `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily calorie calculator</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>body{font-family:var(--ds-font-sans)}</style>
</head>
<body class="min-h-full antialiased grid place-items-center p-4" style="background:var(--ds-bg);color:var(--ds-ink)">
  <main class="w-full max-w-md rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)] p-8">
    <h1 class="text-2xl tracking-tight" style="font-family:var(--ds-font-display)">Daily calorie calculator</h1>
    <p class="mt-1 text-sm text-[var(--ds-muted)]">Estimate your maintenance calories using the Mifflin-St Jeor formula.</p>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Age</span>
        <input id="age" type="number" value="30" class="h-11 rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] px-3 shadow-[var(--ds-shadow-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Sex</span>
        <select id="sex" class="h-11 rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] px-3 shadow-[var(--ds-shadow-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]">
          <option value="m">Male</option>
          <option value="f">Female</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Weight (kg)</span>
        <input id="weight" type="number" value="70" class="h-11 rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] px-3 shadow-[var(--ds-shadow-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Height (cm)</span>
        <input id="height" type="number" value="175" class="h-11 rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] px-3 shadow-[var(--ds-shadow-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]" />
      </label>
    </div>
    <label class="mt-4 flex flex-col gap-1.5">
      <span class="text-sm font-medium">Activity level</span>
      <select id="activity" class="h-11 rounded-[var(--ds-radius)] bg-[var(--ds-surface-2)] px-3 shadow-[var(--ds-shadow-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)]">
        <option value="1.2">Sedentary</option>
        <option value="1.375" selected>Light (1-3 d/wk)</option>
        <option value="1.55">Moderate (3-5 d/wk)</option>
        <option value="1.725">Very active (6-7 d/wk)</option>
      </select>
    </label>
    <div class="mt-6 rounded-[var(--ds-radius-lg)] p-5 text-center" style="background:var(--ds-accent-soft)">
      <div class="text-xs font-medium uppercase tracking-wider text-[var(--ds-faint)]">Maintenance</div>
      <div id="result" class="mt-1 text-4xl font-bold tabular-nums text-[var(--ds-accent)]" style="font-family:var(--ds-font-display)">2,400</div>
      <div class="text-xs text-[var(--ds-muted)]">kcal / day</div>
    </div>
  </main>
  <script>
    (() => {
      const $ = (id) => document.getElementById(id);
      const calc = () => {
        const age = +$('age').value, w = +$('weight').value, h = +$('height').value;
        const sex = $('sex').value, act = +$('activity').value;
        const bmr = sex === 'm'
          ? 10*w + 6.25*h - 5*age + 5
          : 10*w + 6.25*h - 5*age - 161;
        $('result').textContent = Math.round(bmr * act).toLocaleString();
      };
      ['age','sex','weight','height','activity'].forEach(id => $(id).addEventListener('input', calc));
      calc();
    })();
  </script>
</body>
</html>`,
    },
  ],
}
