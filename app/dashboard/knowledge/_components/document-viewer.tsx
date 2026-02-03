"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, FileText, Layers, Loader2, Eye, Code } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface DocumentViewerProps {
  documentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DocumentMetadata {
  fileType?: "markdown" | "pdf" | "image"
  fileData?: string // Base64 for PDFs/images
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
  chunks: Array<{
    id: string
    content: string
    chunkIndex: number
  }>
  createdAt: string
  updatedAt: string
}

const CATEGORY_COLORS: Record<string, string> = {
  LIFE_INSURANCE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HEALTH_INSURANCE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  HOME_INSURANCE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  FAQ: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  POLICY: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  GENERAL: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

const CATEGORY_LABELS: Record<string, string> = {
  LIFE_INSURANCE: "Life Insurance",
  HEALTH_INSURANCE: "Health Insurance",
  HOME_INSURANCE: "Home Insurance",
  FAQ: "FAQ",
  POLICY: "Policy",
  GENERAL: "General",
}

export function DocumentViewer({ documentId, open, onOpenChange }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("preview")

  useEffect(() => {
    if (documentId && open) {
      fetchDocument(documentId)
    }
  }, [documentId, open])

  const fetchDocument = async (id: string) => {
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

  const fileType = document?.metadata?.fileType || "markdown"
  const isPdf = fileType === "pdf"
  const isImage = fileType === "image"

  // Get file extension for download
  const getFileExtension = () => {
    if (isPdf) return ".pdf"
    if (isImage) return ".png" // Default to PNG for images
    return ".md"
  }

  const handleDownload = () => {
    if (!document) return

    if ((isPdf || isImage) && document.metadata?.fileData) {
      // Download PDF/Image from base64
      const byteCharacters = atob(document.metadata.fileData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const mimeType = isPdf ? "application/pdf" : "image/png"
      const blob = new Blob([byteArray], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = `${document.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}${getFileExtension()}`
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      // Download Markdown
      const blob = new Blob([document.content], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = `${document.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const getPdfDataUrl = () => {
    if (!document?.metadata?.fileData) return null
    return `data:application/pdf;base64,${document.metadata.fileData}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : document ? (
          <>
            <DialogHeader className="flex-shrink-0 pr-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <DialogTitle className="text-xl">{document.title}</DialogTitle>
                  <div className="flex items-center gap-3 flex-wrap">
                    {document.categories.map((cat) => (
                      <Badge
                        key={cat}
                        variant="secondary"
                        className={CATEGORY_COLORS[cat] || ""}
                      >
                        {CATEGORY_LABELS[cat] || cat}
                      </Badge>
                    ))}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      <span>{document.chunks.length} chunks</span>
                    </div>
                    {document.subcategory && (
                      <span className="text-xs text-muted-foreground">
                        {document.subcategory}
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download {getFileExtension()}
                </Button>
              </div>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="flex-shrink-0">
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="source" className="gap-2">
                  <Code className="h-4 w-4" />
                  Source
                </TabsTrigger>
                <TabsTrigger value="chunks" className="gap-2">
                  <Layers className="h-4 w-4" />
                  Chunks ({document.chunks.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="flex-1 min-h-0 mt-4">
                {isPdf && document.metadata?.fileData ? (
                  <div className="h-full border rounded-lg overflow-hidden">
                    <iframe
                      src={getPdfDataUrl() || ""}
                      className="w-full h-full"
                      title={document.title}
                    />
                  </div>
                ) : (
                  <ScrollArea className="h-full border rounded-lg p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{document.content}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="source" className="flex-1 min-h-0 mt-4">
                {isPdf ? (
                  <div className="h-full border rounded-lg p-4 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="mb-2">PDF source code is binary data</p>
                      <p className="text-sm">Use the Preview tab to view the PDF</p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-full border rounded-lg">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                      {document.content}
                    </pre>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="chunks" className="flex-1 min-h-0 mt-4">
                <ScrollArea className="h-full">
                  <div className="space-y-3">
                    {document.chunks.map((chunk, index) => (
                      <div
                        key={chunk.id}
                        className="border rounded-lg p-4 bg-muted/30"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            Chunk {index + 1}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {chunk.content.length} characters
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap line-clamp-6">
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Document not found</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
