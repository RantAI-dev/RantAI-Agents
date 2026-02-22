"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"

interface AvatarPickerProps {
  emoji: string
  avatarUrl?: string | null
  onEmojiChange: (emoji: string) => void
  onAvatarUpload: (s3Key: string, url: string) => void
  onAvatarRemove: () => void
}

export function AvatarPicker({
  emoji,
  avatarUrl,
  onEmojiChange,
  onAvatarUpload,
  onAvatarRemove,
}: AvatarPickerProps) {
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleEmojiSelect = (emojiData: { native: string }) => {
    onEmojiChange(emojiData.native)
    setOpen(false)
  }

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "avatar")

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) throw new Error("Upload failed")

      const { key, url } = await response.json()
      onAvatarUpload(key, url)
      setOpen(false)
    } catch (error) {
      console.error("Avatar upload failed:", error)
    } finally {
      setIsUploading(false)
    }
  }, [onAvatarUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group relative h-16 w-16 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex items-center justify-center transition-all bg-muted/30 hover:bg-muted/50"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Agent avatar"
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <span className="text-3xl">{emoji}</span>
          )}
          <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Edit</span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[352px] p-0" align="start" side="right">
        <Tabs defaultValue="emoji" className="w-full">
          <TabsList className="w-full rounded-none border-b bg-transparent h-9">
            <TabsTrigger value="emoji" className="flex-1 text-xs">
              Emoji
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1 text-xs">
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emoji" className="mt-0">
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme="dark"
              set="native"
              previewPosition="none"
              skinTonePosition="search"
              perLine={9}
              maxFrequentRows={1}
              navPosition="bottom"
              dynamicWidth={false}
            />
          </TabsContent>

          <TabsContent value="upload" className="mt-0 p-4 space-y-3">
            {avatarUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <img
                      src={avatarUrl}
                      alt="Agent avatar"
                      className="h-24 w-24 rounded-xl object-cover border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                      onClick={() => {
                        onAvatarRemove()
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Click the X to remove and use emoji instead.
                </p>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-muted-foreground/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Drag & drop an image or click to browse
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            <p className="text-[10px] text-muted-foreground text-center">
              PNG, JPEG, or WebP. Max 2MB.
            </p>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
