"use client"

import { Eye } from "@/lib/icons"
import { getModelById } from "@/lib/models"

interface VisionAttachmentHintProps {
  /** The model the active assistant will answer with. */
  modelId?: string | null
  /** Files currently staged in the composer. */
  files: File[]
  className?: string
}

/** Friendly model to point users at for true visual reasoning. */
const VISION_MODEL_NAME = "RantAI Prime"

/**
 * Shown when the user stages an image but the assistant's model can't see
 * images. Attachments still work — the server OCRs the image and auto-describes
 * it into text — but the model never views the pixels, so precise visual
 * reasoning (charts, diagrams, layout) is weaker than with a vision model.
 *
 * We only render when we can POSITIVELY confirm the model lacks vision
 * (getModelById resolves and vision === false). Unknown model ids (e.g. a
 * DB-synced model not in the static/house lists) get no hint, so we never
 * cry wolf on a model that might actually support vision.
 */
export function VisionAttachmentHint({ modelId, files, className }: VisionAttachmentHintProps) {
  const hasImage = files.some((f) => f.type.startsWith("image/"))
  if (!hasImage || !modelId) return null

  const model = getModelById(modelId)
  if (!model || model.capabilities.vision) return null

  return (
    <div
      className={
        "flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300 " +
        (className ?? "")
      }
    >
      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Images are turned into text (OCR + auto-description) before this model
        reads them — it doesn&apos;t view the picture directly. For precise
        visual reasoning on charts, diagrams, or layouts, switch to{" "}
        <strong>{VISION_MODEL_NAME}</strong>.
      </span>
    </div>
  )
}
