# The agent API: runbook

An agent can be reached from another platform: over the OpenAI-compatible HTTP endpoint or over a
WebSocket, with a key minted for that one agent. It runs in the Rust service (`agents-server`,
identity-and-access slice S7, design §3.6). The router in front (slice S9) must send
`/api/dashboard/agent-api-keys/**`, `/v1/chat/completions` and `/v1/agents/{id}/ws` to Rust.

The key acts as the agent, in the agent's organisation — not as a person. It therefore carries no
user, no session and no grant: what it may do is what the agent may do.

## What is served

| Route | What it does |
|---|---|
| `GET /api/dashboard/agent-api-keys?assistantId=` | The organisation's keys, newest first. Each carries the masked key |
| `POST /api/dashboard/agent-api-keys` | Mints a key for one agent (201). **The whole key is in this answer and in no other** |
| `GET /api/dashboard/agent-api-keys/{id}` | One key |
| `PATCH` (or `PUT`) `/api/dashboard/agent-api-keys/{id}` | Name, `scopes`, `ipWhitelist`, `expiresAt`, `enabled` |
| `DELETE /api/dashboard/agent-api-keys/{id}` | Revokes it (`{ "success": true }`) |
| `POST /v1/chat/completions` | The OpenAI-compatible completion, `stream: true` or `false` |
| `OPTIONS /v1/chat/completions` | The browser's pre-flight (204) |
| `GET /v1/agents/{assistantId}/ws` | The socket: one conversation, UI-stream chunks out |

Managing a key needs `api_keys.manage` — an owner or an admin. A key's agent has to be one of the
caller's own organisation: another tenant's agent, or a built-in, is a 404, as is another tenant's
key. Every change writes an `AuditLog` row (`api_key.create`, `api_key.update`,
`api_key.delete`) in the same transaction.

## Mint a key

The dashboard routes take the session cookie, or the mobile `Bearer` token.

```sh
curl -sS -X POST "$BASE/api/dashboard/agent-api-keys" \
  -H "authorization: Bearer $USER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
        "name": "Classroom backend",
        "assistantId": "'"$ASSISTANT_ID"'",
        "scopes": ["chat", "chat:stream"],
        "ipWhitelist": ["203.0.113.9"],
        "expiresAt": "2026-12-31T23:59:59Z"
      }'
```

```json
{
  "id": "0193b2c4…",
  "name": "Classroom backend",
  "key": "rantai_sk_9tR2…Xq4A",
  "assistantId": "…",
  "scopes": ["chat", "chat:stream"],
  "ipWhitelist": ["203.0.113.9"],
  "requestCount": 0,
  "lastUsedAt": null,
  "enabled": true,
  "expiresAt": "2026-12-31T23:59:59",
  "createdAt": "2026-11-14T08:00:00",
  "updatedAt": "2026-11-14T08:00:00",
  "assistant": { "id": "…", "name": "Budi Helper", "emoji": "🤖" }
}
```

`key` is the secret, once. Every later read returns `rantai_sk_9tR2…Xq4A` — the mask — and the
database keeps only `hex(SHA-256(key))`, never the key.

`scopes` is `["chat", "chat:stream"]` unless the request says otherwise; an empty list allows both.
`ipWhitelist` is empty (any address) unless the request says otherwise, and the address it is
compared with is the **connection's**, not `X-Forwarded-For` (see "Behind a proxy" below).

## A non-streaming completion

```sh
curl -sS "$BASE/v1/chat/completions" \
  -H "authorization: Bearer rantai_sk_9tR2…Xq4A" \
  -H 'content-type: application/json' \
  -d '{
        "model": "ignored",
        "messages": [{"role": "user", "content": "Jelaskan fotosintesis."}]
      }'
```

```json
{
  "id": "chatcmpl-19a1d940859-3f2c1e",
  "object": "chat.completion",
  "created": 1763107200,
  "model": "rantai/nano",
  "choices": [
    { "index": 0,
      "message": { "role": "assistant", "content": "Fotosintesis adalah…" },
      "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 812, "completion_tokens": 240, "total_tokens": 1052 },
  "sources": []
}
```

`model` is ignored: the agent answers with its own model, and the answer says which. `sources` is
always present and empty, because nothing is retrieved (below). The response carries
`Access-Control-Allow-Origin: *`, so a browser page on another origin may call it.

## A streaming completion

```sh
curl -sN "$BASE/v1/chat/completions" \
  -H "authorization: Bearer rantai_sk_9tR2…Xq4A" \
  -H 'content-type: application/json' \
  -d '{
        "stream": true,
        "messages": [{"role": "user", "content": "Hitung 17 × 23."}]
      }'
```

```text
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1763107200,"model":"rantai/nano","choices":[{"index":0,"delta":{"content":"17"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1763107200,"model":"rantai/nano","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"sources":[]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1763107200,"model":"rantai/nano","choices":[],"usage":{"prompt_tokens":812,"completion_tokens":12,"total_tokens":824}}

data: [DONE]
```

`finish_reason` is `stop`, `length`, `content_filter`, `tool_calls`, or `error` — the last one when
the model's stream ended early, and it carries the warning that the text above may be truncated. A
stream that breaks before the final chunk sends
`data: {"error":{"message":"Stream error","type":"server_error"}}` and no `[DONE]`.

## The WebSocket

Same key. It goes in the handshake, or — for a browser, which cannot set a header on a socket — in
the first message within ten seconds.

```js
const socket = new WebSocket(`wss://example.com/v1/agents/${assistantId}/ws`);
socket.onopen = () => socket.send(JSON.stringify({ type: "auth", key: apiKey }));
socket.onmessage = (event) => {
  const frame = JSON.parse(event.data);
  if (frame.type === "chunk" && frame.chunk.type === "text-delta") {
    output.append(frame.chunk.delta);
  }
};
```

Then, per turn:

```js
socket.send(JSON.stringify({ type: "message", content: "Jelaskan fotosintesis." }));
// … {type:"chunk", chunk:{type:"start"}}, {type:"start-step"}, {type:"text-start"},
//    {type:"text-delta", delta:"Foto…"}, …, {type:"finish"}, then:
// … {type:"done", sessionId:"8f14e45fceea167a5a36dedd4bea2543"}
```

| Frame in | Frame out |
|---|---|
| `{"type":"auth","key":"rantai_sk_…"}` — first message, without a handshake key | `{"type":"error","code","message"}`, then close 4401 when the key is wrong |
| `{"type":"message","content":"…","sessionId?":"…"}` | `{"type":"chunk","chunk":{…}}` …, then `{"type":"done","sessionId":"…"}` |
| `{"type":"ping"}` | `{"type":"pong"}` |

The `chunk` objects are the AI SDK v6 UI-message-stream chunks the dashboard chat already sends, so
one client can read both. Join the `text-delta` deltas in order for the answer.

`sessionId` resumes a conversation the **same key** started on this process: a follow-up that names
it is answered with the earlier turns in context. Omit it — or name one this process no longer has,
because it restarted, or one another key or agent owns — and the server starts a new conversation
and names it in `done`. The conversation is kept in the process, so a restart starts a new one.

Limits:

| What | Value | What happens |
|---|---|---|
| One turn at a time | — | A `message` while a turn runs is `{"type":"error","code":"conflict"}`; the running turn is untouched |
| Frame size | 256 KiB | `{"type":"error","code":"payload_too_large"}` |
| Idle | 300 s | The socket is closed 4408 |
| Auth | 10 s | A socket that presents no key is closed 4401 |
| History | 40 messages per conversation, 500 conversations per process | The oldest are dropped |

A socket that closes cancels the model call behind the turn that was running.

## Errors

Every refusal is the standard body, on both transports (the socket sends the same `code` in its
`error` frame):

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | A body that is not JSON, a missing field, a wrong type, a value out of range. `errors[]` names every bad field |
| 401 | `unauthenticated` | No key, an unknown key, a disabled one, an expired one, or a key that belongs to another agent |
| 403 | `permission_denied` | The address is not in the allowlist, the key does not carry the scope, or the caller may not manage keys |
| 404 | `not_found` | Another organisation's key or agent |
| 409 | `capability_not_ported` | The agent needs something this service cannot run — see below |
| 429 | `rate_limited` | The gate's limiter (the per-key limiter is not ported, differences.md row 147) |
| 502 | `upstream_failed` | The model call failed, or the turn ended on a tool that needed a decision |

## What an agent may not use here

The knowledge base is **off** in this phase (design §3.6) and the answer is a 409 rather than an
answer without retrieval. The same gate refuses an agent with an MCP server, a workflow, a chatflow,
a skill, or a tool the Rust service cannot run. `inline_figures` is accepted and has nothing to
send, because nothing is retrieved. An OpenAI client reads all of this as `error.message`; branch on
`error.code`.

## Behind a proxy

The IP allowlist is checked against the **peer address of the connection**
(`routes/agent_api/client_ip.rs`). `X-Forwarded-For` is not read: without a trusted-proxy list any
client can set it, and reading its first hop — what the TypeScript did — let a caller name itself
into an allowlist. The service is served with connect information, so the peer address is known.

That means a deployment behind a reverse proxy sees the proxy's address. Until the trusted-proxy
task lands (`TRUSTED_PROXIES`), either leave `ipWhitelist` empty or list the proxy's address. The
audit rows of the dashboard routes still record the first `X-Forwarded-For` hop, which is a note
rather than a decision.

## Changing the limits

They live in `routes::agent_api::ws::Limits` (`ApiState` in `AppState`), with the defaults above. A
test shortens a timeout by setting the field on the state it builds; a deployment that needs
another value sets it in `main.rs` when it builds `AppState`.
