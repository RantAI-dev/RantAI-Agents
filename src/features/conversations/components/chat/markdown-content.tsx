"use client"

import { StreamdownContent } from "./streamdown-content"

interface MarkdownContentProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export function MarkdownContent({ content, isStreaming, className }: MarkdownContentProps) {
  return (
    <StreamdownContent
      content={content}
      isStreaming={isStreaming}
      className={className}
    />
  )
}
