import { type IconComponent } from "@/lib/icons"
import {
  getFileTypeDetails,
  getOriginalExtension,
  checkDuplicateUpload,
  countKBDocuments,
  filterDocumentsForKBFolder,
  type FileTypeDetails,
  type ExistingDocSummary,
} from "./kb-files-helpers"

export {
  getFileTypeDetails,
  getOriginalExtension,
  checkDuplicateUpload,
  countKBDocuments,
  filterDocumentsForKBFolder,
  type FileTypeDetails,
  type ExistingDocSummary,
}

export interface FileTypeInfo {
  Icon: IconComponent
  bgColor: string
  iconColor: string
  accentColor: string
}

export function getFileTypeIcon(
  fileType?: string,
  artifactType?: string | null,
  filename?: string | null,
  s3Key?: string | null,
  mimeType?: string | null
): FileTypeInfo {
  const details = getFileTypeDetails({
    filename,
    s3Key,
    mimeType,
    fileType,
    artifactType,
  })

  return {
    Icon: details.Icon,
    bgColor: details.bgColor,
    iconColor: details.iconColor,
    accentColor: details.accentColor,
  }
}

interface Category {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

export { getCategoryDisplay } from "./kb-files-helpers"

export function getFileExtensionLabel(
  fileType?: string,
  artifactType?: string | null,
  filename?: string | null,
  s3Key?: string | null,
  mimeType?: string | null
): string {
  return getFileTypeDetails({
    filename,
    s3Key,
    mimeType,
    fileType,
    artifactType,
  }).extension
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const CATEGORY_LABELS: Record<string, string> = {
  LIFE_INSURANCE: "Life Insurance",
  HEALTH_INSURANCE: "Health Insurance",
  HOME_INSURANCE: "Home Insurance",
  FAQ: "FAQ",
  POLICY: "Policy",
  GENERAL: "General",
}
