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
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, "\\$&")
    const el = articleRef.current?.querySelector(`#${escaped}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  return (
    <div className="bg-muted/30 dark:bg-zinc-900 min-h-full p-8 overflow-auto">
      <article
        ref={articleRef}
        onClick={onClick}
        className={[
          "mx-auto max-w-[720px]",
          "bg-white text-neutral-900",
          "px-[60px] py-[72px]",
          "shadow-lg rounded-sm",
          "font-serif text-[15px] leading-[1.7]",
          // theorem block utilities
          "[&_.latex-theorem]:border-l-4",
          "[&_.latex-theorem]:pl-4",
          "[&_.latex-theorem]:py-2",
          "[&_.latex-theorem]:my-4",
          "[&_.latex-theorem-header]:font-semibold",
          "[&_.latex-theorem-header]:mb-1",
          "[&_.latex-theorem-blue]:border-blue-500",
          "[&_.latex-theorem-blue]:bg-blue-50/50",
          "[&_.latex-theorem-blue_.latex-theorem-header]:text-blue-900",
          "[&_.latex-theorem-indigo]:border-indigo-500",
          "[&_.latex-theorem-indigo]:bg-indigo-50/50",
          "[&_.latex-theorem-indigo_.latex-theorem-header]:text-indigo-900",
          "[&_.latex-theorem-teal]:border-teal-500",
          "[&_.latex-theorem-teal]:bg-teal-50/50",
          "[&_.latex-theorem-teal_.latex-theorem-header]:text-teal-900",
          "[&_.latex-theorem-sky]:border-sky-500",
          "[&_.latex-theorem-sky]:bg-sky-50/50",
          "[&_.latex-theorem-sky_.latex-theorem-header]:text-sky-900",
          "[&_.latex-theorem-purple]:border-purple-500",
          "[&_.latex-theorem-purple]:bg-purple-50/50",
          "[&_.latex-theorem-purple_.latex-theorem-header]:text-purple-900",
          "[&_.latex-theorem-amber]:border-amber-500",
          "[&_.latex-theorem-amber]:bg-amber-50/50",
          "[&_.latex-theorem-amber_.latex-theorem-header]:text-amber-900",
          "[&_.latex-theorem-gray]:border-gray-400",
          "[&_.latex-theorem-gray]:bg-gray-50/50",
          "[&_.latex-theorem-gray_.latex-theorem-header]:text-gray-700",
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
          "[&_.latex-equation-number]:text-gray-500",
          "[&_.latex-equation-number]:font-mono",
          // refs
          "[&_.latex-eqref]:text-blue-600",
          "[&_.latex-eqref]:hover:underline",
          "[&_.latex-eqref]:cursor-pointer",
          "[&_.latex-eqref-unknown]:text-red-600",
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
          "[&_.latex-error]:text-red-500",
          "[&_.latex-error]:text-xs",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
