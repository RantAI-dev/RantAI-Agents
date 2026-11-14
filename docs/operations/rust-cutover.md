# Cutting API routes over to Rust

The Rust server (`rust/crates/agents-server`) answers some API route groups. Next.js
decides which requests go to Rust, one group at a time, using two variables. Turning a
group on or off takes a restart and nothing else. You do not need a rebuild or a deploy
of Rust.

## The switch

| Variable | Meaning |
|---|---|
| `RUST_API_URL` | Where agents-server listens, for example `http://127.0.0.1:8090`. When it is unset or blank, nothing is routed: Next answers every request, as it did before. |
| `RUST_ROUTES` | Comma-separated route groups: `assistants`, `sessions`, `memory`, `chat`. A group that is not listed stays in Next. Unknown names are ignored. |

```sh
# .env (the Next.js process)
RUST_API_URL=http://127.0.0.1:8090
RUST_ROUTES=memory,sessions
```

The variables are read at runtime, by the middleware and by the chat routes. They are not
baked in at build time. They belong in the Next.js environment, not in agents-server's.

## The groups

The table lives in `src/lib/rust-router/routes.ts`. It lists exactly what
`rust/crates/agents-server/src/routes/**` registers. A path that Rust serves with fewer
methods than Next keeps the other methods in Next.

| Group | Paths and methods |
|---|---|
| `assistants` | `GET POST /api/assistants`; `GET PUT PATCH DELETE /api/assistants/{id}`; `GET PUT /api/assistants/{id}/tools`, `/skills`, `/mcp-servers`, `/workflows`; `POST DELETE /api/assistants/{id}/default`; `POST /api/assistants/wizard/stream`; `GET PUT /api/user/default-assistant`; `GET PUT PATCH /api/user/preferences`; `GET POST /api/mobile/assistants`; `GET PUT PATCH DELETE /api/mobile/assistants/{id}`; `GET PUT /api/mobile/assistants/{id}/tools`, `/skills`; `POST /api/mobile/assistants/{id}/duplicate`, `/default` |
| `sessions` | `GET POST /api/dashboard/chat/sessions`; `GET PATCH DELETE /api/dashboard/chat/sessions/{id}`; `POST PATCH DELETE /api/dashboard/chat/sessions/{id}/messages`. The `artifacts/**` sub-routes stay in Next. |
| `memory` | `GET DELETE /api/dashboard/memory`; `DELETE /api/dashboard/memory/{id}`; `GET DELETE /api/mobile/memories`; `DELETE /api/mobile/memories/{id}` |
| `chat` | `POST /api/chat` and `POST /api/chat/tool-approval`, both with a fallback (below) |

### How a request reaches Rust

- `assistants`, `sessions` and `memory` go through `src/middleware.ts`. The middleware
  forwards the method, the body and every header to Rust, including cookies,
  `Authorization` and `x-organization-id`. It drops hop-by-hop headers and adds
  `x-forwarded-host` and `x-forwarded-proto`. The answer streams back unbuffered, with
  its status and every `Set-Cookie`.
- `POST /api/chat` goes to Rust first. Rust answers 409 `capability_not_ported` when the
  assistant needs something it does not have yet: a knowledge base, MCP, workflows, skills
  or attachments. On that answer, the old TypeScript handler runs with the same request,
  and its body is replayed byte for byte. Every other status, 409s with a different code
  among them, passes through as Rust sent it, streaming.
- `POST /api/chat/tool-approval` goes to Rust first. Rust keeps a stream's pending
  approval in Postgres, while a stream that fell back to TypeScript keeps it in that
  process's memory. When Rust answers 404 `not_found`, the TypeScript handler is asked
  next.
- Every answer from Rust carries `x-rantai-upstream: rust`. Use it to check, from the
  browser's network tab, which side answered.
- When Rust cannot be reached, a routed request gets 502 `upstream_failed`. It does not
  silently fall back to Next. The Rust routes enforce access rules (agent grants) that
  the TypeScript routes do not have, so a silent fallback would skip them.

Next's middleware buffers a request body to forward it. Next limits that body (10 MB by
default). The routed groups take JSON bodies far below that limit.

## Running agents-server next to Next.js

agents-server shares the database and the session secret with Next:

```sh
cd rust
DATABASE_URL=postgresql://…            # the same database Next uses
AUTH_SECRET=…                          # the same secret as Next (or NEXTAUTH_SECRET)
AGENTS_HOST=127.0.0.1 AGENTS_PORT=8090 # default host is 0.0.0.0; bind to loopback when only Next calls it
OPENROUTER_API_KEY=…                   # or AGENTS_LLM_BASE_URL / AGENTS_LLM_API_KEY, for chat
cargo run --release -p agents-server
```

Check that it is up before you route anything to it:

```sh
curl -fsS http://127.0.0.1:8090/readyz            # {"status":"ready"} once the database answers
curl -fsS http://localhost:3000/api/health        # {"status":"ok","rust":{"configured":…,"routes":[…],"ready":true}}
```

`GET /api/health` always answers 200, so that a Rust outage never makes an orchestrator
restart Next. Read `rust.ready` to see whether Rust is up: it is `null` when
`RUST_API_URL` is unset, and `false` when `/readyz` fails or takes more than 2 s.

## Turning a group on

Go one group at a time, from the lowest risk to the highest:

1. `memory`
2. `sessions`
3. `assistants`
4. `chat`

For each group:

1. Add the group to `RUST_ROUTES` and restart Next.
2. Check `/api/health`: the group should be listed and `ready` should be `true`.
3. In the browser, use the surface and confirm that its requests carry
   `x-rantai-upstream: rust`.
4. Watch agents-server's logs and the rate of 5xx answers. For `chat`, also watch how
   many requests fall back to TypeScript. Each fallback costs one round trip to Rust, so
   a high fallback rate means the group is turned on too early.

## Rollback

To roll back one group, remove it from `RUST_ROUTES` and restart Next. To roll back
everything, unset `RUST_API_URL` and restart Next. agents-server can keep running. Both
servers read and write the same rows, so no data has to move in either direction.

When `chat` is rolled back while a stream is waiting on a tool approval in Rust, that
approval cannot be reached any more. It times out as denied, which fails closed.
