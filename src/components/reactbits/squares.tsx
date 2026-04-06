"use client"

import { useEffect, useRef } from "react"

interface SquaresProps {
  className?: string
  speed?: number
  squareSize?: number
  borderColor?: string
  hoverFillColor?: string
  direction?:
    | "right"
    | "left"
    | "up"
    | "down"
    | "diagonal"
}

export function Squares({
  className = "",
  speed = 0.5,
  squareSize = 40,
  borderColor = "rgba(255,255,255,0.06)",
  hoverFillColor = "rgba(255,255,255,0.03)",
  direction = "diagonal",
}: SquaresProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let offsetX = 0
    let offsetY = 0

    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio
      canvas.height = canvas.clientHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const cols = Math.ceil(w / squareSize) + 2
      const rows = Math.ceil(h / squareSize) + 2

      const startX = (offsetX % squareSize) - squareSize
      const startY = (offsetY % squareSize) - squareSize

      ctx.strokeStyle = borderColor
      ctx.lineWidth = 0.5

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * squareSize
          const y = startY + r * squareSize

          // Subtle random fill for some squares
          if ((c + r + Math.floor(offsetX / squareSize)) % 17 === 0) {
            ctx.fillStyle = hoverFillColor
            ctx.fillRect(x, y, squareSize, squareSize)
          }

          ctx.strokeRect(x, y, squareSize, squareSize)
        }
      }

      // Update offset based on direction
      switch (direction) {
        case "right":
          offsetX += speed
          break
        case "left":
          offsetX -= speed
          break
        case "up":
          offsetY -= speed
          break
        case "down":
          offsetY += speed
          break
        case "diagonal":
          offsetX += speed * 0.7
          offsetY += speed * 0.7
          break
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [speed, squareSize, borderColor, hoverFillColor, direction])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
    />
  )
}
