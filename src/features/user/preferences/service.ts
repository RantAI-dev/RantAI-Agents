import { Prisma } from "@prisma/client"
import {
  findAssistantById,
  findUserPreferencesByUserId,
  upsertUserPreferences,
} from "./repository"
import type { UpdateUserPreferencesInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface UserPreferencesResponse {
  userId: string
  defaultAssistantId: string | null
  sidebarConfig: unknown | null
}

/**
 * Returns user preferences and guarantees a stable fallback shape when absent.
 */
export async function getUserPreferences(
  userId: string
): Promise<UserPreferencesResponse> {
  const preferences = await findUserPreferencesByUserId(userId)
  if (!preferences) {
    return {
      userId,
      defaultAssistantId: null,
      sidebarConfig: null,
    }
  }

  return {
    userId: preferences.userId,
    defaultAssistantId: preferences.defaultAssistantId,
    sidebarConfig: preferences.sidebarConfig ?? null,
  }
}

/**
 * Updates only the fields explicitly provided by the client.
 */
export async function updateUserPreferences(
  userId: string,
  input: UpdateUserPreferencesInput
): Promise<UserPreferencesResponse | ServiceError> {
  const sidebarConfigInput =
    input.sidebarConfig as Prisma.InputJsonValue | null | undefined

  const normalizedAssistantId =
    input.defaultAssistantId === null
      ? null
      : typeof input.defaultAssistantId === "string"
        ? input.defaultAssistantId.trim() || null
        : undefined

  if (normalizedAssistantId) {
    const assistant = await findAssistantById(normalizedAssistantId)
    if (!assistant) {
      return { status: 404, error: "Assistant not found" }
    }
  }

  const updateData: Prisma.UserPreferenceUpdateInput = {}
  if ("defaultAssistantId" in input) {
    updateData.defaultAssistantId = normalizedAssistantId ?? null
  }
  if ("sidebarConfig" in input) {
    updateData.sidebarConfig =
      sidebarConfigInput === null ? Prisma.JsonNull : sidebarConfigInput
  }

  const preferences = await upsertUserPreferences({
    userId,
    updateData,
    createData: {
      userId,
      defaultAssistantId: normalizedAssistantId ?? null,
      sidebarConfig:
        sidebarConfigInput === undefined || sidebarConfigInput === null
          ? Prisma.JsonNull
          : sidebarConfigInput,
    },
  })

  return {
    userId: preferences.userId,
    defaultAssistantId: preferences.defaultAssistantId,
    sidebarConfig: preferences.sidebarConfig ?? null,
  }
}
