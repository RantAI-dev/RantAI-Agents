"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  X,
  ArrowRight,
  GripVertical,
  MousePointerClick,
  Settings,
  Play,
  Sparkles,
  PanelRight,
} from "lucide-react"

const STORAGE_KEY = "workflow-onboarding-completed"

// ─── Step Definitions ────────────────────────────────────────────────────────

interface TourStep {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** CSS selector to find the target element, null = centered (no spotlight) */
  target: string | null
  /** Where to place tooltip relative to target */
  placement: "center" | "right" | "left" | "bottom" | "top"
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Workflow Builder",
    description:
      "Build AI workflows visually by dragging nodes and connecting them together. Let's take a quick tour of the editor!",
    icon: Sparkles,
    target: null,
    placement: "center",
  },
  {
    title: "Node Palette",
    description:
      "Browse node categories here or use the search bar. Drag a node onto the canvas, or click it to add at the center.",
    icon: GripVertical,
    target: '[data-tour="palette"]',
    placement: "right",
  },
  {
    title: "Build Your Flow",
    description:
      "This is your canvas. Drop nodes here, then connect them by dragging from an output handle (bottom) to an input handle (top) of another node.",
    icon: MousePointerClick,
    target: '[data-tour="canvas"]',
    placement: "center",
  },
  {
    title: "Configure Nodes",
    description:
      "Click any node to edit it here. Use {{ expressions }} to reference other nodes' outputs. The Variables section at the top defines your workflow's inputs and outputs.",
    icon: PanelRight,
    target: '[data-tour="properties"]',
    placement: "left",
  },
  {
    title: "Toolbar",
    description:
      "Manage your canvas with auto-layout, grid and minimap toggles, undo/redo, and import/export — all accessible from here.",
    icon: Settings,
    target: '[data-tour="toolbar"]',
    placement: "bottom",
  },
  {
    title: "Run & Deploy",
    description:
      "Click Run to test your workflow and watch nodes light up in real-time. Deploy to activate the API endpoint. Don't forget to Save (Ctrl+S)!",
    icon: Play,
    target: '[data-tour="toolbar-actions"]',
    placement: "bottom",
  },
]

// ─── Spotlight padding around target ─────────────────────────────────────────

const SPOTLIGHT_PADDING = 8
const TOOLTIP_GAP = 16

// ─── Arrow Component ─────────────────────────────────────────────────────────

function Arrow({ placement }: { placement: string }) {
  const base =
    "absolute w-3 h-3 bg-background border border-border rotate-45"

  switch (placement) {
    case "right":
      return (
        <div
          className={base}
          style={{
            left: -6,
            top: "50%",
            transform: "translateY(-50%) rotate(45deg)",
            borderRight: "none",
            borderTop: "none",
          }}
        />
      )
    case "left":
      return (
        <div
          className={base}
          style={{
            right: -6,
            top: "50%",
            transform: "translateY(-50%) rotate(45deg)",
            borderLeft: "none",
            borderBottom: "none",
          }}
        />
      )
    case "bottom":
      return (
        <div
          className={base}
          style={{
            top: -6,
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            borderBottom: "none",
            borderRight: "none",
          }}
        />
      )
    case "top":
      return (
        <div
          className={base}
          style={{
            bottom: -6,
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            borderTop: "none",
            borderLeft: "none",
          }}
        />
      )
    default:
      return null
  }
}

// ─── Tooltip position calculator ─────────────────────────────────────────────

function getTooltipStyle(
  rect: DOMRect | null,
  placement: string
): React.CSSProperties {
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    }
  }

  const pad = SPOTLIGHT_PADDING
  const gap = TOOLTIP_GAP

  switch (placement) {
    case "right":
      return {
        position: "fixed",
        top: rect.top + rect.height / 2,
        left: rect.right + pad + gap,
        transform: "translateY(-50%)",
      }
    case "left":
      return {
        position: "fixed",
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + pad + gap,
        transform: "translateY(-50%)",
      }
    case "bottom":
      return {
        position: "fixed",
        top: rect.bottom + pad + gap,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      }
    case "top":
      return {
        position: "fixed",
        bottom: window.innerHeight - rect.top + pad + gap,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      }
    default:
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface OnboardingOverlayProps {
  onComplete?: () => void
  forceShow?: boolean
}

export function OnboardingOverlay({
  onComplete,
  forceShow,
}: OnboardingOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number>(0)

  // Show on first visit or when forced
  useEffect(() => {
    if (forceShow) {
      setStep(0)
      setVisible(true)
      return
    }
    try {
      const completed = localStorage.getItem(STORAGE_KEY)
      if (!completed) {
        // Small delay to let layout settle
        const t = setTimeout(() => setVisible(true), 500)
        return () => clearTimeout(t)
      }
    } catch {
      // localStorage not available
    }
  }, [forceShow])

  // Find and track target element
  const updateRect = useCallback(() => {
    const current = STEPS[step]
    if (!current?.target) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(current.target)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [step])

  useEffect(() => {
    if (!visible) return

    // Initial measure
    updateRect()

    // Re-measure on resize/scroll
    const onResize = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateRect)
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
      cancelAnimationFrame(rafRef.current)
    }
  }, [visible, updateRect])

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

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1)
  }, [step])

  const handleSkip = useCallback(() => {
    finish()
  }, [finish])

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const hasTarget = current.target !== null && targetRect !== null
  const pad = SPOTLIGHT_PADDING

  return (
    <div className="fixed inset-0 z-50">
      {/* Click-away backdrop (behind spotlight) */}
      <div
        className="absolute inset-0"
        onClick={handleSkip}
        style={{ cursor: "pointer" }}
      />

      {/* Spotlight cutout */}
      {hasTarget && targetRect && (
        <div
          className="fixed rounded-lg pointer-events-none transition-all duration-300 ease-in-out"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
            zIndex: 51,
          }}
        />
      )}

      {/* Dark overlay for center steps (no spotlight target) */}
      {!hasTarget && (
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
      )}

      {/* Tooltip card */}
      <div
        className="pointer-events-auto"
        style={{
          ...getTooltipStyle(targetRect, current.placement),
          zIndex: 52,
        }}
      >
        <div className="relative bg-background border border-border rounded-xl shadow-2xl w-[340px] p-5 space-y-3">
          {/* Arrow */}
          {hasTarget && <Arrow placement={current.placement} />}

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">{current.title}</h3>
              <span className="text-[11px] text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.description}
          </p>

          {/* Progress bar */}
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSkip}
            >
              Skip
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleBack}
                >
                  Back
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleNext}
              >
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
    </div>
  )
}

/** Reset the onboarding so it shows again on next visit */
export function resetOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
