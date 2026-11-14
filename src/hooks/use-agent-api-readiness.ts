"use client"

import { useEffect, useState } from "react"
import { useOrgFetch } from "@/hooks/use-organization"

/** What the agent API's capability gate refuses (docs/operations/agent-api.md). */
export interface AgentApiReadiness {
  loading: boolean
  /** Empty when the agent can answer over the API. */
  blockers: string[]
}

interface BoundRow {
  name?: string
  enabled?: boolean
  boundEnabled?: boolean
  /** The TypeScript route's name for the binding flag. */
  enabledForAssistant?: boolean
}

interface AgentFlags {
  useKnowledgeBase?: boolean
  knowledgeBaseGroupIds?: string[]
}

/**
 * The bindings that make every agent API call answer 409 `capability_not_ported`
 * (`agents-server/src/routes/chat/mod.rs::check_capabilities`): the knowledge base, MCP, skills
 * and workflows. The create form warns before a key is minted, because the key would work
 * nowhere until the binding is removed.
 */
export function useAgentApiReadiness(
  assistantId: string | null,
  agent: AgentFlags | null,
): AgentApiReadiness {
  const orgFetch = useOrgFetch()
  const [state, setState] = useState<AgentApiReadiness>({ loading: false, blockers: [] })

  useEffect(() => {
    if (!assistantId) {
      setState({ loading: false, blockers: [] })
      return
    }
    let cancelled = false
    setState({ loading: true, blockers: [] })

    const bound = (row: BoundRow, flag: "boundEnabled" | "enabledForAssistant") =>
      (row[flag] ?? true) !== false

    Promise.all(
      ["mcp-servers", "skills", "workflows"].map(async (binding) => {
        const response = await orgFetch(`/api/assistants/${assistantId}/${binding}`)
        if (!response.ok) return { binding, rows: [] as BoundRow[] }
        const body = (await response.json()) as BoundRow[] | { data?: BoundRow[] }
        const rows = Array.isArray(body) ? body : (body.data ?? [])
        return { binding, rows }
      }),
    )
      .then((results) => {
        if (cancelled) return
        const blockers: string[] = []
        if (agent?.useKnowledgeBase || (agent?.knowledgeBaseGroupIds?.length ?? 0) > 0) {
          blockers.push("the knowledge base")
        }
        for (const { binding, rows } of results) {
          if (binding === "mcp-servers" && rows.some((row) => bound(row, "boundEnabled") && row.enabled !== false)) {
            blockers.push("an MCP server")
          }
          if (binding === "skills" && rows.length > 0) {
            blockers.push("a skill")
          }
          if (binding === "workflows" && rows.some((row) => bound(row, "enabledForAssistant"))) {
            blockers.push("a workflow")
          }
        }
        setState({ loading: false, blockers })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, blockers: [] })
      })

    return () => {
      cancelled = true
    }
  }, [agent?.knowledgeBaseGroupIds, agent?.useKnowledgeBase, assistantId, orgFetch])

  return state
}
