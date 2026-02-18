"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Download, FileText, Layers, Eye, Code, Brain, HelpCircle } from "lucide-react"
import DocumentIntelligence from "../_components/document-intelligence"
import { getFileTypeIcon, getFileExtensionLabel, CATEGORY_LABELS } from "../_components/file-type-utils"
import { ArtifactRenderer } from "../../_components/chat/artifacts/artifact-renderer"
import type { ArtifactType } from "../../_components/chat/artifacts/types"
import { StreamdownContent } from "../../_components/chat/streamdown-content"

interface DocumentMetadata {
  fileType?: "markdown" | "pdf" | "image"
  fileData?: string
  artifactLanguage?: string
}

interface DocumentGroup {
  id: string
  name: string
  color: string | null
}

interface DocumentDetail {
  id: string
  title: string
  content: string
  categories: string[]
  subcategory: string | null
  groups: DocumentGroup[]
  metadata?: DocumentMetadata
  fileType?: "markdown" | "pdf" | "image"
  artifactType?: string | null
  fileSize?: number
  mimeType?: string
  s3Key?: string
  fileUrl?: string
  chunks: Array<{
    id: string
    content: string
    chunkIndex: number
  }>
  createdAt: string
  updatedAt: string
}

function formatFileSize(bytes?: number) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("preview")

  useEffect(() => {
    const fetchDocument = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/dashboard/knowledge/${id}`)
        if (response.ok) {
          const data = await response.json()
          setDocument(data)
        }
      } catch (error) {
        console.error("Failed to fetch document:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchDocument()
  }, [id])

  const fileType = document?.fileType || document?.metadata?.fileType || "markdown"
  const isPdf = fileType === "pdf"
  const isImage = fileType === "image"
  const hasS3File = !!document?.fileUrl
  const hasBase64 = !!document?.metadata?.fileData

  const getFileExtension = () => {
    if (document?.s3Key) {
      const idx = document.s3Key.lastIndexOf(".")
      if (idx !== -1) return document.s3Key.substring(idx).toLowerCase()
    }
    if (isPdf) return ".pdf"
    if (isImage) return `.${document?.mimeType?.split("/")[1] || "png"}`
    if (document?.mimeType === "text/plain") return ".txt"
    if (document?.mimeType === "text/csv") return ".csv"
    return ".md"
  }

  const handleDownload = () => {
    if (!document) return

    const filename = `${document.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}${getFileExtension()}`

    if ((isPdf || isImage) && hasS3File && document.fileUrl) {
      const a = window.document.createElement("a")
      a.href = document.fileUrl
      a.download = filename
      a.target = "_blank"
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
    } else if ((isPdf || isImage) && hasBase64 && document.metadata?.fileData) {
      const byteCharacters = atob(document.metadata.fileData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const mimeType = document.mimeType || (isPdf ? "application/pdf" : "image/png")
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      const contentType = document.mimeType || "text/markdown"
      const blob = new Blob([document.content], { type: contentType })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const getPdfViewUrl = () => {
    if (document?.fileUrl) {
      return document.fileUrl
    }
    if (document?.metadata?.fileData) {
      return `data:application/pdf;base64,${document.metadata.fileData}`
    }
    return null
  }

  const { Icon: TypeIcon, bgColor, iconColor, accentColor } = getFileTypeIcon(
    document?.fileType || document?.metadata?.fileType,
    document?.artifactType,
  )

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {/* Skeleton top bar */}
        <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-64" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/knowledge")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Back to Knowledge</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Document not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background">
        {/* Accent stripe */}
        <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

        <div className="px-6 pt-2 pb-4 pl-14">
          {/* Top row: back + actions */}
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 -ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/dashboard/knowledge")}
            >
              <ArrowLeft className="h-4 w-4" />
              Knowledge
            </Button>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Title row */}
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl p-2.5 shrink-0 ring-1 ring-inset ring-black/5 dark:ring-white/5 ${bgColor}`}
            >
              <TypeIcon className={`h-6 w-6 ${iconColor}`} />
            </div>
            <div className="space-y-2 min-w-0">
              <h1 className="text-xl font-semibold leading-snug">{document.title}</h1>

              {/* Metadata row */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <span
                  className="font-mono font-semibold text-[10px]"
                  style={{ color: accentColor }}
                >
                  {getFileExtensionLabel(fileType, document?.artifactType)}
                </span>

                {document.categories.length > 0 && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <div className="flex items-center gap-1.5">
                      {document.categories.map((cat) => {
                        const color =
                          cat === "LIFE_INSURANCE" ? "#3b82f6" :
                          cat === "HEALTH_INSURANCE" ? "#22c55e" :
                          cat === "HOME_INSURANCE" ? "#f97316" :
                          cat === "FAQ" ? "#a855f7" :
                          cat === "POLICY" ? "#ef4444" :
                          "#6b7280"
                        return (
                          <Badge
                            key={cat}
                            className="text-[10px] font-medium h-5 px-1.5 border-0"
                            style={{
                              backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                              color,
                            }}
                          >
                            {CATEGORY_LABELS[cat] || cat}
                          </Badge>
                        )
                      })}
                    </div>
                  </>
                )}

                <Separator orientation="vertical" className="h-3" />
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>{document.chunks.length} chunks</span>
                </div>
                {document.fileSize && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{formatFileSize(document.fileSize)}</span>
                  </>
                )}
                {document.subcategory && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{document.subcategory}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content area with tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-6 border-b shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger
              value="preview"
              className="gap-2 bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 -mb-px"
            >
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="source"
              className="gap-2 bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 -mb-px"
            >
              <Code className="h-4 w-4" />
              Source
            </TabsTrigger>
            <TabsTrigger
              value="chunks"
              className="gap-2 bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 -mb-px"
            >
              <Layers className="h-4 w-4" />
              Chunks ({document.chunks.length})
            </TabsTrigger>
            <TabsTrigger
              value="intelligence"
              className="gap-2 bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 -mb-px"
            >
              <Brain className="h-4 w-4" />
              Intelligence
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="flex-1 min-h-0 mt-0 px-6 py-4">
          {document.artifactType ? (
            <div className="h-full border rounded-lg overflow-hidden">
              <ArtifactRenderer
                artifact={{
                  id: document.id,
                  title: document.title,
                  type: document.artifactType as ArtifactType,
                  content: document.content,
                  language: document.metadata?.artifactLanguage,
                  version: 1,
                  previousVersions: [],
                }}
              />
            </div>
          ) : isPdf && (hasS3File || hasBase64) ? (
            <div className="h-full rounded-lg overflow-hidden bg-neutral-900">
              <iframe
                src={getPdfViewUrl() || ""}
                className="w-full h-full"
                title={document.title}
              />
            </div>
          ) : isImage && (hasS3File || hasBase64) ? (
            <div className="h-full rounded-lg overflow-hidden flex items-center justify-center bg-neutral-900">
              <img
                src={document.fileUrl || (document.metadata?.fileData ? `data:${document.mimeType || "image/png"};base64,${document.metadata.fileData}` : "")}
                alt={document.title}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : document.mimeType === "text/plain" ? (
            <ScrollArea className="h-full border rounded-lg bg-muted/20">
              <pre className="p-6 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {document.content}
              </pre>
            </ScrollArea>
          ) : (
            <ScrollArea className="h-full border rounded-lg">
              <StreamdownContent content={document.content} className="p-6" />
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="source" className="flex-1 min-h-0 mt-0 px-6 py-4">
          {isPdf || isImage ? (
            <div className="h-full border rounded-lg p-4 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="mb-2">{isPdf ? "PDF" : "Image"} source is binary data</p>
                <p className="text-sm">Use the Preview tab to view the {isPdf ? "PDF" : "image"}</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full border rounded-lg bg-muted/20">
              <pre className="p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {document.content}
              </pre>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="chunks" className="flex-1 min-h-0 mt-0 px-6 py-4">
          <ScrollArea className="h-full">
            <div className="space-y-3">
              {document.chunks.map((chunk, index) => (
                <div
                  key={chunk.id}
                  className="relative border rounded-lg p-4 pl-5 bg-muted/30 transition-colors hover:bg-muted/40 overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-chart-1/60 rounded-l-lg" />
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono font-medium h-5 px-1.5"
                    >
                      #{index + 1}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {chunk.content.length} chars
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap line-clamp-4">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="intelligence" className="flex-1 min-h-0 mt-0 px-6 py-4">
          <DocumentIntelligence documentId={document.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
