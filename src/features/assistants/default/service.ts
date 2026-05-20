import {
  clearSystemDefaultAssistants,
  findAssistantAccessById,
  findAssistantById,
  setAssistantSystemDefault,
  unsetAssistantSystemDefault,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Loads an assistant for the system-default mutation guard and verifies it
 * belongs to the caller's org. Built-in assistants are always accessible.
 *
 * Returns 404 (not 403) on cross-org access to avoid leaking existence.
 */
export async function loadAssistantForDefaultMutation(params: {
  assistantId: string
  organizationId: string
}): Promise<{ id: string } | ServiceError> {
  const assistant = await findAssistantAccessById(params.assistantId)
  if (!assistant) {
    return { status: 404, error: "Assistant not found" }
  }
  if (
    !assistant.isBuiltIn &&
    assistant.organizationId &&
    assistant.organizationId !== params.organizationId
  ) {
    return { status: 404, error: "Assistant not found" }
  }
  return { id: assistant.id }
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

