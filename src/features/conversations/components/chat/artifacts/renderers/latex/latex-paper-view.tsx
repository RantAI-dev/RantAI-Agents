"use client"

import { useCallback, useRef } from "react"

interface LatexPaperViewProps {
  html: string
}

export function LatexPaperView({ html }: LatexPaperViewProps) {
  const articleRef = useRef<HTMLElement>(null)

  const onClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-eqref]")
    if (!target) return
    e.preventDefault()
    const href = target.getAttribute("href")
    if (!href || !href.startsWith("#")) return
    const id = href.slice(1)
    const escaped =
      typeof CSS !== "undefined" && CSS.escape
        ? CSS.escape(id)
        : id.replace(/[^\w-]/g, "\\$&")
    const el = articleRef.current?.querySelector(`#${escaped}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  return (
    <div className="flex-1 overflow-auto bg-muted/40 px-4 py-6 sm:px-8 sm:py-10">
      <article
        ref={articleRef}
        onClick={onClick}
        className={[
          "mx-auto max-w-3xl",
          "bg-background",
          "border border-border/60",
          "shadow-sm",
          "rounded-md",
          "px-8 py-10 sm:px-14 sm:py-14",
          "font-serif text-[15px] leading-[1.7]",
          "text-foreground",
          // theorem block utilities
          "[&_.latex-theorem]:border-l-4",
          "[&_.latex-theorem]:pl-4",
          "[&_.latex-theorem]:py-2",
          "[&_.latex-theorem]:my-4",
          "[&_.latex-theorem-header]:font-semibold",
          "[&_.latex-theorem-header]:mb-1",
          "[&_.latex-theorem-blue]:border-blue-500",
          "[&_.latex-theorem-blue]:bg-blue-500/5",
          "[&_.latex-theorem-blue_.latex-theorem-header]:text-blue-700",
          "dark:[&_.latex-theorem-blue_.latex-theorem-header]:text-blue-300",
          "[&_.latex-theorem-indigo]:border-indigo-500",
          "[&_.latex-theorem-indigo]:bg-indigo-500/5",
          "[&_.latex-theorem-indigo_.latex-theorem-header]:text-indigo-700",
          "dark:[&_.latex-theorem-indigo_.latex-theorem-header]:text-indigo-300",
          "[&_.latex-theorem-teal]:border-teal-500",
          "[&_.latex-theorem-teal]:bg-teal-500/5",
          "[&_.latex-theorem-teal_.latex-theorem-header]:text-teal-700",
          "dark:[&_.latex-theorem-teal_.latex-theorem-header]:text-teal-300",
          "[&_.latex-theorem-sky]:border-sky-500",
          "[&_.latex-theorem-sky]:bg-sky-500/5",
          "[&_.latex-theorem-sky_.latex-theorem-header]:text-sky-700",
          "dark:[&_.latex-theorem-sky_.latex-theorem-header]:text-sky-300",
          "[&_.latex-theorem-purple]:border-purple-500",
          "[&_.latex-theorem-purple]:bg-purple-500/5",
          "[&_.latex-theorem-purple_.latex-theorem-header]:text-purple-700",
          "dark:[&_.latex-theorem-purple_.latex-theorem-header]:text-purple-300",
          "[&_.latex-theorem-amber]:border-amber-500",
          "[&_.latex-theorem-amber]:bg-amber-500/5",
          "[&_.latex-theorem-amber_.latex-theorem-header]:text-amber-700",
          "dark:[&_.latex-theorem-amber_.latex-theorem-header]:text-amber-300",
          "[&_.latex-theorem-gray]:border-muted-foreground/40",
          "[&_.latex-theorem-gray]:bg-muted/40",
          "[&_.latex-theorem-gray_.latex-theorem-header]:text-muted-foreground",
          // theorem body subtle de-emphasis
          "[&_.latex-theorem-body]:text-foreground/90",
          // proof QED
          "[&_.latex-qed]:float-right",
          "[&_.latex-qed]:ml-2",
          // equation numbering
          "[&_.latex-equation]:relative",
          "[&_.latex-equation]:my-4",
          "[&_.latex-equation-number]:absolute",
          "[&_.latex-equation-number]:right-0",
          "[&_.latex-equation-number]:top-1/2",
          "[&_.latex-equation-number]:-translate-y-1/2",
          "[&_.latex-equation-number]:text-sm",
          "[&_.latex-equation-number]:text-muted-foreground",
          "[&_.latex-equation-number]:font-mono",
          // refs
          "[&_.latex-eqref]:text-primary",
          "[&_.latex-eqref]:hover:underline",
          "[&_.latex-eqref]:cursor-pointer",
          "[&_.latex-eqref-unknown]:text-destructive",
          "[&_.latex-eqref-unknown]:font-medium",
          // KaTeX scroll
          "[&_.katex-display]:overflow-x-auto",
          "[&_.katex-display]:py-2",
          "[&_.math-block]:my-4",
          // doc title (legacy preamble path)
          "[&_.doc-title]:text-2xl",
          "[&_.doc-title]:font-bold",
          "[&_.doc-title]:mb-2",
          // KaTeX inline error
          "[&_.latex-error]:text-destructive",
          "[&_.latex-error]:text-xs",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
