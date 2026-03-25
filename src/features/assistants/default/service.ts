import {
  clearSystemDefaultAssistants,
  findAssistantById,
  setAssistantSystemDefault,
  unsetAssistantSystemDefault,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Sets one assistant as system default.
 */
export async function setSystemDefaultAssistant(
  id: string
): Promise<Record<string, unknown> | ServiceError> {
  const assistant = await findAssistantById(id)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  await clearSystemDefaultAssistants()
  return setAssistantSystemDefault(id)
}

/**
 * Removes system default from one assistant.
 */
export async function removeSystemDefaultAssistant(
  id: string
): Promise<Record<string, unknown> | ServiceError> {
  const assistant = await findAssistantById(id)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }

  if (!assistant.isSystemDefault) {
    return { status: 400, error: "This assistant is not the system default" }
  }

  return unsetAssistantSystemDefault(id)
}

