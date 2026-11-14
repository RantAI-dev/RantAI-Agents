/**
 * Reading an error answer in the browser.
 *
 * Every route answers a failure with `{ error: { code, message, requestId } }` (docs/conventions.md),
 * so the UI shows the message the server wrote and branches on the code, never on the text. A few
 * older TypeScript routes still answer `{ error: "..." }`; both shapes are read here so a caller
 * does not have to know which backend it is talking to.
 */

export interface ApiError {
  /** The registry code, for a branch (`password_login_disabled`, `conflict`, …). */
  code: string | null
  /** The sentence to show. Empty when the answer carried none. */
  message: string
  requestId: string | null
  status: number
  /** The bad fields of a 400 `invalid_request`, each with its own sentence. */
  fields: FieldError[]
}

export interface FieldError {
  /** A JSON Pointer into the body (`/realm`), or a query or path parameter's name. */
  field: string
  message: string
}

interface ErrorBody {
  error?:
    | string
    | {
        code?: unknown
        message?: unknown
        requestId?: unknown
        errors?: unknown
      }
}

function fieldErrors(raw: unknown): FieldError[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const { field, message } = (entry ?? {}) as { field?: unknown; message?: unknown }
    return typeof field === "string" && typeof message === "string" && message
      ? [{ field, message }]
      : []
  })
}

/** The error an answer carries; `fallbackMessage` when it carries none. */
export async function readApiError(
  response: Response,
  fallbackMessage = "Something went wrong. Try again.",
): Promise<ApiError> {
  let body: ErrorBody | null = null
  try {
    body = (await response.json()) as ErrorBody
  } catch {
    body = null
  }

  const raw = body?.error
  if (typeof raw === "string") {
    return {
      code: null,
      message: raw || fallbackMessage,
      requestId: null,
      status: response.status,
      fields: [],
    }
  }
  const code = typeof raw?.code === "string" ? raw.code : null
  const fields = fieldErrors(raw?.errors)
  // The generic invalid_request sentence says nothing a person can fix; the fields do.
  const message =
    fields.length > 0
      ? fields.map((f) => f.message).join(" ")
      : typeof raw?.message === "string" && raw.message
        ? raw.message
        : fallbackMessage
  const requestId = typeof raw?.requestId === "string" ? raw.requestId : null
  return { code, message, requestId, status: response.status, fields }
}

/** The seconds an answer's `Retry-After` header asks for, when it carries one. */
export function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after")
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export interface ApiResult<T> {
  ok: true
  data: T
}

export interface ApiFailure {
  ok: false
  error: ApiError
}

/**
 * `fetch` a JSON API and read it as `T`, turning a failed status into the standard error.
 * `credentials: "include"` is the session cookie; every dashboard call needs it.
 */
export async function requestJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<ApiResult<T> | ApiFailure> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  const response = await fetch(input, { ...init, headers, credentials: "include" })
  if (!response.ok) return { ok: false, error: await readApiError(response) }
  if (response.status === 204) return { ok: true, data: undefined as T }
  return { ok: true, data: (await response.json()) as T }
}
