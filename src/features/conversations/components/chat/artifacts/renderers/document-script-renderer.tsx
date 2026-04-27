"use client"
import { useEffect, useState } from "react"
import { Loader2, ChevronLeft, ChevronRight, Code } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface RenderStatus {
  hash: string
  pageCount: number
  cached: boolean
}

interface Props {
  sessionId: string
  artifactId: string
  content: string  // the JS script (shown when user toggles "view code")
  isStreaming: boolean
}

export function DocumentScriptRenderer({ sessionId, artifactId, content, isStreaming }: Props) {
  const [status, setStatus] = useState<RenderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    if (isStreaming) return  // don't render while LLM is still typing
    setStatus(null)
    setError(null)
    let cancelled = false
    fetch(`/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-status`, { method: "GET" })
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          setError(j.error ?? `HTTP ${r.status}`)
          return
        }
        const s = (await r.json()) as RenderStatus
        setStatus(s)
        setPageIdx(0)
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [sessionId, artifactId, content, isStreaming])

  if (isStreaming) {
    return <CodeView content={content} subtle />
  }
  if (showCode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-2 border-b">
          <span className="text-sm text-muted-foreground">Source script</span>
          <Button size="sm" variant="ghost" onClick={() => setShowCode(false)}>Show preview</Button>
        </div>
        <CodeView content={content} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-4 text-sm">
        <div className="text-destructive mb-2">Preview unavailable: {error}</div>
        <Button variant="outline" size="sm" onClick={() => setShowCode(true)}>View source</Button>
      </div>
    )
  }
  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rendering preview…
      </div>
    )
  }
  const pageUrl = `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-pages/${status.hash}/${pageIdx}`
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm text-muted-foreground">Page {pageIdx + 1} of {status.pageCount}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowCode(true)}><Code className="h-4 w-4 mr-1" />Code</Button>
          <Button size="sm" variant="ghost" disabled={pageIdx === 0} onClick={() => setPageIdx((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" disabled={pageIdx >= status.pageCount - 1} onClick={() => setPageIdx((i) => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <img src={pageUrl} alt={`Page ${pageIdx + 1}`} className="w-full" />
      </ScrollArea>
    </div>
  )
}

function CodeView({ content, subtle }: { content: string; subtle?: boolean }) {
  return (
    <pre className={`text-xs p-3 overflow-auto ${subtle ? "opacity-60" : ""}`}>
      <code>{content}</code>
    </pre>
  )
}
