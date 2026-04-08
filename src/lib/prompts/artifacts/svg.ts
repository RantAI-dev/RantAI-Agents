export const svgArtifact = {
  type: "image/svg+xml" as const,
  label: "SVG Graphic",
  summary:
    "Static inline SVG graphics (icons, illustrations, logos, diagrams), sanitized by DOMPurify (no script/style/foreignObject).",
  rules: `**image/svg+xml — SVG Graphics**

You are generating a single, self-contained SVG document that will be rendered **inline** (not in an iframe) inside a sanitized container. The result must look like it was made by a senior visual designer — clean geometry, harmonious colors, scalable, and accessible.

## Runtime Environment
- The SVG is sanitized by **DOMPurify** with the \`svg\` + \`svgFilters\` profiles. Anything not in those profiles is silently stripped.
- **Render container** scales the SVG with \`max-width: 100%; height: auto\`. This means **\`viewBox\` is the only sizing mechanism that works** — hardcoded \`width\`/\`height\` attributes pin a fixed size and break responsive scaling.
- **DO NOT use \`<script>\`** — stripped.
- **DO NOT use \`<foreignObject>\`** — stripped.
- **DO NOT use \`<style>\` blocks** — they technically pass the sanitizer but leak into the host page CSS because rendering is inline, not iframed. Use SVG presentation attributes (\`fill\`, \`stroke\`, \`stroke-width\`, \`opacity\`) instead.
- **DO NOT use external \`href\` / \`xlink:href\`** (no \`http://\`, \`https://\`, \`data:\` URIs). Only same-document \`#fragment\` references are safe (e.g. \`<use href="#icon-arrow">\`).
- **DO NOT use event handlers** (\`onclick\`, \`onload\`, etc.) — stripped.
- For animation, only SMIL (\`<animate>\`, \`<animateTransform>\`) is available. Prefer static SVG unless animation is explicitly requested.

## Required Document Structure
Every SVG MUST start with:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" role="img" aria-labelledby="title-id">
  <title id="title-id">Concise descriptive title</title>
  <!-- optional: <desc id="desc-id">Longer description for complex illustrations</desc> -->
  <!-- content -->
</svg>
\`\`\`
Rules:
- Always include \`xmlns="http://www.w3.org/2000/svg"\`.
- Always include \`viewBox\`. **Never** set \`width=\` or \`height=\` on the root \`<svg>\`.
- Always include \`<title>\` as the first child (unless decorative — see below).
- Use \`role="img"\` and \`aria-labelledby\` pointing to the title (and desc, if present).
- Decorative-only SVGs (background patterns, dividers): use \`aria-hidden="true"\` and skip \`<title>\`.

## Style Categories — pick ONE per artifact

### Icon (default for "icon", "glyph", "symbol")
- \`viewBox="0 0 24 24"\`
- Single color: use \`stroke="currentColor"\` (inherits from parent CSS)
- \`fill="none"\`, \`stroke-width="2"\`, \`stroke-linecap="round"\`, \`stroke-linejoin="round"\`
- ≤ 16 visible units of detail; nothing smaller than 2 px at the source viewBox
- Prefer geometric primitives (\`<rect>\`, \`<circle>\`, \`<line>\`, \`<polyline>\`) over \`<path>\` when possible

### Illustration (default for "illustration", "empty state", "scene")
- \`viewBox="0 0 400 300"\` or similar proportional rectangle
- 3–5 colors from a harmonious palette
- Mostly filled shapes (no strokes unless outlining for emphasis)
- Group logical parts with \`<g id="...">\`
- Include \`<desc>\` describing the scene

### Logo / Badge
- Square \`viewBox="0 0 200 200"\` for emblems, or rectangular \`viewBox="0 0 240 80"\` for wordmarks
- ≤ 3 colors
- Bold filled shapes; use \`<text>\` (not outlined paths) for letterforms unless explicitly asked
- Centered, balanced composition

### Diagram (non-flowchart — flowcharts use Mermaid instead)
- Proportional viewBox sized to content
- 2–4 colors
- Consistent stroke widths for connectors, consistent corner radii for nodes
- Use \`<text>\` for labels with \`text-anchor="middle"\` and \`dominant-baseline="middle"\`

### Decorative pattern
- Use \`<pattern>\` inside \`<defs>\` and reference via \`fill="url(#pattern-id)"\`
- 1–3 colors
- \`aria-hidden="true"\` on the root \`<svg>\`

## Color System
- **Maximum 5 colors per SVG.** Decorative patterns: max 3.
- **Icons** must use \`currentColor\` so the icon inherits text color from the parent.
- For multi-color illustrations, use a harmonious palette. Default suggestions:
  - Primary: \`#4F46E5\` (indigo) or \`#0EA5E9\` (sky)
  - Secondary: \`#10B981\` (emerald) or \`#F59E0B\` (amber)
  - Neutrals: \`#0F172A\` (ink), \`#64748B\` (muted), \`#F1F5F9\` (surface)
- Define gradients in \`<defs>\` with descriptive \`id\`s and reference via \`fill="url(#grad-name)"\`.
- **Never** use neon, high-saturation purple, or more than 5 hues unless explicitly asked.

## Path Quality
- Prefer primitives (\`<rect>\`, \`<circle>\`, \`<ellipse>\`, \`<line>\`, \`<polyline>\`, \`<polygon>\`) over \`<path>\`.
- For \`<path>\`: round all coordinates to **1 decimal place** maximum. Bad: \`M12.456789 34.567890\`. Good: \`M12.5 34.6\`.
- Use relative path commands (\`m\`, \`l\`, \`c\`, \`q\`) for shorter, more readable paths.
- No duplicate consecutive points; no zero-length line segments.
- Use \`<defs>\` + \`<use>\` to reuse repeated symbols rather than duplicating geometry.

## Accessibility (non-negotiable for non-decorative SVGs)
- \`<title>\` is the first child of \`<svg>\`, with text describing the meaning (not the visuals).
- Add \`<desc>\` for illustrations and diagrams that need more context.
- \`role="img"\` on the root \`<svg>\`.
- \`aria-labelledby="title-id desc-id"\` (omit \`desc-id\` if no \`<desc>\`).
- Decorative SVGs: \`aria-hidden="true"\` instead of title/role.

## Code Quality — STRICT
- 2-space indentation.
- **Use SVG presentation attributes** (\`fill\`, \`stroke\`, \`stroke-width\`, \`opacity\`, \`transform\`) — never inline \`style="..."\` and never \`<style>\` blocks.
- No empty \`<g>\` wrappers, no identity transforms (\`transform="translate(0,0)"\`), no zero-effect attributes.
- Meaningful \`id\`s for groups and gradients (\`id="bg-gradient"\`, not \`id="lg1"\`).
- **NEVER truncate.** No \`<!-- ...rest of icon... -->\`. Output the COMPLETE SVG.

## Anti-Patterns
- ❌ Hardcoded \`width="..."\` / \`height="..."\` on root \`<svg>\` (breaks responsive scaling)
- ❌ Missing \`viewBox\` or \`xmlns\`
- ❌ \`<script>\`, \`<foreignObject>\`, or \`<style>\` blocks
- ❌ External \`href\` / \`xlink:href\` to \`http://\`, \`https://\`, \`data:\`
- ❌ Event handler attributes (\`onclick\`, \`onload\`, …)
- ❌ Emoji characters inside \`<text>\`
- ❌ Photorealistic illustrations, geographic maps, dense data viz (wrong format — use Mermaid or HTML+canvas)
- ❌ Outlined text via \`<path>\` instead of \`<text>\` (unless explicitly asked)
- ❌ More than 5 colors
- ❌ Coordinate precision beyond 1 decimal place
- ❌ Truncating "for brevity"`,
  examples: [
    {
      label: "Icon (notification bell)",
      code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="bell-title"
     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title id="bell-title">Notifications</title>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
</svg>`,
    },
    {
      label: "Illustration (empty state, ~400×300, 4 colors, grouped)",
      code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img"
     aria-labelledby="empty-title empty-desc">
  <title id="empty-title">No results found</title>
  <desc id="empty-desc">A magnifying glass over an empty document on a soft background.</desc>
  <defs>
    <linearGradient id="bg-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>
  </defs>
  <g id="background">
    <rect x="0" y="0" width="400" height="300" fill="url(#bg-gradient)" />
  </g>
  <g id="document" transform="translate(140 70)">
    <rect x="0" y="0" width="120" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2" />
    <line x1="20" y1="40" x2="100" y2="40" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
    <line x1="20" y1="60" x2="80" y2="60" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
    <line x1="20" y1="80" x2="90" y2="80" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round" />
  </g>
  <g id="magnifier" transform="translate(220 160)">
    <circle cx="0" cy="0" r="36" fill="none" stroke="#4F46E5" stroke-width="6" />
    <line x1="26" y1="26" x2="56" y2="56" stroke="#4F46E5" stroke-width="6" stroke-linecap="round" />
  </g>
</svg>`,
    },
  ],
}
