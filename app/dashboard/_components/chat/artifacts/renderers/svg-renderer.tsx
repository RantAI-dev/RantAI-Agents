"use client"

import { useMemo } from "react"
import DOMPurify from "dompurify"

interface SvgRendererProps {
  content: string
}

export function SvgRenderer({ content }: SvgRendererProps) {
  const sanitizedSvg = useMemo(() => {
    return DOMPurify.sanitize(content, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["use"],
    })
  }, [content])

  return (
    <div
      className="flex items-center justify-center p-4 min-h-[100px] [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  )
}
