import { cleanupExpiredAttachments } from "@/lib/chat/cleanup"

export async function cleanupAttachments(maxAgeHours: number) {
  return cleanupExpiredAttachments(maxAgeHours)
}
