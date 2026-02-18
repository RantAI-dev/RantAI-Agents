"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  Globe,
  Search,
  ExternalLink,
  BookOpen,
  Database,
  Send,
  FileText,
  Calculator,
  Clock,
  Code,
  Type,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Tool display names for nicer UI
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  knowledge_search: "Searching knowledge base",
  customer_lookup: "Looking up customer",
  channel_dispatch: "Sending message",
  document_analysis: "Analyzing document",
  file_operations: "Processing file",
  web_search: "Searching the web",
  calculator: "Calculating",
  date_time: "Processing date/time",
  json_transform: "Transforming JSON",
  text_utilities: "Processing text",
}

// Tool-specific icons
const TOOL_ICONS: Record<string, typeof Wrench> = {
  web_search: Globe,
  knowledge_search: BookOpen,
  customer_lookup: Database,
  channel_dispatch: Send,
  document_analysis: FileText,
  file_operations: FileText,
  calculator: Calculator,
  date_time: Clock,
  json_transform: Code,
  text_utilities: Type,
}

type ToolState =
  | "input-streaming"
  | "input-available"
  | "execution-started"
  | "done"
  | "error"

interface ToolCallIndicatorProps {
  toolName: string
  state: ToolState
  args?: Record<string, unknown>
  result?: unknown
  errorText?: string
}

// Extract domain from URL
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "")
  } catch {
    return url
  }
}

// Get favicon URL for a domain
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ""
  }
}

interface SearchResult {
  title: string
  url: string
  snippet?: string
}

// ── Web Search specialized indicator ──
function WebSearchIndicator({
  state,
  args,
  result,
  errorText,
}: Omit<ToolCallIndicatorProps, "toolName">) {
  const [expanded, setExpanded] = useState(true)

  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "execution-started"
  const isDone = state === "done"
  const isError = state === "error"

  const query = (args?.query as string) || ""
  const output = result as { success?: boolean; resultCount?: number; results?: SearchResult[] } | undefined
  const results = output?.results || []
  const resultCount = output?.resultCount || results.length

  return (
    <motion.div
      className="my-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header: status + "Search pages:" + query + count */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs w-full text-left transition-colors py-1",
          isError ? "text-destructive" : "text-foreground"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-chart-2" />
          </motion.div>
        )}

        <span className="text-muted-foreground">Search pages:</span>
        {query && (
          <span className="font-semibold text-foreground truncate">
            {query}
          </span>
        )}
        {isDone && resultCount > 0 && (
          <span className="text-muted-foreground shrink-0">({resultCount})</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform ml-auto",
            !expanded && "-rotate-90"
          )}
        />
      </button>

      {/* Expandable: search query bar + results cards */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Search query bar */}
            {query && (
              <div className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border/40 text-xs">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 text-muted-foreground truncate">{query}</span>
                {isDone && resultCount > 0 && (
                  <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                    {resultCount}
                  </span>
                )}
              </div>
            )}

            {/* Error */}
            {isError && errorText && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-destructive/5 border border-destructive/15 text-xs text-destructive">
                {errorText}
              </div>
            )}

            {/* Results as horizontal scrollable cards */}
            {isDone && results.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-thin">
                {results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 group/card flex flex-col gap-1.5 p-2.5 rounded-xl bg-muted/40 border border-border/40 hover:border-border/80 hover:bg-muted/70 transition-all w-[160px]"
                  >
                    <p className="text-[11px] font-medium text-foreground line-clamp-2 leading-snug min-h-[2.75em]">
                      {r.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-auto">
                      <img
                        src={getFaviconUrl(r.url)}
                        alt=""
                        className="h-3 w-3 rounded-sm shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {getDomain(r.url)}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Generic tool indicator ──
function GenericToolIndicator({
  toolName,
  state,
  args,
  result,
  errorText,
}: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "execution-started"
  const isDone = state === "done"
  const isError = state === "error"

  const displayName =
    TOOL_DISPLAY_NAMES[toolName] || toolName.replace(/_/g, " ")
  const ToolIcon = TOOL_ICONS[toolName] || Wrench

  return (
    <motion.div
      className="my-1.5"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs py-1 transition-all w-full text-left",
          isError && "text-destructive"
        )}
      >
        {/* Status icon */}
        {isRunning ? (
          <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-primary/10 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-destructive/10 shrink-0">
            <XCircle className="h-3 w-3 text-destructive" />
          </div>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
            className="flex items-center justify-center h-5 w-5 rounded-lg bg-chart-2/10 shrink-0"
          >
            <CheckCircle className="h-3 w-3 text-chart-2" />
          </motion.div>
        )}

        {/* Tool name */}
        <ToolIcon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 text-muted-foreground">
          {isRunning ? (
            <>
              {displayName}
              <motion.span
                className="inline-block"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                ...
              </motion.span>
            </>
          ) : (
            <span>
              <span className="font-medium text-foreground">{displayName.split(" ")[0]}</span>{" "}
              {displayName.split(" ").slice(1).join(" ")}
            </span>
          )}
        </span>

        {/* Expand toggle */}
        {!isRunning && (args || result || errorText) && (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
              !expanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Expandable details */}
      <AnimatePresence>
        {expanded && !isRunning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 ml-5 pl-3 border-l-2 border-border/50 text-xs space-y-2">
              {args && Object.keys(args).length > 0 && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Input:
                  </span>
                  <pre className="mt-0.5 p-2 rounded-lg bg-muted/50 overflow-x-auto max-h-[120px] text-[11px]">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )}
              {errorText && (
                <div>
                  <span className="font-medium text-destructive">Error:</span>
                  <pre className="mt-0.5 p-2 rounded-lg bg-destructive/5 overflow-x-auto max-h-[120px] text-[11px] text-destructive">
                    {errorText}
                  </pre>
                </div>
              )}
              {result !== undefined && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Output:
                  </span>
                  <pre className="mt-0.5 p-2 rounded-lg bg-muted/50 overflow-x-auto max-h-[120px] text-[11px]">
                    {typeof result === "string"
                      ? result
                      : JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main export: routes to specialized or generic indicator ──
export function ToolCallIndicator(props: ToolCallIndicatorProps) {
  if (props.toolName === "web_search") {
    return <WebSearchIndicator {...props} />
  }
  return <GenericToolIndicator {...props} />
}
