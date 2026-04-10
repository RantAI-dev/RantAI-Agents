"use client"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { AspectBox, SectionLabel } from "./studio-shared"
import type { MediaModelCapability } from "@/features/media/model-capabilities"

interface Props {
  modality: "IMAGE" | "AUDIO" | "VIDEO"
  parameters: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
  capability?: MediaModelCapability
}

const IMAGE_SIZES: { id: string; w: number; h: number; label: string }[] = [
  { id: "1:1", w: 1024, h: 1024, label: "1:1" },
  { id: "16:9", w: 1280, h: 720, label: "16:9" },
  { id: "9:16", w: 720, h: 1280, label: "9:16" },
  { id: "4:3", w: 1024, h: 768, label: "4:3" },
  { id: "3:2", w: 1080, h: 720, label: "3:2" },
]

const VIDEO_ASPECTS: { id: string; w: number; h: number; label: string }[] = [
  { id: "16:9", w: 16, h: 9, label: "16:9" },
  { id: "9:16", w: 9, h: 16, label: "9:16" },
  { id: "1:1", w: 1, h: 1, label: "1:1" },
  { id: "4:3", w: 4, h: 3, label: "4:3" },
]

const VIDEO_DURATIONS = [4, 8, 15, 30]
const AUDIO_DURATIONS = [5, 15, 30, 60, 120, 300]

function PillRow<T extends string | number>({
  options,
  value,
  format,
  onChange,
}: {
  options: T[]
  value: T
  format?: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md border px-2.5 py-1 font-mono text-[10px] transition-all",
            value === o
              ? "border-foreground/40 bg-foreground/10 text-foreground"
              : "border-border bg-transparent text-muted-foreground hover:border-foreground/20"
          )}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  )
}

function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        <span className="font-mono text-[11px] text-foreground/80">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

export function ParameterForm({ modality, parameters, onChange, capability }: Props) {
  const set = (key: string, value: unknown) =>
    onChange({ ...parameters, [key]: value })
  const setMany = (patch: Record<string, unknown>) =>
    onChange({ ...parameters, ...patch })

  if (modality === "IMAGE") {
    const width = (parameters.width as number) ?? 1024
    const height = (parameters.height as number) ?? 1024
    const currentId =
      IMAGE_SIZES.find((s) => s.w === width && s.h === height)?.id ?? "1:1"
    const count = (parameters.count as number) ?? 1
    const detail = (parameters.detail as number) ?? 80

    return (
      <div className="space-y-5">
        <div>
          <SectionLabel>Aspect ratio</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_SIZES.map((s) => (
              <AspectBox
                key={s.id}
                w={s.w}
                h={s.h}
                label={s.label}
                selected={currentId === s.id}
                onClick={() => setMany({ width: s.w, height: s.h })}
              />
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Count</SectionLabel>
          <PillRow
            options={[1, 2, 3, 4]}
            value={count}
            onChange={(v) => set("count", v)}
          />
        </div>

        <LabeledSlider
          label="Detail Level"
          value={detail}
          onChange={(v) => set("detail", v)}
          min={0}
          max={100}
          suffix="%"
        />
      </div>
    )
  }

  if (modality === "AUDIO") {
    const voice = (parameters.voice as string) ?? ""
    const durationSec = (parameters.durationSec as number) ?? 30
    const bpm = (parameters.bpm as number) ?? 120

    return (
      <div className="space-y-5">
        <div>
          <SectionLabel>Voice</SectionLabel>
          <input
            value={voice}
            onChange={(e) => set("voice", e.target.value)}
            placeholder="alloy"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <SectionLabel>Duration</SectionLabel>
          <PillRow
            options={AUDIO_DURATIONS}
            value={durationSec}
            format={(v) => (v >= 60 ? `${v / 60}m` : `${v}s`)}
            onChange={(v) => set("durationSec", v)}
          />
        </div>

        <LabeledSlider
          label="BPM"
          value={bpm}
          onChange={(v) => set("bpm", v)}
          min={40}
          max={200}
        />
      </div>
    )
  }

  // VIDEO
  const aspectRatio = (parameters.aspectRatio as string) ?? "16:9"
  const durationSec = (parameters.durationSec as number) ?? 8
  const resolution = (parameters.resolution as string) ?? ""
  const fps = (parameters.fps as number) ?? 24
  const motionStrength = (parameters.motionStrength as number) ?? 50
  const generateAudio = (parameters.generateAudio as boolean) ?? false

  // Filter available options by model capability when present.
  const allowedAspects = capability?.supportedAspectRatios
    ? VIDEO_ASPECTS.filter((a) => capability.supportedAspectRatios!.includes(a.id))
    : VIDEO_ASPECTS
  const allowedDurations = capability?.supportedDurationsSec ?? VIDEO_DURATIONS
  const allowedResolutions = capability?.supportedResolutions ?? []

  return (
    <div className="space-y-5">
      {allowedAspects.length > 0 && (
        <div>
          <SectionLabel>Aspect ratio</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {allowedAspects.map((a) => (
              <AspectBox
                key={a.id}
                w={a.w}
                h={a.h}
                label={a.label}
                selected={aspectRatio === a.id}
                onClick={() => set("aspectRatio", a.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Duration</SectionLabel>
        <PillRow
          options={allowedDurations}
          value={durationSec}
          format={(v) => `${v}s`}
          onChange={(v) => set("durationSec", v)}
        />
      </div>

      {allowedResolutions.length > 0 && (
        <div>
          <SectionLabel>Resolution</SectionLabel>
          <PillRow
            options={allowedResolutions}
            value={resolution || allowedResolutions[0]}
            onChange={(v) => set("resolution", v)}
          />
        </div>
      )}

      {capability?.supportsAudio && (
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Co-generate audio
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={generateAudio}
            onClick={() => set("generateAudio", !generateAudio)}
            className={cn(
              "relative h-4 w-7 rounded-full border transition-colors",
              generateAudio
                ? "border-foreground/40 bg-foreground/80"
                : "border-border bg-muted"
            )}
          >
            <span
              className={cn(
                "absolute top-[1px] h-[10px] w-[10px] rounded-full bg-background transition-all",
                generateAudio ? "left-[13px]" : "left-[1px]"
              )}
            />
          </button>
        </label>
      )}

      <LabeledSlider
        label="FPS (hint)"
        value={fps}
        onChange={(v) => set("fps", v)}
        min={12}
        max={60}
      />
      <LabeledSlider
        label="Motion Strength (hint)"
        value={motionStrength}
        onChange={(v) => set("motionStrength", v)}
        min={0}
        max={100}
        suffix="%"
      />
    </div>
  )
}
