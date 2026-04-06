"use client"

interface AuroraProps {
  colorOne?: string
  colorTwo?: string
  colorThree?: string
  speed?: number
  blur?: number
  opacity?: number
  className?: string
}

export function Aurora({
  colorOne = "#38BDF8",
  colorTwo = "#0EA5E9",
  colorThree = "#0284C7",
  speed = 8,
  blur = 80,
  opacity = 0.15,
  className = "",
}: AuroraProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      <style>{`
        @keyframes aurora-drift-1 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          25% { transform: translate(10%, -15%) scale(1.1); }
          50% { transform: translate(-5%, 10%) scale(0.95); }
          75% { transform: translate(-10%, -5%) scale(1.05); }
        }
        @keyframes aurora-drift-2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          25% { transform: translate(-15%, 10%) scale(1.05); }
          50% { transform: translate(10%, -10%) scale(1.1); }
          75% { transform: translate(5%, 15%) scale(0.9); }
        }
        @keyframes aurora-drift-3 {
          0%, 100% { transform: translate(0%, 0%) scale(1.05); }
          25% { transform: translate(5%, 10%) scale(0.95); }
          50% { transform: translate(-10%, -5%) scale(1.1); }
          75% { transform: translate(15%, -10%) scale(1); }
        }
      `}</style>
      <div
        className="absolute w-[60%] h-[60%] rounded-full top-[10%] left-[15%]"
        style={{
          background: `radial-gradient(ellipse at center, ${colorOne}, transparent 70%)`,
          opacity,
          filter: `blur(${blur}px)`,
          animation: `aurora-drift-1 ${speed}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute w-[50%] h-[50%] rounded-full top-[20%] right-[10%]"
        style={{
          background: `radial-gradient(ellipse at center, ${colorTwo}, transparent 70%)`,
          opacity,
          filter: `blur(${blur}px)`,
          animation: `aurora-drift-2 ${speed * 1.2}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute w-[55%] h-[45%] rounded-full bottom-[15%] left-[25%]"
        style={{
          background: `radial-gradient(ellipse at center, ${colorThree}, transparent 70%)`,
          opacity,
          filter: `blur(${blur}px)`,
          animation: `aurora-drift-3 ${speed * 0.9}s ease-in-out infinite`,
        }}
      />
    </div>
  )
}
