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
- **Sandbox restrictions**: \`allow-scripts allow-modals\` only. \`location.*\`, \`history.*\`, \`window.open()\`, anchor navigation, and form submission are all blocked. Build single-page interactivity with JS state — never rely on real navigation or form POST.
- **No external network** beyond Google Fonts and the Tailwind CDN. No \`fetch()\` to real APIs. Mock data inline.
- \`localStorage\` works inside the iframe — use it for user preferences if relevant.

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
  <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="min-h-full bg-slate-50 text-slate-900 antialiased">
  <!-- semantic content here -->
</body>
</html>
\`\`\`
Use semantic landmarks: \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<aside>\`, \`<footer>\`. Exactly one \`<h1>\` per document.

## Design System
**Palette — pick exactly ONE primary, then neutrals + 1 accent. Total ≤ 5 colors.**
- Primary candidates: \`indigo-600\`, \`blue-600\`, \`emerald-600\`, \`rose-600\`, \`amber-500\`, \`slate-900\`
- Neutrals (always): \`slate-50\` (page bg), \`white\` (card bg), \`slate-200\` (borders), \`slate-500\` (secondary text), \`slate-900\` (primary text)
- **NEVER** use purple/violet unless explicitly asked. **NEVER** mix more than 2 saturated hues.

**Typography (Tailwind):**
- Display: \`text-5xl font-bold tracking-tight\`
- H1: \`text-4xl font-bold tracking-tight\`  · H2: \`text-2xl font-semibold tracking-tight\`  · H3: \`text-lg font-semibold\`
- Body: \`text-base leading-relaxed\`  · Small: \`text-sm text-slate-500\`
- Use \`text-balance\` on headings, \`text-pretty\` on long body.

**Spacing — Tailwind scale ONLY (no \`p-[16px]\`):**
- Section padding: \`py-16 md:py-24\`  · Card padding: \`p-6 md:p-8\`  · Gaps: \`gap-4\` / \`gap-6\` / \`gap-8\`

**Cards:** \`rounded-2xl border border-slate-200 bg-white shadow-sm\`. Hover: \`hover:shadow-md hover:-translate-y-0.5 transition\`.

**Container:** \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`. Mobile-first: design 360px first, then \`sm:\` / \`md:\` / \`lg:\` / \`xl:\`. Touch targets ≥ \`h-11\` (44px).

**Layout priority:** Flexbox first, Grid only for true 2D, never absolute positioning unless overlaying.

## Accessibility (non-negotiable)
- Visible focus ring on every interactive element: \`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2\`
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
- ❌ Truncating "for brevity"`,
  examples: [
    {
      label: "complete interactive widget",
      code: `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily calorie calculator</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>body{font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body class="min-h-full bg-slate-50 text-slate-900 antialiased grid place-items-center p-4">
  <main class="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
    <h1 class="text-2xl font-semibold tracking-tight">Daily calorie calculator</h1>
    <p class="mt-1 text-sm text-slate-500">Estimate your maintenance calories using the Mifflin-St Jeor formula.</p>
    <div class="mt-6 grid grid-cols-2 gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Age</span>
        <input id="age" type="number" value="30" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Sex</span>
        <select id="sex" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <option value="m">Male</option>
          <option value="f">Female</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Weight (kg)</span>
        <input id="weight" type="number" value="70" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Height (cm)</span>
        <input id="height" type="number" value="175" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
      </label>
    </div>
    <label class="mt-4 flex flex-col gap-1.5">
      <span class="text-sm font-medium">Activity level</span>
      <select id="activity" class="h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <option value="1.2">Sedentary</option>
        <option value="1.375" selected>Light (1-3 d/wk)</option>
        <option value="1.55">Moderate (3-5 d/wk)</option>
        <option value="1.725">Very active (6-7 d/wk)</option>
      </select>
    </label>
    <div class="mt-6 rounded-xl bg-indigo-50 p-5 text-center">
      <div class="text-xs font-medium uppercase tracking-wider text-indigo-700">Maintenance</div>
      <div id="result" class="mt-1 text-4xl font-bold text-indigo-900">2,400</div>
      <div class="text-xs text-indigo-700">kcal / day</div>
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
