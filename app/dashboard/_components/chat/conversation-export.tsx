"use client"

import { memo } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, FileText, FileJson } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt?: Date
}

interface ConversationExportProps {
  title: string
  messages: Message[]
}

function exportAsMarkdown(title: string, messages: Message[]): string {
  let markdown = `# ${title}\n\n`
  markdown += `*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n`

  for (const msg of messages) {
    const role = msg.role === "user" ? "**You**" : "**Assistant**"
    const timestamp = msg.createdAt
      ? ` _(${new Date(msg.createdAt).toLocaleString()})_`
      : ""
    markdown += `${role}${timestamp}:\n\n${msg.content}\n\n---\n\n`
  }

  return markdown
}

function exportAsJson(title: string, messages: Message[]): string {
  return JSON.stringify(
    {
      title,
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      })),
    },
    null,
    2
  )
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-z0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50)
}

export const ConversationExport = memo<ConversationExportProps>(
  ({ title, messages }) => {
    const handleExportMarkdown = () => {
      const content = exportAsMarkdown(title, messages)
      const filename = `${sanitizeFilename(title)}.md`
      downloadFile(content, filename, "text/markdown")
    }

    const handleExportJson = () => {
      const content = exportAsJson(title, messages)
      const filename = `${sanitizeFilename(title)}.json`
      downloadFile(content, filename, "application/json")
    }

    if (messages.length === 0) return null

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Export conversation"
          >
            <Download className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExportMarkdown}>
            <FileText className="h-4 w-4 mr-2" />
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportJson}>
            <FileJson className="h-4 w-4 mr-2" />
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
)

ConversationExport.displayName = "ConversationExport"
