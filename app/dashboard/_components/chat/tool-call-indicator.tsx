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

export function ToolCallIndicator({
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

  return (
    <motion.div
      className="my-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all w-full",
          "border",
          isRunning &&
            "bg-primary/5 border-primary/20 text-primary",
          isDone &&
            "bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400",
          isError &&
            "bg-destructive/5 border-destructive/20 text-destructive"
        )}
      >
        {/* Status icon */}
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          </motion.div>
        )}

        {/* Tool name */}
        <span className="flex-1 text-left">
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
            <>
              <Wrench className="h-3 w-3 inline mr-1 opacity-60" />
              <span className="font-medium">{toolName.replace(/_/g, " ")}</span>
            </>
          )}
        </span>

        {/* Expand toggle (only when done/error) */}
        {!isRunning && (args || result || errorText) && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          )
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
            <div className="mt-1.5 ml-3 pl-3 border-l-2 border-muted text-xs space-y-2">
              {args && Object.keys(args).length > 0 && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Input:
                  </span>
                  <pre className="mt-0.5 p-2 rounded-md bg-muted/50 overflow-x-auto max-h-[120px] text-[11px]">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )}
              {errorText && (
                <div>
                  <span className="font-medium text-destructive">Error:</span>
                  <pre className="mt-0.5 p-2 rounded-md bg-destructive/5 overflow-x-auto max-h-[120px] text-[11px] text-destructive">
                    {errorText}
                  </pre>
                </div>
              )}
              {result !== undefined && (
                <div>
                  <span className="font-medium text-muted-foreground">
                    Output:
                  </span>
                  <pre className="mt-0.5 p-2 rounded-md bg-muted/50 overflow-x-auto max-h-[120px] text-[11px]">
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
