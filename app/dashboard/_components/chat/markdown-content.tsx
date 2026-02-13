"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { CodeBlock } from "./code-block"

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "")
    const isInline = !match && !String(children).includes("\n")

    if (isInline) {
      return <code {...props}>{children}</code>
    }

    return (
      <CodeBlock language={match?.[1]}>
        {String(children).replace(/\n$/, "")}
      </CodeBlock>
    )
  },
  a({ children, href, ...props }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 break-words"
        {...props}
      >
        {children}
      </a>
    )
  },
  table({ children, ...props }: any) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border">
        <table {...props}>{children}</table>
      </div>
    )
  },
}

const remarkPlugins = [remarkGfm]

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className ?? "chat-message max-w-none"}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
