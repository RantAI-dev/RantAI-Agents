import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { AutomationTemplate } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The daemon's built-in automation template catalog, ported verbatim from
// apps/daemon/src/automation-templates.ts (BUILT_IN_AUTOMATION_TEMPLATES). These
// are static, brand-agnostic definitions — no filesystem/DB state — so we serve
// them directly to keep the Tasks tab's template catalog populated. The daemon
// additionally merges user-authored templates from a JSON file on disk; there
// is no ported store for those, so only the built-ins are returned.
const BUILT_IN_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "ingest-source-memory-tree",
    title: "Ingest source into memory tree",
    description:
      "Turn uploaded, URL, repo, connector, artifact, or chat content into reviewable memory nodes.",
    purpose: "Keep durable project and user knowledge available to future agent runs.",
    triggerKinds: ["manual", "schedule", "connector"],
    sourceKinds: ["upload", "url", "repo", "connector", "artifact", "chat"],
    stages: [
      { id: "ingest", kind: "ingest", title: "Capture source" },
      { id: "canonicalize", kind: "canonicalize", title: "Canonicalize content" },
      { id: "classify", kind: "classify", title: "Classify memory scope" },
      { id: "propose", kind: "propose", title: "Propose memory nodes" },
    ],
    outputSinks: ["memory"],
    reviewPolicy: "always",
    tokenCompression: "balanced",
    tags: ["memory", "ingestion"],
  },
  {
    id: "extract-design-system",
    title: "Extract design system",
    description:
      "Draft a DESIGN.md from brand docs, screenshots, repos, connectors, websites, or strong artifacts.",
    purpose:
      "Make the design-system tree evolve from real source material and successful outputs.",
    triggerKinds: ["manual", "connector", "project-event"],
    sourceKinds: ["upload", "url", "repo", "connector", "artifact"],
    stages: [
      { id: "ingest", kind: "ingest", title: "Capture design source" },
      { id: "compress", kind: "compress", title: "Compact source context" },
      { id: "agent-run", kind: "agent-run", title: "Draft DESIGN.md" },
      { id: "propose", kind: "propose", title: "Create design-system proposal" },
    ],
    outputSinks: ["design-system", "memory"],
    reviewPolicy: "always",
    tokenCompression: "balanced",
    tags: ["design-system", "self-evolution"],
  },
  {
    id: "crystallize-run-into-skill",
    title: "Crystallize successful run into skill",
    description:
      "Convert a completed run into a draft SKILL.md, examples, and follow-up test prompts.",
    purpose: "Let repeated design work become reusable agent capability.",
    triggerKinds: ["manual", "project-event"],
    sourceKinds: ["artifact", "chat"],
    stages: [
      { id: "classify", kind: "classify", title: "Find reusable workflow" },
      { id: "agent-run", kind: "agent-run", title: "Draft skill files" },
      { id: "propose", kind: "propose", title: "Create skill proposal" },
    ],
    outputSinks: ["skill", "memory"],
    reviewPolicy: "always",
    tokenCompression: "balanced",
    tags: ["skills", "crystallization"],
  },
  {
    id: "connector-digest-design-context",
    title: "Connector digest to design context",
    description:
      "Pull trusted connector updates into memory and artifact-ready design context.",
    purpose:
      "Use scheduled connector activity as input for later design work without manual prompting.",
    triggerKinds: ["schedule", "connector"],
    sourceKinds: ["connector"],
    stages: [
      { id: "ingest", kind: "ingest", title: "Pull connector updates" },
      { id: "redact", kind: "redact", title: "Redact sensitive details" },
      { id: "compress", kind: "compress", title: "Summarize high-volume updates" },
      { id: "propose", kind: "propose", title: "Propose memory updates" },
    ],
    outputSinks: ["memory", "artifact"],
    reviewPolicy: "trusted-source",
    tokenCompression: "aggressive",
    tags: ["connectors", "digest"],
  },
  {
    id: "compress-project-context",
    title: "Compress project context",
    description:
      "Rewrite oversized source packets and memory nodes into compact, traceable context.",
    purpose: "Control token pressure while preserving originals and provenance.",
    triggerKinds: ["manual", "schedule"],
    sourceKinds: ["upload", "url", "repo", "connector", "artifact", "chat"],
    stages: [
      { id: "classify", kind: "classify", title: "Select oversized context" },
      { id: "compress", kind: "compress", title: "Apply compression policy" },
      { id: "propose", kind: "propose", title: "Propose compact nodes" },
    ],
    outputSinks: ["memory"],
    reviewPolicy: "always",
    tokenCompression: "aggressive",
    tags: ["compression", "tokens"],
  },
  {
    id: "promote-artifact-style",
    title: "Promote artifact style",
    description:
      "Extract reusable visual rules from a strong artifact into a design-system variant.",
    purpose: "Turn successful generated design direction into reusable project style.",
    triggerKinds: ["manual", "project-event"],
    sourceKinds: ["artifact"],
    stages: [
      { id: "classify", kind: "classify", title: "Score artifact style" },
      { id: "agent-run", kind: "agent-run", title: "Extract visual rules" },
      { id: "propose", kind: "propose", title: "Create design-system variant proposal" },
    ],
    outputSinks: ["design-system", "memory"],
    reviewPolicy: "always",
    tokenCompression: "balanced",
    tags: ["design-system", "artifacts"],
  },
]

// GET /api/design/automation-templates
// Daemon shape (apps/daemon/src/routes/routine.ts): `{ templates }`.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ templates: BUILT_IN_AUTOMATION_TEMPLATES })
}
