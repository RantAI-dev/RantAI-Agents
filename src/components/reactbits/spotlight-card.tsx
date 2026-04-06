"use client"

import { useRef, useState, type ReactNode, type CSSProperties } from "react"

interface SpotlightCardProps {
  children: ReactNode
  className?: string
  spotlightColor?: string
  spotlightSize?: number
  style?: CSSProperties
  onClick?: () => void
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(255,255,255,0.08)",
  spotlightSize = 300,
  style,
  onClick,
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={style}
    >
      {/* Spotlight overlay */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(${spotlightSize}px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
