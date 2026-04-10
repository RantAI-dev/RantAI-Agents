"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, Music, Film, Loader2 } from "lucide-react"

export type Modality = "IMAGE" | "AUDIO" | "VIDEO"

type ModalityMeta = {
  label: string
  icon: typeof Sparkles
  // Pre-resolved Tailwind utility class strings (so JIT detects them).
  accentText: string
  accentBg: string
  accentBgSoft: string
  accentBorder: string
  accentRing: string
  spinnerGradient: string
  heroBarGradient: string
  buttonGradient: string
  promptHint: string
  placeholder: string
  cta: string
}

export const MODALITY_META: Record<Modality, ModalityMeta> = {
  IMAGE: {
    label: "Image",
    icon: Sparkles,
    accentText: "text-indigo-500",
    accentBg: "bg-indigo-500",
    accentBgSoft: "bg-indigo-500/10",
    accentBorder: "border-indigo-500/50",
    accentRing: "ring-indigo-500/30",
    spinnerGradient: "bg-gradient-to-tr from-indigo-500 via-indigo-500/40 to-transparent",
    heroBarGradient: "bg-gradient-to-r from-indigo-500/0 via-indigo-500/60 to-fuchsia-500/0",
    buttonGradient: "bg-gradient-to-br from-indigo-500 to-fuchsia-600 hover:from-indigo-400 hover:to-fuchsia-500",
    promptHint: "Describe your vision",
    placeholder:
      "A mystical forest at dawn, golden light through ancient trees, fireflies in the mist…",
    cta: "Generate",
  },
  AUDIO: {
    label: "Audio",
    icon: Music,
    accentText: "text-emerald-500",
    accentBg: "bg-emerald-500",
    accentBgSoft: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/50",
    accentRing: "ring-emerald-500/30",
    spinnerGradient: "bg-gradient-to-tr from-emerald-500 via-emerald-500/40 to-transparent",
    heroBarGradient: "bg-gradient-to-r from-emerald-500/0 via-emerald-500/60 to-cyan-500/0",
    buttonGradient: "bg-gradient-to-br from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500",
    promptHint: "Describe your sound",
    placeholder:
      "Ethereal ambient soundscape with deep reverb pads, gentle rain, distant thunder…",
    cta: "Compose",
  },
  VIDEO: {
    label: "Video",
    icon: Film,
    accentText: "text-rose-500",
    accentBg: "bg-rose-500",
    accentBgSoft: "bg-rose-500/10",
    accentBorder: "border-rose-500/50",
    accentRing: "ring-rose-500/30",
    spinnerGradient: "bg-gradient-to-tr from-rose-500 via-rose-500/40 to-transparent",
    heroBarGradient: "bg-gradient-to-r from-rose-500/0 via-rose-500/60 to-amber-500/0",
    buttonGradient: "bg-gradient-to-br from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500",
    promptHint: "Describe your scene",
    placeholder:
      "A drone shot rising over a misty mountain valley at sunrise, clouds parting…",
    cta: "Render",
  },
}

export const STYLE_PRESETS: Record<Modality, { id: string; label: string; icon: string }[]> = {
  IMAGE: [
    { id: "cinematic", label: "Cinematic", icon: "🎬" },
    { id: "photoreal", label: "Photo Real", icon: "📷" },
    { id: "anime", label: "Anime", icon: "🌸" },
    { id: "watercolor", label: "Watercolor", icon: "🎨" },
    { id: "3d", label: "3D Render", icon: "🧊" },
    { id: "sketch", label: "Sketch", icon: "✏️" },
    { id: "oil", label: "Oil Paint", icon: "🖼️" },
    { id: "cyberpunk", label: "Cyberpunk", icon: "⚡" },
  ],
  AUDIO: [
    { id: "ambient", label: "Ambient", icon: "🌊" },
    { id: "cinematic", label: "Cinematic", icon: "🎻" },
    { id: "electronic", label: "Electronic", icon: "🎹" },
    { id: "lofi", label: "Lo-Fi", icon: "☕" },
    { id: "orchestral", label: "Orchestral", icon: "🎼" },
    { id: "sfx", label: "Sound FX", icon: "💫" },
    { id: "jazz", label: "Jazz", icon: "🎷" },
    { id: "vocal", label: "Vocal", icon: "🎤" },
  ],
  VIDEO: [
    { id: "cinematic", label: "Cinematic", icon: "🎞️" },
    { id: "anime", label: "Anime", icon: "🌸" },
    { id: "timelapse", label: "Timelapse", icon: "⏱️" },
    { id: "slowmo", label: "Slow Motion", icon: "🐌" },
    { id: "documentary", label: "Documentary", icon: "📹" },
    { id: "vfx", label: "VFX Heavy", icon: "💥" },
    { id: "stopmotion", label: "Stop Motion", icon: "🧸" },
    { id: "glitch", label: "Glitch", icon: "📺" },
  ],
}

export const STYLE_PROMPT_SUFFIX: Record<string, string> = {
  cinematic: "cinematic lighting, dramatic composition",
  photoreal: "photorealistic, sharp focus, ultra detailed",
  anime: "anime style, studio ghibli inspired",
  watercolor: "watercolor painting, soft edges",
  "3d": "3d render, octane, ray-traced",
  sketch: "pencil sketch, hand-drawn",
  oil: "oil painting, thick brush strokes",
  cyberpunk: "cyberpunk, neon lights, futuristic",
  ambient: "ambient soundscape, atmospheric",
  electronic: "electronic, synthesized",
  lofi: "lo-fi, vinyl warmth",
  orchestral: "orchestral arrangement, full ensemble",
  sfx: "sound effect, foley",
  jazz: "smooth jazz, brushed drums",
  vocal: "vocal performance",
  timelapse: "timelapse, fast motion",
  slowmo: "slow motion, 240fps",
  documentary: "documentary style, handheld",
  vfx: "vfx heavy, particle effects",
  stopmotion: "stop motion, claymation",
  glitch: "glitch art, datamosh",
}

// ─── Style chip ─────────────────────────────────────────
export function StyleChip({
  selected,
  icon,
  label,
  onClick,
  meta,
}: {
  selected: boolean
  icon: string
  label: string
  onClick: () => void
  meta: ModalityMeta
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        "hover:border-foreground/30 hover:bg-foreground/5",
        selected
          ? cn(meta.accentBorder, meta.accentBgSoft, "text-foreground shadow-sm")
          : "border-border bg-transparent text-muted-foreground"
      )}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="tracking-tight">{label}</span>
    </button>
  )
}

// ─── Aspect ratio / size box ───────────────────────────
export function AspectBox({
  w,
  h,
  label,
  selected,
  onClick,
}: {
  w: number
  h: number
  label: string
  selected: boolean
  onClick: () => void
}) {
  const scale = 28
  const max = Math.max(w, h)
  const bw = (w * scale) / max
  const bh = (h * scale) / max
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 transition-all",
        selected
          ? "border-foreground/40 bg-foreground/5"
          : "border-border bg-transparent hover:border-foreground/20"
      )}
    >
      <div
        className={cn(
          "rounded-[3px] border-[1.5px] transition-colors",
          selected ? "border-foreground" : "border-muted-foreground/40"
        )}
        style={{ width: bw, height: bh }}
      />
      <span
        className={cn(
          "font-mono text-[10px]",
          selected ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  )
}

// ─── Section label ────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
      {children}
    </p>
  )
}

// ─── Generating overlay ───────────────────────────────
const STEPS: Record<Modality, string[]> = {
  IMAGE: ["Analyzing prompt", "Composing elements", "Rendering details", "Applying style", "Finalizing"],
  VIDEO: ["Parsing scene", "Building keyframes", "Interpolating motion", "Encoding frames", "Rendering output"],
  AUDIO: ["Analyzing prompt", "Synthesizing layers", "Mixing frequencies", "Mastering output", "Encoding audio"],
}

export function GeneratingOverlay({
  modality,
  prompt,
}: {
  modality: Modality
  prompt: string
}) {
  const meta = MODALITY_META[modality]
  const Icon = meta.icon
  const steps = STEPS[modality]
  const [step, setStep] = useState(0)
  const [dots, setDots] = useState("")

  useEffect(() => {
    const d = setInterval(
      () => setDots((p) => (p.length >= 3 ? "" : p + ".")),
      400
    )
    const s = setInterval(
      () => setStep((p) => Math.min(p + 1, steps.length - 1)),
      1100
    )
    return () => {
      clearInterval(d)
      clearInterval(s)
    }
  }, [steps.length])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-background/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="max-w-sm text-center">
        <div className="relative mx-auto mb-5 h-16 w-16">
          <div
            className={cn("absolute inset-0 animate-spin rounded-full", meta.spinnerGradient)}
            style={{ animationDuration: "1.4s" }}
          />
          <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-background">
            <Icon className={cn("h-6 w-6", meta.accentText)} />
          </div>
        </div>
        <p className="text-base font-semibold tracking-tight">
          {modality === "IMAGE"
            ? "Painting your vision"
            : modality === "VIDEO"
              ? "Directing your scene"
              : "Composing your sound"}
          {dots}
        </p>
        {prompt && (
          <p className="mx-auto mt-1.5 max-w-[280px] truncate font-mono text-[10px] text-muted-foreground">
            &ldquo;{prompt.slice(0, 60)}
            {prompt.length > 60 ? "…" : ""}&rdquo;
          </p>
        )}
        <div className="mt-5 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-[3px] w-9 rounded-full transition-colors duration-500",
                i <= step ? meta.accentBg : "bg-border"
              )}
            />
          ))}
        </div>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {steps[step]}
        </p>
      </div>
    </div>
  )
}
