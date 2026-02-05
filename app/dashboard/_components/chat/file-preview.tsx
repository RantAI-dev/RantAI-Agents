"use client"

import { memo, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { X, FileText, Image as ImageIcon, File } from "lucide-react"

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

export const FilePreview = memo<FilePreviewProps>(({ file, onRemove }) => {
  const [preview, setPreview] = useState<string | null>(null)
  const isImage = file.type.startsWith("image/")
  const isPdf = file.type === "application/pdf"

  // Generate preview for images
  useEffect(() => {
    if (isImage) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
    return () => setPreview(null)
  }, [file, isImage])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = () => {
    if (isImage) return <ImageIcon className="h-4 w-4 text-chart-3" />
    if (isPdf) return <FileText className="h-4 w-4 text-destructive" />
    return <File className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg border"
    >
      {/* Image preview or icon */}
      {isImage && preview ? (
        <div className="h-12 w-12 rounded overflow-hidden bg-muted flex-shrink-0">
          <img
            src={preview}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
          {getFileIcon()}
        </div>
      )}

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>
      </div>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  )
})

FilePreview.displayName = "FilePreview"
