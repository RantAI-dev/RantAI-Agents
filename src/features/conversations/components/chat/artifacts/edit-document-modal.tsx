"use client"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  artifactId: string
  onSaved: () => void
}

export function EditDocumentModal({ open, onOpenChange, sessionId, artifactId, onSaved }: Props) {
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/edit-document`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ editPrompt: prompt }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setPrompt("")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Describe your edit</DialogTitle>
        </DialogHeader>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Change the deadline to 2026-06-30 and add a budget section"
          rows={4}
          disabled={busy}
        />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !prompt.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
