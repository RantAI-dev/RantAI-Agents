import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/prompt-templates  (SPA fetches /api/prompt-templates → here).
//
// Daemon shape: `{ promptTemplates: PromptTemplateSummary[] }` — the media
// prompt-template catalogue (image/video prompt starters). The SPA reads
// `json.promptTemplates ?? []` (web/providers/registry.ts::fetchPromptTemplates)
// and renders the empty state when absent. No prompt-template catalogue is
// ported in the cloud yet, so we return an empty list.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ promptTemplates: [] })
}
