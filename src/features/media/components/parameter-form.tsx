"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  modality: "IMAGE" | "AUDIO" | "VIDEO"
  parameters: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function ParameterForm({ modality, parameters, onChange }: Props) {
  const set = (key: string, value: unknown) =>
    onChange({ ...parameters, [key]: value })

  if (modality === "IMAGE") {
    return (
      <div className="space-y-3">
        <div>
          <Label>Size</Label>
          <Select
            value={(parameters.width as number | undefined)?.toString() ?? "1024"}
            onValueChange={(v) => {
              const n = parseInt(v, 10)
              set("width", n)
              set("height", n)
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="512">512 × 512</SelectItem>
              <SelectItem value="1024">1024 × 1024</SelectItem>
              <SelectItem value="2048">2048 × 2048</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Count</Label>
          <Select
            value={(parameters.count as number | undefined)?.toString() ?? "1"}
            onValueChange={(v) => set("count", parseInt(v, 10))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  if (modality === "AUDIO") {
    return (
      <div className="space-y-3">
        <div>
          <Label>Voice</Label>
          <Input
            value={(parameters.voice as string | undefined) ?? ""}
            onChange={(e) => set("voice", e.target.value)}
            placeholder="alloy"
          />
        </div>
        <div>
          <Label>Duration (seconds)</Label>
          <Input
            type="number"
            min={1}
            max={300}
            value={(parameters.durationSec as number | undefined) ?? 10}
            onChange={(e) => set("durationSec", parseInt(e.target.value, 10))}
          />
        </div>
      </div>
    )
  }

  // VIDEO
  return (
    <div className="space-y-3">
      <div>
        <Label>Duration (seconds)</Label>
        <Input
          type="number"
          min={1}
          max={30}
          value={(parameters.durationSec as number | undefined) ?? 5}
          onChange={(e) => set("durationSec", parseInt(e.target.value, 10))}
        />
      </div>
      <div>
        <Label>Aspect ratio</Label>
        <Select
          value={(parameters.aspectRatio as string | undefined) ?? "16:9"}
          onValueChange={(v) => set("aspectRatio", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="16:9">16:9</SelectItem>
            <SelectItem value="9:16">9:16</SelectItem>
            <SelectItem value="1:1">1:1</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
