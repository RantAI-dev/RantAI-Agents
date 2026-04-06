"use client"

import type { CSSProperties, ReactNode } from "react"

interface ShinyTextProps {
  children: ReactNode
  className?: string
  shimmerWidth?: number
  speed?: number
}

export function ShinyText({
  children,
  className = "",
  shimmerWidth = 100,
  speed = 3,
}: ShinyTextProps) {
  return (
    <span
      className={`inline-block bg-clip-text ${className}`}
      style={
        {
          backgroundSize: `${shimmerWidth}px 100%`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 0",
          backgroundImage:
            "linear-gradient(120deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 60%)",
          animation: `shiny-text-slide ${speed}s linear infinite`,
          WebkitBackgroundClip: "text",
        } as CSSProperties
      }
    >
      <style>{`
        @keyframes shiny-text-slide {
          0% { background-position: -${shimmerWidth}px 0; }
          100% { background-position: calc(100% + ${shimmerWidth}px) 0; }
        }
      `}</style>
      {children}
    </span>
  )
}
