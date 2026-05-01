"use client"

import { Pin, Maximize2 } from "@/lib/icons"

interface Props {
  pinned: boolean
  onTogglePin: () => void
  onViewLarge?: () => void
}

export function OutputPinOverlay({ pinned, onTogglePin, onViewLarge }: Props) {
  return (
    <div className="absolute right-2 top-2 hidden gap-1 group-hover/out:flex">
      <button
        type="button"
        onClick={onTogglePin}
        title={pinned ? "Unpin from chat" : "Pin to chat — AI will see this in the next message"}
        className={`rounded border bg-background/90 px-2 py-1 text-[10px] inline-flex items-center gap-1 ${
          pinned
            ? "border-primary text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        <Pin className="h-3 w-3" /> {pinned ? "Pinned" : "Pin"}
      </button>
      {onViewLarge && (
        <button
          type="button"
          onClick={onViewLarge}
          title="View full size"
          className="rounded border bg-background/90 px-2 py-1 text-[10px] inline-flex items-center gap-1 border-border text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
