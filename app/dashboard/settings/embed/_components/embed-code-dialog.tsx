"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Copy, Check, ExternalLink } from "lucide-react"
import type { EmbedApiKeyResponse } from "@/lib/embed/types"

interface EmbedCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  embedKey: EmbedApiKeyResponse
}

export function EmbedCodeDialog({
  open,
  onOpenChange,
  embedKey,
}: EmbedCodeDialogProps) {
  const [copied, setCopied] = useState(false)

  // Get the base URL (works in browser)
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-domain.com"

  const embedCode = `<!-- RantAI Chat Widget -->
<script
  src="${baseUrl}/widget/rantai-widget.js"
  data-api-key="${embedKey.key}"
  async
></script>`

  const copyCode = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-4 overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Embed Code for &ldquo;{embedKey.name}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Add this code to your website&apos;s HTML, just before the closing{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code>{" "}
            tag.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4 py-4">
            {/* Code Block */}
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto font-mono">
                <code>{embedCode}</code>
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={copyCode}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1 text-chart-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {/* Configuration Summary */}
            <div className="space-y-2 rounded-lg border p-4">
              <h4 className="text-sm font-medium">Widget Configuration</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  <strong>Assistant:</strong> {embedKey.assistant?.emoji}{" "}
                  {embedKey.assistant?.name}
                </li>
                <li>
                  <strong>Position:</strong> {embedKey.config.position}
                </li>
                <li>
                  <strong>Primary Color:</strong>{" "}
                  <span
                    className="inline-block w-4 h-4 rounded align-middle"
                    style={{ backgroundColor: embedKey.config.theme.primaryColor }}
                  />{" "}
                  {embedKey.config.theme.primaryColor}
                </li>
                <li>
                  <strong>Welcome Message:</strong> &ldquo;{embedKey.config.welcomeMessage}&rdquo;
                </li>
                {embedKey.allowedDomains.length > 0 && (
                  <li>
                    <strong>Allowed Domains:</strong>{" "}
                    {embedKey.allowedDomains.join(", ")}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`${baseUrl}/widget/demo.html?key=${embedKey.key}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Demo
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
