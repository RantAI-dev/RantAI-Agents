"use client"

import { useState } from "react"
import { Plus, X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { WizardChip } from "./wizard-chip"
import { WizardSimpleView } from "./wizard-simple-view"
import type { WizardDraft, Uncertainty } from "../schema"

interface CatalogEntry {
  id: string
  name: string
  description?: string
}

interface Props {
  draft: WizardDraft
  uncertainty: Uncertainty
  catalogs: {
    models: CatalogEntry[]
    tools: CatalogEntry[]
    skills: CatalogEntry[]
    mcp: CatalogEntry[]
    kbs: CatalogEntry[]
  }
  onUserEdit: <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) => void
}

const CAPABILITY_GROUPS = [
  { key: "selectedToolIds", title: "Tools", catalogKey: "tools", uPrefix: "tool" },
  { key: "selectedSkillIds", title: "Skills", catalogKey: "skills", uPrefix: "skill" },
  { key: "selectedMcpServerIds", title: "MCP servers", catalogKey: "mcp", uPrefix: "mcp" },
  { key: "knowledgeBaseGroupIds", title: "Knowledge bases", catalogKey: "kbs", uPrefix: "kb" },
] as const

function entryName(id: string, catalog: CatalogEntry[]): string {
  return catalog.find((e) => e.id === id)?.name ?? id
}

export function WizardAdvancedView({
  draft,
  uncertainty,
  catalogs,
  onUserEdit,
}: Props) {
  const openingQuestions = draft.openingQuestions ?? []

  const updateOpeningQuestion = (idx: number, value: string) => {
    const next = [...openingQuestions]
    next[idx] = value
    onUserEdit("openingQuestions", next)
  }
  const addOpeningQuestion = () => {
    if (openingQuestions.length >= 6) return
    onUserEdit("openingQuestions", [...openingQuestions, ""])
  }
  const removeOpeningQuestion = (idx: number) => {
    onUserEdit(
      "openingQuestions",
      openingQuestions.filter((_, i) => i !== idx)
    )
  }

  return (
    <div className="space-y-8">
      <WizardSimpleView
        draft={draft}
        uncertainty={uncertainty}
        catalogs={catalogs}
        onUserEdit={onUserEdit}
      />

      <Divider label="Capabilities" />

      <div className="space-y-5">
        {CAPABILITY_GROUPS.map((g) => {
          const ids = (draft[g.key] ?? []) as string[]
          const catalog = catalogs[g.catalogKey] as CatalogEntry[]
          const available = catalog.filter((c) => !ids.includes(c.id))
          return (
            <div key={g.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{g.title}</label>
                <CapabilityPicker
                  available={available}
                  onPick={(id) =>
                    onUserEdit(g.key, [...ids, id] as WizardDraft[typeof g.key])
                  }
                />
              </div>
              {ids.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">None.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ids.map((id) => (
                    <WizardChip
                      key={id}
                      label={entryName(id, catalog)}
                      suggested={uncertainty[`${g.uPrefix}:${id}`] === "ai-suggested"}
                      onRemove={() =>
                        onUserEdit(
                          g.key,
                          ids.filter((x) => x !== id) as WizardDraft[typeof g.key]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Divider label="Conversation" />

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Opening message</label>
          <p className="text-xs text-muted-foreground">
            What the agent says first.
          </p>
          <Textarea
            value={draft.openingMessage ?? ""}
            onChange={(e) => onUserEdit("openingMessage", e.target.value)}
            rows={2}
            placeholder="Hi! How can I help?"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Suggested questions</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addOpeningQuestion}
              disabled={openingQuestions.length >= 6}
              className="h-7"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
          {openingQuestions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No suggested questions.
            </p>
          ) : (
            <div className="space-y-1.5">
              {openingQuestions.map((q, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Input
                    value={q}
                    onChange={(e) => updateOpeningQuestion(idx, e.target.value)}
                    placeholder="e.g. How do refunds work?"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOpeningQuestion(idx)}
                    className="h-8 w-8 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Live human handoff</p>
            <p className="text-xs text-muted-foreground">
              Allow agents to escalate to a human operator.
            </p>
          </div>
          <Switch
            checked={Boolean(draft.liveChatEnabled)}
            onCheckedChange={(v) => onUserEdit("liveChatEnabled", v)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Use knowledge base</p>
            <p className="text-xs text-muted-foreground">
              Retrieve from selected KB groups during chat.
            </p>
          </div>
          <Switch
            checked={Boolean(draft.useKnowledgeBase)}
            onCheckedChange={(v) => onUserEdit("useKnowledgeBase", v)}
          />
        </div>
      </div>
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function CapabilityPicker({
  available,
  onPick,
}: {
  available: CatalogEntry[]
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const filtered = query
    ? available.filter((a) =>
        a.name.toLowerCase().includes(query.toLowerCase())
      )
    : available
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={available.length === 0}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="h-8 mb-2"
        />
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nothing matches.
            </p>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onPick(a.id)
                  setOpen(false)
                  setQuery("")
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <div className="font-medium">{a.name}</div>
                {a.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {a.description}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
