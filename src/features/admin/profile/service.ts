import type { UpdateAdminProfileInput } from "./schema"
import {
  downloadAvatarByKey,
  findUserAvatarS3Key,
  findUserProfileById,
  updateUserProfileName,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface AvatarPayload {
  body: Buffer
  contentType: string
}

function inferImageContentType(avatarS3Key: string): string {
  const ext = avatarS3Key.split(".").pop()?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "webp") return "image/webp"
  if (ext === "gif") return "image/gif"
  return "image/png"
}

/**
 * Loads the current user profile and adds avatar proxy URL.
 */
export async function getAdminProfile(
  userId: string
): Promise<Record<string, unknown> | ServiceError> {
  const user = await findUserProfileById(userId)
  if (!user) {
    return { status: 404, error: "Agent not found" }
  }

  return {
    ...user,
    avatarUrl: user.avatarS3Key ? `/api/admin/profile/avatar?t=${Date.now()}` : null,
  }
}

/**
 * Updates mutable profile fields.
 */
export async function updateAdminProfile(
  userId: string,
  input: UpdateAdminProfileInput
): Promise<Record<string, unknown>> {
  return updateUserProfileName(userId, input.name)
}

/**
 * Loads the current user avatar and inferred content type.
 */
export async function getAdminAvatar(
  userId: string
): Promise<AvatarPayload | ServiceError> {
  const avatarS3Key = await findUserAvatarS3Key(userId)
  if (!avatarS3Key) {
    return { status: 404, error: "No avatar" }
  }

  const body = await downloadAvatarByKey(avatarS3Key)
  return {
    body,
    contentType: inferImageContentType(avatarS3Key),
  }
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}
