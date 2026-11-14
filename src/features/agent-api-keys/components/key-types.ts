/**
 * The agent API key as both backends answer it (`routes/agent_api/keys.rs::KeyJson`).
 *
 * `key` is the whole key in the 201 that minted it, and the mask everywhere else; `assistant`
 * is null when the agent has been deleted since the key was made.
 */

export interface AgentApiKey {
  id: string
  name: string
  key: string
  assistantId: string
  scopes: string[]
  ipWhitelist: string[]
  requestCount: number
  lastUsedAt: string | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  assistant: { id: string; name: string; emoji: string | null } | null
}

/** The two scopes the service knows; an empty list allows both (`scopes::allows`). */
export const API_KEY_SCOPES = [
  { id: "chat", label: "Chat", hint: "A whole answer in one response." },
  { id: "chat:stream", label: "Streaming chat", hint: "The answer as it is written." },
] as const

export interface KeyForm {
  name: string
  assistantId: string
  scopes: string[]
  ipWhitelist: string
  expiresAt: string
  enabled: boolean
}

export const EMPTY_KEY_FORM: KeyForm = {
  name: "",
  assistantId: "",
  scopes: ["chat", "chat:stream"],
  ipWhitelist: "",
  expiresAt: "",
  enabled: true,
}

/** `"203.0.113.9, 10.0.0.0/8"` → `["203.0.113.9", "10.0.0.0/8"]`, blanks dropped. */
export function parseAddressList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function formatAddressList(list: string[]): string {
  return list.join(", ")
}

/**
 * The `expiresAt` the API takes, from a `datetime-local` value (which has no zone and is read as
 * local time), or `null` for "never".
 */
export function expiresToApi(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The control's value for an ISO instant: `YYYY-MM-DDTHH:mm:ss`, in local time. Seconds are
 *  kept so opening and saving a form does not quietly move an expiry earlier. */
export function expiresToInput(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formFromKey(key: AgentApiKey): KeyForm {
  return {
    name: key.name,
    assistantId: key.assistantId,
    scopes: key.scopes.length > 0 ? key.scopes : ["chat", "chat:stream"],
    ipWhitelist: formatAddressList(key.ipWhitelist),
    expiresAt: expiresToInput(key.expiresAt),
    enabled: key.enabled,
  }
}

/** The body a create sends. An empty scope list means both, an empty allowlist every address. */
export function createKeyBody(form: KeyForm) {
  return {
    name: form.name.trim(),
    assistantId: form.assistantId,
    scopes: form.scopes,
    ipWhitelist: parseAddressList(form.ipWhitelist),
    ...(expiresToApi(form.expiresAt) ? { expiresAt: expiresToApi(form.expiresAt) } : {}),
  }
}

/** The body an edit sends: every field the form owns, so clearing one clears the row's value. */
export function updateKeyBody(form: KeyForm) {
  return {
    name: form.name.trim(),
    scopes: form.scopes,
    ipWhitelist: parseAddressList(form.ipWhitelist),
    enabled: form.enabled,
    expiresAt: expiresToApi(form.expiresAt),
  }
}

/** The sentence the form shows above its submit button for an agent the API cannot serve. */
export function capabilityWarning(blockers: string[]): string | null {
  if (blockers.length === 0) return null
  const list =
    blockers.length === 1
      ? blockers[0]
      : `${blockers.slice(0, -1).join(", ")} and ${blockers[blockers.length - 1]}`
  return `This agent is bound to ${list}. Every call over the agent API answers 409 capability_not_ported until that binding is removed.`
}
