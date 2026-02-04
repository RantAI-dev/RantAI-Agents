"use client"

import { useRef, useState, useCallback } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Loader2, Camera, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName: string
  onUploadComplete?: (avatarUrl: string) => void
  onAvatarRemoved?: () => void
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "AG"
}

export function AvatarUpload({
  currentAvatarUrl,
  userName,
  onUploadComplete,
  onAvatarRemoved,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const displayUrl = previewUrl || currentAvatarUrl

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Please select a PNG, JPEG, or WebP image"
    }
    if (file.size > MAX_SIZE) {
      return "Image must be smaller than 2MB"
    }
    return null
  }, [])

  const uploadFile = useCallback(
    async (file: File) => {
      const error = validateFile(file)
      if (error) {
        toast.error(error)
        return
      }

      // Show preview immediately
      const objectUrl = URL.createObjectURL(file)
      setPreviewUrl(objectUrl)
      setUploading(true)

      try {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("type", "avatar")

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Upload failed")
        }

        const data = await response.json()
        toast.success("Profile picture updated")
        onUploadComplete?.(data.url)
      } catch (err) {
        console.error("Avatar upload failed:", err)
        toast.error(err instanceof Error ? err.message : "Failed to upload image")
        // Revert preview on error
        setPreviewUrl(null)
      } finally {
        setUploading(false)
        // Clean up object URL
        URL.revokeObjectURL(objectUrl)
      }
    },
    [validateFile, onUploadComplete]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        uploadFile(file)
      }
      // Reset input for re-selection of same file
      e.target.value = ""
    },
    [uploadFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) {
        uploadFile(file)
      }
    },
    [uploadFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleRemoveAvatar = useCallback(async () => {
    // For now, just clear the preview - actual deletion would need an API endpoint
    setPreviewUrl(null)
    onAvatarRemoved?.()
    toast.info("To remove your avatar, contact support")
  }, [onAvatarRemoved])

  return (
    <div className="flex flex-col items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Avatar with overlay */}
      <div
        className={cn(
          "relative group cursor-pointer",
          isDragOver && "ring-2 ring-primary ring-offset-2 rounded-full"
        )}
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
          {displayUrl ? (
            <AvatarImage src={displayUrl} alt={userName} />
          ) : null}
          <AvatarFallback className="text-2xl font-semibold bg-primary/10">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>

        {/* Overlay */}
        <div
          className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center transition-opacity",
            "bg-black/50 opacity-0 group-hover:opacity-100",
            uploading && "opacity-100"
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          ) : (
            <Camera className="h-8 w-8 text-white" />
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {displayUrl ? "Change" : "Upload"}
        </Button>
        {displayUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveAvatar}
            disabled={uploading}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </Button>
        )}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center">
        Click or drag to upload. PNG, JPEG, or WebP. Max 2MB.
      </p>
    </div>
  )
}
