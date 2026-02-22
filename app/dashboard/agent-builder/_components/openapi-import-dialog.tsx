"use client"

import { useState, useCallback } from "react"
import {
  Loader2,
  FileJson,
  Check,
  ChevronRight,
  AlertCircle,
  Globe,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface PreviewEndpoint {
  operationId: string
  method: string
  path: string
  summary: string
}

interface OpenApiImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

export function OpenApiImportDialog({
  open,
  onOpenChange,
  onImported,
}: OpenApiImportDialogProps) {
  const [step, setStep] = useState<"input" | "preview" | "auth">("input")
  const [specUrl, setSpecUrl] = useState("")
  const [specContent, setSpecContent] = useState("")
  const [specName, setSpecName] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Preview state
  const [previewTitle, setPreviewTitle] = useState("")
  const [previewVersion, setPreviewVersion] = useState("")
  const [previewServerUrl, setPreviewServerUrl] = useState("")
  const [endpoints, setEndpoints] = useState<PreviewEndpoint[]>([])
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set())

  // Auth config
  const [authType, setAuthType] = useState("none")
  const [authToken, setAuthToken] = useState("")
  const [authHeaderName, setAuthHeaderName] = useState("X-API-Key")

  const resetDialog = () => {
    setStep("input")
    setSpecUrl("")
    setSpecContent("")
    setSpecName("")
    setError("")
    setSuccess("")
    setEndpoints([])
    setSelectedOps(new Set())
    setAuthType("none")
    setAuthToken("")
  }

  const handlePreview = useCallback(async () => {
    setIsParsing(true)
    setError("")
    try {
      const res = await fetch("/api/dashboard/openapi-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specContent: specContent || undefined,
          specUrl: specUrl || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Parse failed")

      setPreviewTitle(data.title)
      setPreviewVersion(data.version)
      setPreviewServerUrl(data.serverUrl)
      setEndpoints(data.endpoints || [])
      setSpecName(data.title)
      // Select all by default
      setSelectedOps(new Set(data.endpoints?.map((e: PreviewEndpoint) => e.operationId) || []))
      setStep("preview")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse spec")
    } finally {
      setIsParsing(false)
    }
  }, [specContent, specUrl])

  const handleImport = useCallback(async () => {
    setIsImporting(true)
    setError("")
    try {
      const authConfig =
        authType !== "none"
          ? { type: authType, token: authToken, headerName: authHeaderName }
          : null

      const res = await fetch("/api/dashboard/openapi-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specContent: specContent || undefined,
          specUrl: specUrl || undefined,
          name: specName,
          authConfig,
          selectedOperationIds: Array.from(selectedOps),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed")

      setSuccess(`Imported ${data.toolsCreated} tools from "${specName}"`)
      onImported()
      setTimeout(() => {
        resetDialog()
        onOpenChange(false)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import")
    } finally {
      setIsImporting(false)
    }
  }, [specContent, specUrl, specName, authType, authToken, authHeaderName, selectedOps, onImported, onOpenChange])

  const toggleOp = (opId: string) => {
    setSelectedOps((prev) => {
      const next = new Set(prev)
      if (next.has(opId)) next.delete(opId)
      else next.add(opId)
      return next
    })
  }

  const METHOD_COLORS: Record<string, string> = {
    GET: "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PUT: "bg-amber-100 text-amber-700",
    PATCH: "bg-orange-100 text-orange-700",
    DELETE: "bg-red-100 text-red-700",
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetDialog()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Import from OpenAPI
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <Tabs defaultValue="paste">
              <TabsList>
                <TabsTrigger value="paste">Paste Spec</TabsTrigger>
                <TabsTrigger value="url">From URL</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste your OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML).
                </p>
                <Textarea
                  placeholder='{"openapi": "3.0.0", ...}'
                  value={specContent}
                  onChange={(e) => setSpecContent(e.target.value)}
                  className="min-h-[200px] font-mono text-xs"
                />
              </TabsContent>

              <TabsContent value="url" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter the URL to your OpenAPI spec.
                </p>
                <Input
                  placeholder="https://api.example.com/openapi.json"
                  value={specUrl}
                  onChange={(e) => setSpecUrl(e.target.value)}
                />
              </TabsContent>
            </Tabs>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                onClick={handlePreview}
                disabled={isParsing || (!specContent && !specUrl)}
              >
                {isParsing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1.5" />
                )}
                Parse & Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 overflow-auto flex-1">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{previewTitle}</span>
                <Badge variant="secondary" className="text-[10px]">
                  v{previewVersion}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{previewServerUrl}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={specName}
                onChange={(e) => setSpecName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  Endpoints ({selectedOps.size}/{endpoints.length})
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    if (selectedOps.size === endpoints.length) {
                      setSelectedOps(new Set())
                    } else {
                      setSelectedOps(new Set(endpoints.map((e) => e.operationId)))
                    }
                  }}
                >
                  {selectedOps.size === endpoints.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="space-y-1 max-h-[300px] overflow-auto border rounded-md p-2">
                {endpoints.map((ep) => (
                  <label
                    key={ep.operationId}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={selectedOps.has(ep.operationId)}
                      onCheckedChange={() => toggleOp(ep.operationId)}
                    />
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        METHOD_COLORS[ep.method] || "bg-gray-100"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-mono text-muted-foreground">{ep.path}</span>
                    {ep.summary && (
                      <span className="text-muted-foreground ml-auto truncate max-w-[200px]">
                        {ep.summary}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Auth config */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Authentication</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key</option>
              </select>

              {authType !== "none" && (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder={authType === "bearer" ? "Bearer token" : "API key value"}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                  />
                  {authType === "api_key" && (
                    <Input
                      placeholder="Header name (default: X-API-Key)"
                      value={authHeaderName}
                      onChange={(e) => setAuthHeaderName(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                {success}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedOps.size === 0 || !specName}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <FileJson className="h-4 w-4 mr-1.5" />
                )}
                Import {selectedOps.size} Tools
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
