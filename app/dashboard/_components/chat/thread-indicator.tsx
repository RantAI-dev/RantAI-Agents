"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CornerDownRight, X } from "lucide-react"

interface ThreadIndicatorProps {
  parentContent: string
  onClear: () => void
  onClick?: () => void
}

export const ThreadIndicator = memo<ThreadIndicatorProps>(
  ({ parentContent, onClear, onClick }) => {
    const truncatedContent =
      parentContent.length > 60
        ? parentContent.slice(0, 60) + "..."
        : parentContent

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border mb-2"
      >
        <CornerDownRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <button
          onClick={onClick}
          className="flex-1 text-left text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
        >
          Replying to: {truncatedContent}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
        </Button>
      </motion.div>
    )
  }
)

ThreadIndicator.displayName = "ThreadIndicator"

// Small reply button for message actions
interface ReplyButtonProps {
  onClick: () => void
}

export const ReplyButton = memo<ReplyButtonProps>(({ onClick }) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      onClick={onClick}
      title="Reply to this message"
    >
      <CornerDownRight className="h-3.5 w-3.5" />
    </Button>
  )
})

ReplyButton.displayName = "ReplyButton"

// Reply indicator shown inside a message bubble
interface MessageReplyIndicatorProps {
  parentContent: string
  onClick: () => void
  isUserMessage?: boolean
}

export const MessageReplyIndicator = memo<MessageReplyIndicatorProps>(
  ({ parentContent, onClick, isUserMessage }) => {
    const truncatedContent =
      parentContent.length > 50
        ? parentContent.slice(0, 50) + "..."
        : parentContent

    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 text-xs mb-2 px-2 py-1 rounded transition-colors w-full text-left ${
          isUserMessage
            ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground/80"
            : "bg-background/50 hover:bg-background/80 text-muted-foreground"
        }`}
      >
        <CornerDownRight className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{truncatedContent}</span>
      </button>
    )
  }
)

MessageReplyIndicator.displayName = "MessageReplyIndicator"
