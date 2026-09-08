"use client"

/**
 * Renders an assistant turn as its ordered timeline: reasoning, text and
 * tool parts in the order the model produced them. This replaces the old
 * "every tool pill first, then the whole answer" layout — a tool call now
 * appears exactly where it happened, between the sentences around it.
 */

import { Fragment } from "react"
import type { EmbeddableFigure } from "./citations"
import { MarkdownContent } from "./markdown-content"
import { ReasoningBox } from "./reasoning-box"
import { ToolCallIndicator } from "./tool-call-indicator"
import { ArtifactIndicator } from "./artifacts/artifact-indicator"
import type { Artifact, ArtifactType } from "./artifacts/types"
import { isPersistedArtifactToolCall, getEffectiveToolState } from "./artifact-tool-result"
import type { TimelinePart, ToolPart } from "./message-timeline"

export interface MessageTimelineViewProps {
  timeline: TimelinePart[]
  isStreaming: boolean
  artifacts: Map<string, Artifact>
  openArtifact: (id: string) => void
  digitalEmployeeId?: string
  citations?: {
    messageId: string
    count: number
    figures?: EmbeddableFigure[]
    citedChunkKeys?: Map<number, string>
  }
}

function toolDuration(tool: ToolPart): number | undefined {
  if (typeof tool.startedAt !== "number" || typeof tool.endedAt !== "number") return undefined
  const d = tool.endedAt - tool.startedAt
  return d >= 0 ? d : undefined
}

export function MessageTimelineView({
  timeline,
  isStreaming,
  artifacts,
  openArtifact,
  digitalEmployeeId,
  citations,
}: MessageTimelineViewProps) {
  // The typing cursor belongs to the last text part only.
  let lastTextIndex = -1
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].type === "text") {
      lastTextIndex = i
      break
    }
  }

  return (
    <>
      {timeline.map((part, index) => {
        if (part.type === "reasoning") {
          if (!part.text && !part.streaming) return null
          return (
            <ReasoningBox
              key={`reasoning-${index}`}
              content={part.text}
              isStreaming={Boolean(part.streaming) && isStreaming}
              durationMs={part.durationMs ?? null}
            />
          )
        }

        if (part.type === "text") {
          if (!part.text) return null
          return (
            <MarkdownContent
              key={`text-${index}`}
              content={part.text}
              isStreaming={isStreaming && index === lastTextIndex}
              // `[n]` chips work in every segment. Figures auto-embed into
              // whichever segment receives them, so only the last segment
              // gets the figure list — otherwise each segment would repeat
              // every figure.
              citations={
                citations && index !== lastTextIndex
                  ? { ...citations, figures: undefined }
                  : citations
              }
            />
          )
        }

        const tool = part
        if (isPersistedArtifactToolCall(tool)) {
          const out = tool.output as Record<string, unknown>
          const artifactId = out.id as string
          const existing = artifactId ? artifacts.get(artifactId) : undefined
          return (
            <Fragment key={tool.toolCallId}>
              <ArtifactIndicator
                title={
                  tool.toolName === "update_artifact"
                    ? `Updated: ${(out.title as string) || existing?.title || "Artifact"}`
                    : (out.title as string) || "Artifact"
                }
                type={existing?.type || (out.type as ArtifactType) || "text/html"}
                content={existing?.content || (out.content as string | undefined)}
                onClick={() => {
                  if (artifactId) openArtifact(artifactId)
                }}
              />
            </Fragment>
          )
        }

        // Failed artifact calls (validation rejected, conflict, missing) fall
        // through to the regular indicator; getEffectiveToolState rewrites the
        // state to "error" so the pill renders red instead of green.
        const effective = getEffectiveToolState(tool)
        return (
          <ToolCallIndicator
            key={tool.toolCallId}
            toolName={tool.toolName}
            state={effective.state}
            args={tool.input}
            result={tool.output}
            errorText={effective.errorText}
            employeeId={digitalEmployeeId}
            durationMs={toolDuration(tool)}
          />
        )
      })}
    </>
  )
}
