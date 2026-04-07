/**
 * Shared behavioral instructions appended to system prompts.
 * Single source of truth — used by chat/route.ts, widget/chat/route.ts, and chatflow.ts.
 */

import { getDesignSystemContext } from "./design-system"

/** Language consistency — appended to ALL chat prompts */
export const LANGUAGE_INSTRUCTION = `\n\nIMPORTANT: You must ALWAYS reply in the same language as the user's last message. If they speak Indonesian, reply in Indonesian. If they speak English, reply in English. Do not mix languages unless necessary for technical terms.`

/** Correction rule WITH saveMemory tool — for routes that have the saveMemory tool */
export const CORRECTION_INSTRUCTION_WITH_TOOL = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), you MUST call saveMemory with the new value so the stored profile is updated. Do not only acknowledge verbally—always call the tool with the updated fact or preference.`

/** Correction rule WITHOUT tool — for chatflow (no saveMemory tool available) */
export const CORRECTION_INSTRUCTION_SOFT = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), acknowledge the change in your response.`

/** Live chat handoff instruction — appended when assistant.liveChatEnabled */
export const LIVE_CHAT_HANDOFF_INSTRUCTION = `\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.`

/** Canvas mode type labels */
const CANVAS_TYPE_LABELS: Record<string, string> = {
  "text/html": "HTML Page",
  "application/react": "React Component",
  "image/svg+xml": "SVG Graphic",
  "application/mermaid": "Mermaid Diagram",
  "text/markdown": "Document",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX / Math",
  "application/slides": "Slides",
  "application/python": "Python Script",
  "application/3d": "R3F 3D Scene",
}

/** Per-type artifact instructions — injected individually for specific canvas mode */
const ARTIFACT_TYPE_INSTRUCTIONS: Record<string, string> = {
  "text/html": `**text/html — Self-contained Interactive HTML Pages**

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

  "application/react": `**application/react — Self-contained React Components**

You are generating a single React component that will be transpiled by Babel-standalone and rendered into a sandboxed iframe at \`#root\`. Output must be v0/Lovable-quality.

## Runtime Environment
**Libraries are exposed as window globals — do NOT \`import\` from them. Just use them directly.**

| Global | What | Version |
|---|---|---|
| \`React\` + all hooks (\`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`useReducer\`, \`useContext\`, \`useId\`, \`useTransition\`, \`useDeferredValue\`, \`useLayoutEffect\`, \`createContext\`, \`forwardRef\`, \`memo\`, \`Fragment\`, \`Suspense\`, \`lazy\`, \`Children\`, \`cloneElement\`) — pre-destructured into scope | React | 19 |
| \`Recharts\` — \`<LineChart>\`, \`<BarChart>\`, \`<PieChart>\`, \`<AreaChart>\`, \`<ResponsiveContainer>\`, \`<Tooltip>\`, etc. | charts | 2 |
| \`LucideReact\` — \`LucideReact.ArrowRight\`, \`LucideReact.Check\`, ... | icons | 0.454 |
| \`Motion\` — \`Motion.motion.div\`, \`Motion.AnimatePresence\` | framer-motion | 11 |
| **Tailwind CSS v3** — utility classes available globally | styling | CDN |

You CAN write \`import\` lines — the preprocessor strips them — but only from: \`react\`, \`recharts\`, \`lucide-react\`, \`framer-motion\`. Anything else is silently dropped and your component will crash. Cleanest output: skip imports, use globals.

**Sandbox**: \`allow-scripts\` only — no modals, no real form submission, no popups, no real navigation. All forms must use \`onSubmit={(e) => { e.preventDefault(); ... }}\`. No \`window.open\`, no \`location.href = ...\`. **No real network** — mock all data.

## Required Component Shape
\`\`\`jsx
function App() {
  const [value, setValue] = useState(0);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased p-6">
      {/* content */}
    </div>
  );
}

export default App;
\`\`\`
- **MUST** have \`export default\` (function or const). The renderer keys off this.
- **MUST** be a function component. **NEVER** \`class extends React.Component\`.
- **NEVER** \`document.querySelector\` / \`document.getElementById\`. Use \`useRef\`.
- **NEVER** import a CSS file. Tailwind is already loaded.
- Top-level wrapper sets \`min-h-screen\`, background, text color, font, base padding.

## Design System
Same palette / typography / spacing / cards / container as the HTML type:
- ONE primary (\`indigo-600\` / \`blue-600\` / \`emerald-600\` / \`rose-600\` / \`slate-900\`), slate neutrals, ≤ 5 colors. No purple unless asked.
- Display \`text-4xl md:text-5xl font-bold tracking-tight\` · H2 \`text-2xl font-semibold\` · body \`text-base leading-relaxed text-slate-700\` · small \`text-sm text-slate-500\`
- Tailwind scale only. Cards \`p-6\`, sections \`py-12\`/\`py-20\`, gaps \`gap-4\`/\`gap-6\`/\`gap-8\`
- Cards: \`rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition\`
- Buttons: \`h-11 px-5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed\`
- Inputs: \`h-11 rounded-lg border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500\`
- Container: \`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8\`. Mobile-first. Flexbox first.

## State Patterns
- **Forms:** controlled components, validate on submit, inline \`aria-invalid\` errors.
- **Mock fetching:** \`useEffect\` + \`setTimeout\`, show skeleton while loading.
- **Tabs:** \`const [view, setView] = useState('overview')\` with \`role="tablist"\` and \`aria-selected\`.

## Accessibility
- Every \`<button>\` has \`type="button"\` (or \`type="submit"\` inside a form).
- Icon-only buttons: \`<span className="sr-only">Description</span>\`.
- Form labels paired via \`htmlFor\`/\`id\`. Visible focus ring on every interactive element.
- \`aria-live\` for dynamic status. Color contrast ≥ 4.5:1.

## Code Quality — STRICT
- **NEVER truncate.** No \`/* ...rest of component... */\`. Output the COMPLETE component.
- **NEVER use placeholders** like \`Lorem ipsum\` for product copy — write realistic text.
- Mock data should be realistic and named (\`const RECENT_ORDERS = [{ id: 'ORD-1041', customer: 'Sara Chen', total: 248.00 }, ...]\`).
- No dead code, no commented-out alternatives.
- \`useCallback\`/\`useMemo\` only when there is an actual perf reason.
- List keys must be stable IDs, never array indexes (unless the list is truly static).

## Anti-Patterns
- ❌ \`import { Card } from 'shadcn/ui'\` — shadcn is NOT available, build cards with raw Tailwind
- ❌ \`import './styles.css'\` — silently dropped
- ❌ \`class MyComponent extends React.Component\`
- ❌ \`document.getElementById('foo')\`
- ❌ Emoji as functional icons (use \`LucideReact.X\`)
- ❌ Real \`fetch()\` calls
- ❌ \`<form action="/submit">\` — use \`onSubmit\` with \`e.preventDefault()\`
- ❌ More than 5 colors / more than 2 fonts
- ❌ Truncating "for brevity"`,

  "image/svg+xml": `**image/svg+xml — SVG Graphics**
Create clean, well-structured SVG with proper viewBox. Use semantic grouping with <g> elements. Apply consistent stroke widths and color palettes. Optimize paths — avoid unnecessary precision in coordinates. Include descriptive <title> elements for accessibility.`,

  "application/mermaid": `**application/mermaid — Diagrams**
Use Mermaid syntax for flowcharts, sequence diagrams, entity-relationship diagrams, state diagrams, Gantt charts, etc. Keep labels concise. Use proper node shapes ([] for process, {} for decision, () for rounded). Apply meaningful edge labels. Structure diagrams for readability with clear directional flow.`,

  "application/code": `**application/code — Code Files**
Output clean, well-structured code with syntax highlighting support. Include proper imports, type annotations where appropriate, and meaningful variable names. Always set the \`language\` parameter to the correct programming language (e.g. python, javascript, typescript, rust, go). Code must be complete and runnable — no stubs or placeholder functions.`,

  "text/markdown": `**text/markdown — Documents**
Write well-structured Markdown with proper heading hierarchy (h1 > h2 > h3), lists, code blocks with language tags, and emphasis. Use tables for structured comparisons. Include a clear introduction and logical section flow. For long documents, use a table of contents.`,

  "application/sheet": `**application/sheet — Tabular Data**
Output as CSV with a header row. Use consistent column naming (Title Case). Ensure data types are consistent within columns. For numeric data, use consistent decimal precision. Include meaningful column headers that describe the data clearly.`,

  "text/latex": `**text/latex — Mathematical Documents**
Output raw LaTeX. Use standard math environments: \\equation, \\align, \\gather for display math. Use $ for inline math. Define custom commands with \\newcommand for repeated expressions. Structure with \\section, \\subsection. Use \\text{} for words within math mode.`,

  "application/slides": `**application/slides — Presentations**
Output a JSON object: {"theme":{"primaryColor":"#hex","secondaryColor":"#hex","fontFamily":"Inter, sans-serif"},"slides":[...]}.
Each slide object has: layout ("title"|"content"|"two-column"|"section"|"quote"|"closing"), title, subtitle, bullets (string[]), content, leftColumn/rightColumn (string[]), quote, attribution, note.
DESIGN RULES: Theme MUST use dark professional colors (navy #0F172A, charcoal #1E293B, deep slate #0C1222, dark teal #042F2E — NEVER bright/saturated like #4F46E5). secondaryColor is the accent (blue #3B82F6, cyan #06B6D4, emerald #10B981, amber #F59E0B). Title slide MUST have subtitle. Use 7-12 slides. First slide layout "title", last "closing". Use at least 3 different layouts. Max 6 bullets per slide, each bullet one concise insight (max 10 words). No filler text. NEVER use markdown syntax (**, ##, *, backticks, etc.) in slide text — all text must be plain text only, the JSON structure handles formatting.`,

  "application/python": `**application/python — Executable Python Scripts**
Output valid Python code that runs in the browser via Pyodide. Runtime supports numpy, matplotlib, and standard library. Use \`print()\` for text output. For plots, use \`plt.show()\` — it is automatically captured as a PNG image. Structure code with clear sections: imports, data setup, processing, output. Include comments for complex logic.`,

  "application/3d": `**application/3d — Interactive 3D R3F Scenes**
Write ONLY the Scene component — your code runs INSIDE an already-existing <Canvas>. NEVER EVER import or render <Canvas>, <OrbitControls>, or <Environment> — they crash the scene because they already exist in the parent wrapper.
Your component must only return 3D elements like <mesh>, <group>, <points>, Drei helpers, etc.
Example: export default function Scene() { return (<group><mesh><boxGeometry /><meshStandardMaterial color='hotpink' /></mesh></group>) }
Allowed imports: react (all hooks), @react-three/fiber (useFrame, useThree — but NOT Canvas), @react-three/drei (useGLTF, useAnimations, Clone, Float, Sparkles, MeshDistortMaterial, MeshWobbleMaterial, Text, Sphere, RoundedBox, MeshTransmissionMaterial, Stars, Trail, Center, Billboard, Grid, Html, Line, GradientTexture — but NOT OrbitControls, NOT Environment).
PREFER LOADING REAL 3D MODELS: When the user asks for a real-world object (animal, vehicle, furniture, food, character, etc.), ALWAYS use useGLTF() to load a pre-made 3D model instead of building from primitive geometries. Building dogs/cats/cars from boxes and spheres looks terrible — use the model library instead. Only use primitive geometries for abstract/geometric scenes.
Available model CDNs: (1) Supabase (PREFERRED for common objects): https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/{name}/model.gltf — models: dog, cat, bear, horse, fish, car, truck, spaceship, rocket, airplane, chair-wood, armchair, sofa, table, tree-pine, tree-beech, flower, cactus, rock, house, castle, robot, astronaut, sword, guitar, laptop, globe, diamond, crown, apple, banana, pizza, donut. (2) KhronosGroup: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb — models: Fox (animated, scale 0.02), Duck, DamagedHelmet, Avocado, BrainStem, CesiumMan, FlightHelmet, Lantern, ToyCar, Suzanne, BoomBox, WaterBottle. (3) three.js via jsDelivr: https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb — models: Parrot, Flamingo, Stork (animated birds), Soldier, Xbot (animated characters), LittlestTokyo.
Usage: const { scene } = useGLTF(url); return <primitive object={scene} scale={1} />. For animations: const { scene, animations } = useGLTF(url); const { actions } = useAnimations(animations, scene); useEffect(() => { actions['Walk']?.play(); }, [actions]); return <primitive object={scene} />.
CRITICAL RULES: (1) Do NOT import Canvas. (2) Do NOT import OrbitControls or Environment. (3) Do NOT wrap output in <Canvas>. (4) Use useFrame for animations, never requestAnimationFrame. (5) Always export default your scene component. (6) Only use URLs from the CDNs listed above. (7) ALWAYS prefer useGLTF models over primitive geometry for real objects.`,
}

/** Shared design quality instruction for visual artifact types */
const DESIGN_QUALITY_INSTRUCTION = `DESIGN QUALITY: ALL visual artifacts (HTML, React, SVG) must be polished and modern. Use Tailwind CSS where available. Apply: rounded corners (rounded-lg/xl/2xl), subtle shadows (shadow-sm/md/lg), generous spacing (p-6, gap-4/6), muted backgrounds (bg-gray-50/slate-50/white), smooth transitions (transition-all duration-200), hover effects (hover:shadow-md, hover:scale-105), and consistent color palettes. Use gradient backgrounds for hero sections (bg-gradient-to-br). Prefer cards with borders (border border-gray-200 rounded-xl p-6). NEVER output plain, unstyled content.`

/** Build the full artifact types block (for auto/non-canvas modes) */
function buildAllArtifactTypesBlock(): string {
  const entries = Object.entries(ARTIFACT_TYPE_INSTRUCTIONS)
    .map(([, instruction]) => `- ${instruction}`)
    .join("\n")
  return `Choose the right type:\n${entries}\n\n${DESIGN_QUALITY_INSTRUCTION}`
}

/** Tool usage instruction — appended when assistant has tools resolved */
export function buildToolInstruction(toolNames: string[], options?: { targetArtifactId?: string; canvasMode?: boolean | string }): string {
  const { targetArtifactId, canvasMode } = options || {}

  let instruction = `\n\n## Available Tools\nYou have these tools: ${toolNames.join(", ")}.\nIMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.`

  if (toolNames.includes("create_artifact")) {
    if (canvasMode === true || canvasMode === "auto") {
      // Auto mode: inject all type descriptions
      instruction += `\n\n## Canvas Mode (ACTIVE)\nThe user has enabled Canvas mode. You MUST use the create_artifact tool for your response content. Render your output as a live artifact in the preview panel instead of inline text. ${buildAllArtifactTypesBlock()}`
    } else if (typeof canvasMode === "string" && canvasMode in CANVAS_TYPE_LABELS) {
      // Specific type: inject ONLY the relevant type's instructions + design quality
      const label = CANVAS_TYPE_LABELS[canvasMode]
      const typeInstruction = ARTIFACT_TYPE_INSTRUCTIONS[canvasMode] || ""
      const designSystem = getDesignSystemContext(canvasMode)
      const designSystemBlock = designSystem ? `\n\n---\n\n${designSystem}` : ""
      instruction += `\n\n## Canvas Mode (ACTIVE — ${label})\nThe user has enabled Canvas mode with a specific artifact type. You MUST use the create_artifact tool with type="${canvasMode}". The user wants a ${label} artifact. Render your output as a live artifact in the preview panel instead of inline text.\n\n${typeInstruction}${designSystemBlock}\n\n${DESIGN_QUALITY_INSTRUCTION}`
    } else {
      // No canvas mode: inject all type descriptions with optional usage guidance
      instruction += `\n\n## Artifacts\nWhen creating substantial content (more than 15 lines of code, full HTML pages, React components, SVG graphics, diagrams, or long documents), use the create_artifact tool to render it in a live preview panel. Keep short code snippets, brief explanations, and simple answers inline in your response. ${buildAllArtifactTypesBlock()}`
    }

    if (toolNames.includes("update_artifact")) {
      instruction += `\n\nWhen the user asks to modify, fix, or change an existing artifact, use update_artifact with the artifact's ID (from the create_artifact result) instead of creating a new one. Always provide the full updated content, not just the diff.`

      if (targetArtifactId) {
        if (typeof canvasMode === "string" && canvasMode in CANVAS_TYPE_LABELS) {
          // Canvas mode requests a specific type — don't suggest updating the old artifact
          instruction += `\n\nThe user was viewing a different artifact ("${targetArtifactId}"), but they have now requested a new ${CANVAS_TYPE_LABELS[canvasMode]} artifact. Use create_artifact with type="${canvasMode}" to create a NEW artifact. Do NOT update the previous artifact.`
        } else {
          instruction += `\n\nThe user is currently viewing artifact "${targetArtifactId}". When they ask for changes, modifications, or updates to "the artifact", "this", or the current content, use update_artifact with id="${targetArtifactId}".`
        }
      }
    }
  }

  return instruction
}
