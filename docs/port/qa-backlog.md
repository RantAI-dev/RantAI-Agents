# RantAI-Agents QA backlog (open cases)

| | |
|---|---|
| Source | Lark Base **RantAI Operations** → table **QA Cases** (`Psx6b7igKamz8tsgJ4djgiSlpEx` / `tblPihSXxq00ZHgV`), product = RantAI-Agents |
| Snapshot | 2026-11-13 (last QA edit in Lark: 2026-11-02) |
| Tester | Rizky Kusnady (all but 8 cases) |
| Scope | Every Agents case whose **Current Result** is Fail, Blocked or Deferred: 139 of 479 |

**Why this file exists.** The project is going to be refactored and migrated.
These cases describe behaviour the current system gets wrong, or that nobody has
been able to verify. A rewrite will either fix each one or carry it over
silently. Treat each row as a requirement for the new code. Do not port the bug.

**Lark is the source of truth for status.** This file is a snapshot. When a
case is fixed, run the retest and record it in Lark (**Retest Result** and
**Retest Date**; never overwrite **Result**). Then delete the row here.

**Verification state.** The findings below are QA's, from builds 0.5.0, prod
and local-dev (`cloud@1ffcad9+oss@e744680c`). On 2026-11-13 only two were
re-checked against `main`, and both are **still present**:
AUTH-046 (`apps/cloud/src/app/api/auth/providers/route.ts` still overrides
NextAuth) and AUTH-039 (`apps/cloud/src/app/api/mobile/login/route.ts` has no
rate limiting). The rest were not re-checked, because the OSS submodule was not
checked out.

Legend: **†** = a fix shipped in agents-cloud #25 (2026-10-05, "11 qa retest
fixes for 0.5.0") **after** the last failing retest, so it needs a retest, not
new work. **‡** = a fix shipped and the retest **after** it still failed.

## Summary

| Current result | Count |
|---|---|
| Fail, Major | 38 |
| Fail, Minor | 76 |
| Fail, no severity set | 3 |
| Blocked | 10 |
| Deferred | 12 |

For reference, the other 340 cases are: Pass 209, Pass with findings 67, N/A 64.
The 67 "pass with findings" cases hold further minor findings that are not
listed here.

---

## P0: security, tenancy and data integrity

Each of these should become an automated test in the new code before the
behaviour is ported. A tenancy row belongs in `apps/cloud/src/test/tenancy-cases.ts`
(AGENTS.md §1). Every test must be **seen failing** against the bug (§2). The
races need a `Promise.all` test, not a sequential one (§3).

### Tenancy / IDOR

| ID | Sev | Finding | Must hold after refactor |
|---|---|---|---|
| TC-1664, TC-1678 | Major | `GET /api/dashboard/workflows/[id]/runs/[runId]` returns another org's run, including input and output, with 200. The other 6 workflow endpoints correctly return 404. Reproduced on prod. | Run detail is scoped to the caller's org. Add a tenancy row. |
| TC-1294 | Minor | `findConversationMessages` filters on `conversationId` only, so tenant B gets 200 for tenant A's conversation id. | Message list is scoped to org and user. |
| TC-1642 | Major | Design: the message upsert matches on message id only (`conversations-store.ts` `writeMessageRaw`), so user B can overwrite the content of user A's message. | Every write checks the owning conversation and tenant. |
| TC-1644 | Major | Design: the project storage key is `org + projectId` with no user (`storage.ts:79`). A member who creates a project with the same id can read the owner's files. Files are not deleted with the project. | Storage keys are unguessable or ownership-checked; deleting a project deletes its files. |
| TC-1271 | Major | A viewer can `POST /api/dashboard/files/categories`. The route only calls `resolveActiveOrg` and never checks the role. | Every mutating route enforces the org role. |

### Auth and identity

| ID | Sev | Finding | Must hold after refactor |
|---|---|---|---|
| AUTH-039 | Major | **Still on main.** `/api/mobile/login` has no rate limit: 25 wrong passwords all return 401 (never 429), then the correct one gets a token. | All credential endpoints are rate-limited, web and mobile alike. |
| AUTH-040 | Minor | Every limiter keys on the first `X-Forwarded-For` hop as sent. Wherever the app is reachable without a proxy that rewrites it, a client can rotate the header and bypass every limit. | Client IP comes from a trusted proxy hop only. |
| AUTH-045 | Major | Registering an unregistered email listed in `ADMIN_EMAILS` (or hard-coded `agent@rantai.com` in `admin-setup.ts:12`) immediately creates an org on the UNLIMITED plan, with no proof of ownership. | Admin or unlimited status needs a verified email or an explicit grant. Remove the hard-coded admin. |
| TC-1263 | Major | Account pre-hijacking: credentials sign-up accepts any email without verification, and the OAuth `signIn` callback links to an existing user by email alone (`auth.ts:153-193`, `allowDangerousEmailAccountLinking`). | Verify email before credentials login, or never auto-link OAuth to an unverified account. |
| AUTH-046 / TC-1282 | Major | **Still on main.** `apps/cloud/src/app/api/auth/providers/route.ts` overrides NextAuth's `/api/auth/providers`. This breaks `signIn('credentials')` after sign-up (the user lands on `/login` with no session) and `signIn('microsoft-entra-id')`. | Don't shadow NextAuth routes. Serve the enabled-providers flag from a different path. |
| TC-1269 | Major | A suspended user's mobile JWT keeps working for its full 30 days (`/api/mobile/assistants` and `/models` return 200). Only a fresh login is refused. | Suspension takes effect on existing tokens. |
| TC-1267 | Minor | Web JWTs are stateless, so a logged-out cookie replayed elsewhere still works for 30 days. | Session/token version on the user, checked per request and bumped on logout, reset and suspend. |
| AUTH-041 | Minor | Sessions opened before a password reset stay valid afterwards. | Same mechanism: a reset revokes existing sessions. |
| TC-1261 | Minor | User enumeration by timing: about 387 ms for a known email (bcrypt runs) versus about 13 ms for an unknown one. | Constant-time path: hash a dummy password when the user doesn't exist. |
| AUTH-052, AUTH-053 | Major / Minor | Terms/Privacy consent is checked only in the browser. The server accepts `agreedToTerms:false`, stores nothing, and the OAuth buttons skip the checkbox. | The server requires consent and records it (who, when, which version). |

### Design (Od) sharing and sandboxing

| ID | Sev | Finding | Must hold after refactor |
|---|---|---|---|
| TC-1643 | Major | The share iframe uses `sandbox="allow-scripts allow-same-origin"` (`share/[token]/page.tsx:182`) and the raw share route sends no CSP sandbox. Script in a shared design runs on the app origin and can read the viewer's session data. | Shared content is served from a separate origin, or with `allow-scripts` only plus a CSP `sandbox`. |
| TC-1633, TC-1648 | Minor | The `/raw` route sends no CSP `sandbox` header (the export route does), so opening the HTML directly runs it on the app origin. | Every route that serves user HTML sends CSP `sandbox`. |
| TC-1637 | Major | Share links keep serving the snapshot after the project is deleted. | Deleting a project revokes its shares and deletes the snapshots. |
| TC-1647 | Minor | Share URLs are built from `X-Forwarded-Host` (`shares-store.ts:98`), so they can point to `https://evil.example/...`. | Build URLs from configured origin. |
| TC-1646 | Minor | Project upload accepts a 30 MB file and a `.exe` (`upload/route.ts`), though the library enforces 3 MB and a type allowlist. | One upload policy (size, type, magic bytes) everywhere. |
| TC-1311 | Minor | An avatar upload of a renamed `.exe` (MZ header) is accepted. Validation trusts the browser-reported MIME type. | Check magic bytes and re-encode images on the server. |

### Workflows

| ID | Sev | Finding | Must hold after refactor |
|---|---|---|---|
| TC-1659 | Major | **Race.** With 6 concurrent approve requests on a paused run, 3–5 get 200 and the successor LLM node runs 3–5 times. The trace keeps only the last writer, which hides it. | Resume is atomic: one compare-and-set from PAUSED. Prove it with a `Promise.all` test. |
| TC-1120 | Major | After approval, **both** the `approved` and the `rejected` branch run. | Only the chosen handle's branch runs. |
| TC-1662 | Major | Export contains `webhookSecret` in plain text, so anyone holding the file can forge HMAC signatures. (Credentials are correctly exported as references.) | Secrets are never exported. Regenerate them on import. |
| TC-1112 | Major* | The run input stores every request header, including `x-webhook-signature`. (*The Lark text reads as a minor observation; confirm the severity.) | Strip auth and signature headers before persisting. |
| TC-1673, TC-1672, TC-1649 | Major / Minor / Deferred | Plan quota is enforced only in the dashboard execute route. After it is used up, Public API and webhook runs still complete and call the model. Import and Marketplace install bypass the 3-workflow limit (a free account ended up with 5). Free accounts record no `UsageRecord` (seen with a mock model only). | Quota and usage metering sit in the execution service, not in a route. |

### Billing and plan gating

| ID | Sev | Finding | Must hold after refactor |
|---|---|---|---|
| TC-1685 | Major | A free-plan account can generate images through the Mobile API (200), while the web route returns 403. Mobile also lacks the house models; audio with `rantai/voice` returns 500. | Plan gating lives in the service layer, shared by web, mobile and API. |
| TC-1325 | Minor | A feature disabled by flag (Live Chat) is hidden in the UI but still reachable at `/dashboard/agent`. | Flags are enforced on the server. |
| TC-1288 | Minor | The Free plan's 1-member limit is not enforced: the owner sent 2 extra invites. | Member limit is enforced on invite. |

---

## P1: broken functionality (Major)

| ID | Area | Finding | Must hold after refactor |
|---|---|---|---|
| TC-1254, AUTH-001 | Billing | All three pricing CTAs link to `/checkout/<plan>` (`home-pricing.tsx:109`), and no such page exists, so they 404 on prod. Prod `/login` also sends no HSTS or CSP. | The checkout path exists, or the CTAs go to sign-up/billing. Send security headers. |
| TC-1228, TC-1255 | Billing | The public pricing page doesn't match the real plans. For example, Lite is "1 agent, 1,000 msgs" publicly but "20 assistants, 2,000 credits" in the app. | One plan config feeds both marketing and the app. |
| TC-1550 † | Chat/Tools | Tool calls fail on prod with "model is busy or rate-limited". The agent then claims it can't make HTTP requests and gives no final answer. | Show provider rate limits as such. Always return a final answer. |
| TC-1545 † | Chat | The script guard (`src/lib/llm/script-guard.ts`, from PR #17) strips non-Latin scripts the user explicitly asked for (Chinese, Russian, Arabic). | Script filtering never drops requested output. |
| TC-1555 † | KB | A document that failed embedding (401) looks normal after preview, with "0 chunks" and no warning. | Failed ingestion stays visibly failed. |
| TC-1408 | API v1 | `/v1/chat/completions` returns 200 with `"content":""` and `finish_reason:"stop"` in 2 of 3 runs, even though retrieval succeeded. | No empty successful completion: retry or return an error. |
| TC-1677 | Workflows | A webhook configured in the UI can never be called (404 "No workflow found"): the trigger stays `{"type":"manual"}`, and `webhookPath` and `webhookSecret` are never saved. | The webhook node config is persisted to the trigger. |
| TC-1422 | Design | In Visual Edit, text changes are not saved (no request is sent). Colour changes are saved as inline styles. | Every edit persists. |
| TC-1645 | Design | 29 `od_*` tables have no migration file. After `prisma migrate deploy` (as in docker-compose and CI), the Design API returns 500 `od_projects does not exist`. | Every table has a migration, enforced by CI running `migrate diff`. |
| TC-1194, TC-1196, TC-1204, TC-1206 | Media | Generation works, but: width/height and `durationMs` are not recorded; house models (RantAI Canvas, Voice) are missing from the pickers because the page reads `LlmModel` directly; the UI never shows PENDING or RUNNING. | Asset metadata recorded; one model catalog. |
| TC-1310 | Account | The sidebar name doesn't update after a profile save (it's read from the stale JWT), and there's no success toast. | The session reflects profile changes. |
| TC-1541, TC-1542 | Perf | Load tests failed, **but every virtual user hit the same `sessionId`**, so the numbers are contaminated by per-session contention. | Rerun with one session per user (AGENTS.md §4: GitHub-hosted runner, stubbed LLM). |

---

## P2: minor defects

### Chat and conversations
- **TC-944 †**: edit-version history (‹ 2/2 ›) is lost after a refresh, and older versions show the new user text next to the old answer.
- **TC-1546 †**: Regenerate on a message that isn't the latest deletes everything after it, with no confirmation and no versioning (unlike Edit).
- **TC-946 (Blocked)**: there's no in-place delete (a product decision). The Delete button truncates everything after the message, so its dialog must say so.
- **TC-1548 †**: memory tools fire uninvited (`forgetMemory` on "Tes hapus C", `saveMemory` on searches).
- **TC-1549 †**: message bubbles show time relative to page load ("less than a minute ago" for an 18-hour-old message).
- **THM-005**: dark theme fails the WCAG AA contrast check (Lighthouse 96).

### Tools / MCP
- **TC-1523 †**: the approval gate never appears for outward-facing tools (`fetch`).
- **TC-1146**: the code interpreter fails on prod because Piston has no Python runtime.
- **TC-1551 †**: the agent picks JavaScript, Piston rejects `javascript-18.15.0`, there's no fallback, and the agent fakes output from a manual calculation.
- **TC-1168**: there's no per-tool enable for MCP (only per server). `tools-settings-client.tsx:101` excludes MCP tools.
- **TC-1172**: the 5 pre-installed MCP servers in the acceptance criteria (GitHub, Notion, Firecrawl, Semgrep, DeepWiki) don't exist. Fix the spec or the seed.

### Knowledge base
- **TC-984 ‡**: citation page numbers are wrong (it cites p.1 instead of p.39). The fix in #32 didn't resolve it, and it failed again on 2026-10-19.
- **TC-1570**: "All Documents" count includes artifacts (47 = 28 docs + 19 artifacts).
- **TC-1554 †**: Delete is hidden in an overflow menu on the Files card and is missing on the preview page.

### Assistants
- **TC-1032**: after an assistant is deleted, its chats fail with a 10-second timeout error instead of explaining the assistant is gone.
- **TC-1038**: the opening message and conversation starters are saved but never shown in New Chat.

### Auth UX
- **AUTH-004**: login ignores `callbackUrl`, so you always land on `/dashboard/chat`.
- **AUTH-008**: one generic validation message for every case. The password policy is only a minimum of 8 characters.
- **AUTH-009**: re-registering an existing email returns 201 "created" (nothing is created, but the message is wrong).
- **AUTH-017**: `authorize()` doesn't lowercase or trim the email, so `Nama@gmail.com` (mobile auto-capitalisation) can't log in.
- **AUTH-044**: malformed JSON returns 500 instead of 400 on 3 auth endpoints.
- **AUTH-049, AUTH-050**: the Terms/Privacy links open in the same tab and wipe the sign-up form, and the legal pages have no way back.
- **ACC-007**: there's no change-password feature (only Forgot password).
- **TC-1265**: reset tokens work. The only remaining issue is AUTH-041 (old sessions survive a reset).

### Billing and organisations
- **TC-1237**: the total shown excludes VAT (Rp25.000 shown, Rp27.750 charged), and an abandoned purchase can't be cancelled in the app.
- **TC-1253**: NPWP (tax ID) is not validated (`ABC` is accepted), yet it's printed on invoices.
- **TC-1244, TC-1380**: the 30-day per-model breakdown and the 14-day daily chart are missing from the usage page.
- **TC-1388**: Settings → Analytics actually shows Memory management.
- **TC-1286**: there's no members UI, and invites are accepted immediately without the invitee's consent.

### Workflows
- **TC-1118**: the `apiEnabled=false` filter is ignored.
- **TC-1124**: an export/import round trip loses mode, category and tags.
- **TC-1650**: a cyclic graph passes UI validation, then the server returns 500 and the UI shows nothing.
- **TC-1651**: HTTP 404 is treated as success, and the retry trace doesn't record attempts or the URL.
- **TC-1652**: invalid enum values return 500 (Prisma error) instead of 400.
- **TC-1655**: invalid cron expressions are saved and never run, with no error shown.
- **TC-1661**: import accepts malformed nodes/edges and saves a broken workflow.
- **TC-1665**: Delete in the builder has no confirmation.
- **TC-1675**: Duplicate drops mode, category and tags, and Redo doesn't work.
- **TC-1676**: the sidebar doesn't show a new workflow until refresh.
- **TC-1106**: marked Fail, but the finding says "Tidak ada temuan" ("no findings"). Fix the Lark row.

### Design (Od)
- **TC-1412**: the picker shows a model but sends `model:null`, the error leaks the `MINIMAX_API_KEY` env name, and user messages are saved twice.
- **TC-1414**: Chat mode still writes the artifact on the server.
- **TC-1418**: every artifact tab switch refetches 3 files (no keep-alive), and the project opens on the last file instead of `index.html`.
- **TC-1424**: the code view has no syntax highlighting.
- **TC-1434**: template count is 153 in the API, 57 in the UI and 123 in the acceptance criteria. "Save as template…" is shown even though it returns 405.
- **TC-1438, TC-1638**: PDF export never finishes (the server route returns 501, and the client fallback produces no file).
- **TC-1442**: question-form draft answers are lost on refresh.
- **TC-1452, TC-1456, TC-1462**: plugins, routines and deploy were set N/A ("not in cloud") on 2026-10-14, but the UI still shows them, with Run returning 501 and the deploy modal missing. Hide them or ship them.
- **TC-1552 †**: the notebook artifact panel doesn't refresh after an update.

### Media Studio
- **TC-1682**: parameters aren't validated on the server (count 10, negative width and speed 99 reach the provider), and raw provider JSON is shown to the user.
- **TC-1683**: modality and model aren't cross-checked (`AUDIO + rantai/canvas` calls TTS with an image model).
- **TC-1198, TC-1200, TC-1202**: dimension and duration metadata is missing; otherwise these work.
- **TC-1686**: a hydration error on every load, because the seed is generated with `Math.random()` during render.

### Marketplace, widget, infra
- **TC-1180**: the seed has 8 builtin tools and 10 MCP servers, while the acceptance criteria say 12 and about 15. Fix the spec or the seed.
- **TC-1182**: reinstalling returns 201 instead of 200 (it is idempotent).
- **TC-1186**: the Translator community skill installs with no tool attached.
- **TC-1346**: the domain whitelist works. Allow-all when the list is empty is by design; confirm and close.
- **TC-1474**: the custom server bootstrap matches the acceptance criteria. Read the Lark row for the remaining nit.

---

## Not verified (Blocked / Deferred)

These are not known defects. Nobody has been able to run them. They need an
environment, not a code change, and they are the cases most likely to break
unnoticed during a migration.

| ID | What it needs |
|---|---|
| TC-1023, TC-1026, TC-1040, TC-1041 | A real LLM and SurrealDB (KB binding, the creation wizard, guard-rail enforcement, tool approval) |
| TC-1039 | Two accounts for the live-chat handoff flow |
| TC-1262 | Google/GitHub/Apple/Microsoft OAuth test credentials |
| TC-1426, TC-1634, TC-1440 | The Revideo pipeline (puppeteer + ffmpeg) and `MINIMAX_API_KEY` |
| SET-018 | Inconclusive: a *member* (not owner) could reach Midtrans checkout. Needs a dev decision on who may pay. |
| TC-1238, TC-1240, TC-1242, TC-1256 | A settled Midtrans sandbox transaction or cron access (invoices, cancel/resume, dunning, inbound webhook) |
| TC-1258 | A self-hosted deployment with `BILLING_ENABLED=false` |
| TC-1370, TC-1376 | The mobile app (mobile billing, mobile admin) |
| TC-1314, TC-1316, TC-1382 | The super-admin org, usage and platform-stats surfaces, which return 404 on prod |
| TC-1152 | ClawHub search (only reachable via Digital Employees, which are disabled in cloud) |

---

## Lark hygiene to fix alongside

- **Retest Status** is empty on all 479 Agents cases, so it can't be used to track anything.
- The 11 † cases have shipped fixes but no retest since 2026-10-01.
- The process rule "a Fail needs a linked fix Task" hasn't been audited. Check this against the Tasks table.
- Several rows log categories the select fields don't support ("not present as Base select options": Accessibility, Coverage, Lifecycle, Config). These need a decision from the CTO, not ad-hoc text.
- TC-1106 (Fail with no findings) and TC-1112 (Major with only a minor observation) look misclassified.
