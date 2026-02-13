"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { X, ArrowRight, GripVertical, MousePointerClick, Settings, Play } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "workflow-onboarding-completed"

interface OnboardingStep {
  title: string
  description: string
  icon: typeof GripVertical
  target: "palette" | "canvas" | "properties" | "toolbar"
  position: { top?: string; left?: string; right?: string; bottom?: string }
}

const STEPS: OnboardingStep[] = [
  {
    title: "Node Palette",
    description:
      "Drag nodes from here to the canvas, or click to add them at the center. Use the search bar to find specific nodes.",
    icon: GripVertical,
    target: "palette",
    position: { top: "50%", left: "240px" },
  },
  {
    title: "Connect Nodes",
    description:
      "Connect nodes by dragging from the output handle (bottom) to the input handle (top) of another node.",
    icon: MousePointerClick,
    target: "canvas",
    position: { top: "50%", left: "50%" },
  },
  {
    title: "Properties Panel",
    description:
      "Click any node to configure it in the Properties Panel. Use {{ expressions }} to reference other nodes' outputs.",
    icon: Settings,
    target: "properties",
    position: { top: "50%", right: "300px" },
  },
  {
    title: "Run Your Workflow",
    description:
      "Click Run to execute your workflow. Watch nodes light up in real-time as they execute. Use Ctrl+S to save.",
    icon: Play,
    target: "toolbar",
    position: { top: "60px", right: "200px" },
  },
]

interface OnboardingOverlayProps {
  onComplete?: () => void
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY)
      if (!completed) {
        setVisible(true)
      }
    } catch {
      // localStorage not available
    }
  }, [])

  const finish = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, "true")
    } catch {
      // ignore
    }
    onComplete?.()
  }, [onComplete])

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      finish()
    }
  }, [step, finish])

  const handleSkip = useCallback(() => {
    finish()
  }, [finish])

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={handleSkip} />

      {/* Tooltip card */}
      <div
        className="absolute z-50 pointer-events-auto"
        style={{
          ...current.position,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="bg-background border rounded-lg shadow-xl max-w-[320px] p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{current.title}</h3>
                <span className="text-[10px] text-muted-foreground">
                  Step {step + 1} of {STEPS.length}
                </span>
              </div>
            </div>
            <button
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step
                    ? "w-4 bg-primary"
                    : i < step
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted-foreground/20"
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSkip}>
              Skip
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleNext}>
              {step < STEPS.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="h-3 w-3" />
                </>
              ) : (
                "Get Started"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
