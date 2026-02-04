"use client"

import { useRef, memo } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

const SUPPORTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/markdown",
  "text/plain",
]

const SUPPORTED_EXTENSIONS = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.md,.txt"

export const FileUploadButton = memo<FileUploadButtonProps>(
  ({ onFileSelect, disabled }) => {
    const inputRef = useRef<HTMLInputElement>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        // Check if file type is supported
        const isSupported =
          SUPPORTED_TYPES.includes(file.type) ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".txt")

        if (isSupported) {
          onFileSelect(file)
        } else {
          console.warn("Unsupported file type:", file.type)
        }
      }
      // Reset input for re-selection of same file
      e.target.value = ""
    }

    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept={SUPPORTED_EXTENSIONS}
          onChange={handleChange}
          className="hidden"
          aria-hidden="true"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Attach file (images, PDF, text)</p>
          </TooltipContent>
        </Tooltip>
      </>
    )
  }
)

FileUploadButton.displayName = "FileUploadButton"
