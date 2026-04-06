/**
 * Shared behavioral instructions appended to system prompts.
 * Single source of truth — used by chat/route.ts, widget/chat/route.ts, and chatflow.ts.
 */

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
  "text/html": `**text/html — Interactive HTML Pages**
Write complete, self-contained HTML documents. Tailwind CSS is automatically available via CDN — use Tailwind utility classes for ALL styling (do NOT write verbose custom CSS). You can use <script> tags for full interactivity. Google Fonts Inter is pre-loaded.
STYLING: Use modern Tailwind — rounded-lg/xl, shadow-sm/md, proper spacing (p-4/6, gap-4), muted backgrounds (bg-gray-50, bg-slate-50), smooth transitions (transition-all duration-200), hover effects (hover:shadow-md, hover:scale-105), gradient hero sections (bg-gradient-to-br). Prefer cards with borders (border border-gray-200 rounded-xl p-6). Never output plain unstyled HTML.`,

  "application/react": `**application/react — React Components**
Available imports: react (all hooks), recharts (charts/graphs), lucide-react (icons). Tailwind CSS is automatically available — use Tailwind utility classes for ALL styling. Components MUST have \`export default\`. Do NOT import CSS files or external packages beyond react, recharts, lucide-react.
STYLING: Write modern, polished UI with proper spacing, rounded corners (rounded-lg/xl/2xl), shadows (shadow-sm/md/lg), hover effects, and transitions. Use Inter font via font-sans class. Use consistent color palette. Structure with clear component hierarchy.`,

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
      instruction += `\n\n## Canvas Mode (ACTIVE — ${label})\nThe user has enabled Canvas mode with a specific artifact type. You MUST use the create_artifact tool with type="${canvasMode}". The user wants a ${label} artifact. Render your output as a live artifact in the preview panel instead of inline text.\n\n${typeInstruction}\n\n${DESIGN_QUALITY_INSTRUCTION}`
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
