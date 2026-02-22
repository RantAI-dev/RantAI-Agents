"use client"

import { useState, useEffect, useCallback } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, AlignLeft } from "lucide-react"

interface StructuredPromptEditorProps {
  systemPrompt: string
  onSystemPromptChange: (prompt: string) => void
  defaultStructured?: boolean
}

interface StructuredSections {
  goal: string
  skills: string
  workflow: string
  constraints: string
}

const SECTION_HEADERS = ["## Goal", "## Skills", "## Workflow", "## Constraints"] as const

const SECTION_PLACEHOLDERS: Record<keyof StructuredSections, string> = {
  goal: "Describe the main purpose and objective of this agent...",
  skills: "- List the key capabilities\n- And specialized knowledge areas",
  workflow: "1. Step-by-step process\n2. How the agent should approach tasks\n3. Expected interactions with users",
  constraints: "- Important limitations to follow\n- Guidelines for behavior",
}

function parseStructuredPrompt(prompt: string): StructuredSections | null {
  if (!prompt.includes("## Goal")) return null

  const sections: StructuredSections = { goal: "", skills: "", workflow: "", constraints: "" }
  const keys: (keyof StructuredSections)[] = ["goal", "skills", "workflow", "constraints"]

  for (let i = 0; i < SECTION_HEADERS.length; i++) {
    const header = SECTION_HEADERS[i]
    const nextHeader = SECTION_HEADERS[i + 1]
    const startIdx = prompt.indexOf(header)
    if (startIdx === -1) continue

    const contentStart = startIdx + header.length
    const endIdx = nextHeader ? prompt.indexOf(nextHeader) : prompt.length
    const content = prompt.slice(contentStart, endIdx === -1 ? undefined : endIdx).trim()
    sections[keys[i]] = content
  }

  return sections
}

function buildStructuredPrompt(sections: StructuredSections): string {
  const parts: string[] = []

  if (sections.goal.trim()) {
    parts.push(`## Goal\n${sections.goal.trim()}`)
  }
  if (sections.skills.trim()) {
    parts.push(`## Skills\n${sections.skills.trim()}`)
  }
  if (sections.workflow.trim()) {
    parts.push(`## Workflow\n${sections.workflow.trim()}`)
  }
  if (sections.constraints.trim()) {
    parts.push(`## Constraints\n${sections.constraints.trim()}`)
  }

  return parts.join("\n\n")
}

export function StructuredPromptEditor({
  systemPrompt,
  onSystemPromptChange,
  defaultStructured = true,
}: StructuredPromptEditorProps) {
  // Detect if prompt is already structured
  const isStructured = parseStructuredPrompt(systemPrompt) !== null
  const [mode, setMode] = useState<"structured" | "freeform">(
    isStructured || (defaultStructured && !systemPrompt.trim()) ? "structured" : "freeform"
  )

  const [sections, setSections] = useState<StructuredSections>(() => {
    const parsed = parseStructuredPrompt(systemPrompt)
    return parsed || { goal: "", skills: "", workflow: "", constraints: "" }
  })

  // Sync sections to systemPrompt when in structured mode
  const updateSection = useCallback((key: keyof StructuredSections, value: string) => {
    setSections((prev) => {
      const next = { ...prev, [key]: value }
      onSystemPromptChange(buildStructuredPrompt(next))
      return next
    })
  }, [onSystemPromptChange])

  // When switching to structured mode, try to parse existing prompt
  const handleModeChange = (newMode: string) => {
    if (newMode === "structured") {
      const parsed = parseStructuredPrompt(systemPrompt)
      if (parsed) {
        setSections(parsed)
      } else if (systemPrompt.trim()) {
        // Put existing freeform content into the goal section
        setSections({ goal: systemPrompt.trim(), skills: "", workflow: "", constraints: "" })
        onSystemPromptChange(buildStructuredPrompt({ goal: systemPrompt.trim(), skills: "", workflow: "", constraints: "" }))
      }
      setMode("structured")
    } else {
      setMode("freeform")
    }
  }

  // When external prompt changes and we're in structured mode, re-parse
  useEffect(() => {
    if (mode === "structured") {
      const parsed = parseStructuredPrompt(systemPrompt)
      if (parsed) {
        setSections(parsed)
      }
    }
  }, []) // Only on mount

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Prompt Mode</Label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && handleModeChange(v)}
          className="h-7"
        >
          <ToggleGroupItem value="structured" aria-label="Structured mode" className="text-xs h-7 px-2.5 gap-1">
            <FileText className="h-3 w-3" />
            Structured
          </ToggleGroupItem>
          <ToggleGroupItem value="freeform" aria-label="Freeform mode" className="text-xs h-7 px-2.5 gap-1">
            <AlignLeft className="h-3 w-3" />
            Freeform
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === "structured" ? (
        <div className="space-y-4">
          {(Object.keys(sections) as (keyof StructuredSections)[]).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs font-medium capitalize">{key}</Label>
              <Textarea
                value={sections[key]}
                onChange={(e) => updateSection(key, e.target.value)}
                placeholder={SECTION_PLACEHOLDERS[key]}
                className="min-h-[80px] font-mono text-sm"
              />
            </div>
          ))}
        </div>
      ) : (
        <Textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder="You are a helpful assistant..."
          className="min-h-[300px] font-mono text-sm"
        />
      )}
    </div>
  )
}
