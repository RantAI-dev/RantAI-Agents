# Conventions

The same in every RantAI repository, so a person or an agent arriving from another one already
knows the answer. The reasons are in the guidelines repository:
<https://github.com/RantAI-dev/guidelines/blob/main/docs/conventions.md>.

Do not edit the rules. Where this repository has to differ, the owner adds a line to the last
section.

## Error responses

Every error has this body. One function builds it; no handler writes its own.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request is not valid.",
    "requestId": "0193b2c4-7a1e-7c3f-9d2a-5e8f1b6c4d90",
    "errors": [
      { "field": "/items/0/quantity", "code": "out_of_range", "message": "Must be between 1 and 999." }
    ]
  }
}
```

- `code`: a row of `.agents/error-codes.tsv`. Clients and tests branch on it. To add one, add a row
  and run `scripts/error-codes.sh --write`. A row is never renamed, removed or given another status.
- `message`: for a person. The registry's text, or a more specific sentence.
- `requestId`: always present, and equal to the `X-Request-Id` response header.
- `errors`: only with `invalid_request`. One entry for every bad field, not only the first. `field`
  is a JSON Pointer into the body, or the bare name of a query or path parameter.
- `details`: optional object for facts a client needs for one code. Document it beside that code.

## Which status

| What happened | Status | Code |
|---|---|---|
| Unparseable body, missing or unknown field, wrong type, value out of range | 400 | `invalid_request` |
| No credentials, or invalid or expired ones | 401 | `unauthenticated`, with a `WWW-Authenticate` header |
| The caller is known and is not allowed | 403 | `permission_denied` |
| It does not exist, or it belongs to another tenant | 404 | `not_found`, the same body in both cases |
| Wrong method for the path | 405 | `method_not_allowed` |
| Duplicate, stale version, wrong state for this action | 409 | `conflict`, or a specific code |
| Body too large | 413 | `payload_too_large` |
| Content type not accepted | 415 | `unsupported_media_type` |
| Too many requests, quota used up | 429 | `rate_limited`, with `Retry-After` in seconds |
| A bug on our side | 500 | `internal` |
| A dependency answered with an error | 502 | `upstream_failed` |
| Overloaded, starting up, or a dependency is down | 503 | `unavailable`, with `Retry-After` |
| We or a dependency ran out of time | 504 | `timeout` |

Success: `200` with a body, `201` with the created resource, `202` with the job when work continues
in the background, `204` with no body. Never `200` with an error inside.

Not used: `422` (use `400`), `408` (use `504`), `402`, `418`, `499`. What the framework produces on
its own — a JSON extractor's `422`, a router's plain-text `404`, a panic handler's `500` — is
converted by the same function.

## Messages

- One or two sentences: what is wrong, then what to do. Sentence case, a full stop, no exclamation
  mark, no "please", no "oops".
- Name the field or the limit the caller ran into.
- Nothing internal: no exception or driver text, SQL, stack trace, file path, upstream response
  body, or another tenant's id. The cause goes in the log under the same request id.
- `internal` and `upstream_failed` always carry the registry's message and nothing else.
- English. A user interface shows its own text, chosen by `code`, in the user's language.
- Tests assert on the status and the `code`, never on the message text.

## JSON

- Field names and query parameters are `camelCase`. Enum values and error codes are lower
  `snake_case` (`"in_progress"`). Database columns and log fields are `snake_case` too.
- In Rust every type that crosses the wire has `#[serde(rename_all = "camelCase")]`, and no handler
  builds JSON by hand. A contract test fails on any response key that contains `_`.
- Identifiers are English: field names, codes, enum values, log messages.
- A field in the schema is always present; `null` means no value. Unknown request fields are
  rejected. Clients ignore response fields they do not know.
- Instants: RFC 3339 in UTC with exactly three decimals, `2026-11-11T08:30:00.000Z`, in a field
  ending `At` (`createdAt`). Calendar dates: `2026-11-11`, ending `On`. Durations: an integer with
  its unit in the name, `timeoutMs`, `ttlSeconds`.
- Ids are opaque strings in a field `id`; a reference is `<thing>Id`. Use a UUID, version 7 for new
  tables. Never a database sequence number, never an id cut from a hash.
- Money is an integer in the currency's smallest unit plus an ISO 4217 code:
  `{ "amount": 1250000, "currency": "IDR" }`. Never a float.
- Booleans start with `is` or `has` (`isArchived`).

## Lists

`GET /v1/documents?limit=50&cursor=…` returns `{ "data": [...], "nextCursor": "…" }`.

- Every list is paginated from its first release and never returns a bare array.
- `limit` has a default and a maximum; a larger value is lowered to the maximum, a negative one is
  `invalid_request`. `nextCursor` is `null` on the last page. A cursor is opaque.
- Only where a screen must jump to a page: `page`, `pageSize`, and `total` in the response.
- Sorting: `sort=createdAt` or `sort=-createdAt`. Give every sort a tie-break on `id`.

## URLs and headers

- `/v1/…` from the first release. Plural nouns, `kebab-case` segments: `/v1/knowledge-bases/{id}`.
  An action that is not create, read, update or delete: `POST /v1/documents/{id}/reindex`.
- Breaking, so it needs `/v2`: removing or renaming a field, changing a type, a new required
  request field, a new status for an existing code. Adding an optional field is not breaking.
- `Authorization: Bearer <token>`. A key or token never goes in a URL.
- `X-Request-Id`: accept the caller's if it is 1–128 characters of `A-Z a-z 0-9 . _ -`, otherwise
  make a UUID. Return it on every response and pass it to every service called.
- `Idempotency-Key` on a `POST` whose repeat would do harm. The same key and body returns the first
  response; the same key with another body is `409 conflict`.
- `GET /health`: `200 {"status":"ok"}` when the process is up; it checks nothing else.
  `GET /ready`: `200`, or `503` with `{"status":"degraded","checks":{"postgres":"failed"}}`.
  Both are unversioned and need no credentials.

## Jobs, events and streams

- A job has `status`: `queued`, `running`, `succeeded`, `failed` or `cancelled`. A failed job
  carries the same `error` object as a response.
- An event or webhook is named `<noun>.<verb in the past tense>`, for example `document.indexed`,
  with the body `{ "id", "type", "occurredAt", "tenantId", "data" }`.
- An error after a stream or socket has started is one last message carrying the same `error`
  object. It keeps `code` and `requestId`.
- An API that implements someone else's protocol (OpenAI-compatible, S3, MCP) follows that
  protocol exactly on those routes. Our own routes beside it follow this page.

## Logs

- One JSON object per line on stdout, with `snake_case` fields: `ts`, `level`, `msg`, and where
  they apply `request_id`, `tenant_id`, `user_id`, `code`, `error`, `status`, `duration_ms`.
- `msg` is a fixed string; values go in fields, so equal events group together.
- One line per request at `info`: method, route template, `status`, `duration_ms`.
- `error`: a person must look, and every `500` is one. `warn`: handled but unexpected, such as a
  retry or a slow dependency. `info`: requests and lifecycle. `debug`: off in production.
  A `4xx` is `info`, not `warn`.
- Log a failure once, where it becomes a response, with its internal cause in `error`.
- Never log a secret, a token, a request body, document content or personal data.

## Configuration

- `SCREAMING_SNAKE_CASE`. Our own settings carry the service prefix (`KB_QUERY_TIMEOUT_MS`);
  well-known names stay as they are (`DATABASE_URL`, `PORT`, `LOG_LEVEL`, a provider's key name).
- The unit is in the name. Booleans are `true` or `false`.
- Every variable is in `.env.example` with a comment. All of it is parsed once at startup into one
  typed value; a missing or invalid variable stops the process with a message that names it.

## Command-line tools

Exit `0` on success, `1` on failure, `2` on wrong usage. Results go to stdout, everything else to
stderr. Offer `--json` where another program will read the output.

## Database

- Tables are plural `snake_case`; the key is `id`; a reference is `<singular>_id`.
- Every table has `created_at` and `updated_at` as `timestamptz`, stored in UTC.
- Every tenant-owned table has `tenant_id`, and every query on it filters by it.
- Indexes are `idx_<table>_<columns>`, unique constraints `uq_<table>_<columns>`.
- A migration only goes forward and is never edited once merged.

## Git

- Commit subject: `type(scope): summary`, 72 characters at most, no full stop. Types: `feat`,
  `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`. The `commit-msg` hook
  checks it. A ticket id goes in the body as `Refs: ABC-123`, not before the type.
- Branch: `type/short-topic`. Branches a tool creates for a worker keep the tool's name.
- A pull request title is the subject its squash commit will have.

## Where this repository differs

Nothing yet. One line per difference: what, why, and who approved it. A response shape that
clients already depend on stays as it is until the next API version, and is listed here.
