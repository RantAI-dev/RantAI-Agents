# Test Strategy Design — RantAI-Agents

**Date**: 2026-03-17
**Status**: Approved
**Scope**: Comprehensive, fast, low-cost test suite for the full platform

## 1. Goals & Constraints

- **Comprehensive coverage**: ~130-140 tests across all critical modules
- **Fast execution**: Under 10 minutes total
- **Low cost**: No expensive external services; reuse existing Docker Compose Postgres
- **Real DB**: Integration tests use real Postgres (not SQLite) to match production behavior
- **No UI tests**: Skip React component/hook tests to avoid jsdom + @testing-library weight

## 2. Test Infrastructure

### Runner: Vitest

- ESM-first, Bun-compatible, fast parallel execution
- Vitest workspaces: `unit` pool (parallel), `integration` pool (sequential, shared DB)
- No snapshot tests

### Test Database

- Reuse existing `postgres:16` from Docker Compose
- Separate database: `horizonlife_test` (via `TEST_DATABASE_URL`)
- Schema sync: `prisma db push` in global setup
- Cleanup: `TRUNCATE ... CASCADE` all tables in `afterEach` for integration tests

### Dependencies to Install

```
devDependencies:
  vitest
  @faker-js/faker
```

### Directory Structure

```
tests/
├── vitest.config.ts        # Vitest configuration
├── setup.ts                # Global setup (DB connect, env)
├── helpers/
│   ├── db.ts               # Prisma test client, seed helpers, cleanup
│   └── fixtures.ts         # Factory functions for test data
├── unit/
│   ├── workflow/
│   │   ├── compiler.test.ts
│   │   └── engine.test.ts
│   ├── mcp/
│   │   ├── client.test.ts
│   │   └── tool-adapter.test.ts
│   ├── organization.test.ts
│   └── utils.test.ts
├── integration/
│   ├── api/
│   │   ├── tools.test.ts
│   │   ├── workflows.test.ts
│   │   ├── digital-employees.test.ts
│   │   └── organization.test.ts
│   ├── tools/
│   │   └── registry.test.ts
│   └── digital-employee/
│       └── package-generator.test.ts
```

### Scripts

```json
{
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:watch": "vitest watch",
  "test:coverage": "vitest run --coverage"
}
```

## 3. Module Coverage Plan

### 3.1 Pure Unit Tests (no DB, instant)

#### Workflow Compiler (~15 tests)
- **File**: `tests/unit/workflow/compiler.test.ts`
- **Source**: `lib/workflow/compiler.ts`
- **Functions**:
  - `compileWorkflow(nodes, edges)` — valid graph, cycles detection, disconnected nodes, multiple branches, empty graph, single node, complex DAG with parallel paths
  - `createStepLog(step, status, input, output?, error?, durationMs?)` — each status type (running, pending, completed, failed, paused), missing optional fields, with error. **Note**: `stepId` contains `Date.now()` timestamp — use `expect.stringMatching(/^step_/)` instead of exact equality

#### Workflow Engine (~10 tests)
- **File**: `tests/unit/workflow/engine.test.ts`
- **Source**: `lib/workflow/engine.ts`
- **Functions**:
  - `extractTokenUsage(output)` — LLM output format, Agent output format, Stream output format, missing fields, undefined input, partial fields. **Note**: returns `undefined` when both promptTokens and completionTokens are 0 (not a zero-valued struct) — test "zero tokens returns undefined"
  - NODE_HANDLERS — verify all expected node types are registered (Trigger, Agent, LLM, Tool, Condition, Loop, etc.)

#### Organization Permissions (~6 tests)
- **File**: `tests/unit/organization.test.ts`
- **Source**: `lib/organization.ts`
- **Functions**:
  - `canEdit(role)` — owner=true, admin=true, member=true, viewer=false, guest=false, unknown=false
  - `canManage(role)` — owner=true, admin=true, member=false, viewer=false
  - `isOwner(role)` — owner=true, admin=false, member=false

#### MCP Client (~12 tests)
- **File**: `tests/unit/mcp/client.test.ts`
- **Source**: `lib/mcp/client.ts`
- **Functions**:
  - `resolveUrl(url, env)` — single placeholder, multiple placeholders, missing env key, no placeholders, empty env, lowercase key not matched (regex is `/\{([A-Z_][A-Z0-9_]*)\}/g` — only uppercase keys are substituted; `{apiKey}` is left as-is)
  - `McpClientManager` (mock transport) — connection pooling returns same client, disconnect removes from pool, `disconnectAll` clears pool, `listTools` delegates to client, `callTool` extracts text content, error handling on connection failure

#### MCP Tool Adapter (~6 tests)
- **File**: `tests/unit/mcp/tool-adapter.test.ts`
- **Source**: `lib/mcp/tool-adapter.ts`
- **Functions**:
  - `adaptMcpToolsToAiSdk(serverConfig, mcpTools)` — tool naming `mcp_{serverId}_{toolName}`, schema passthrough from MCP to AI SDK, empty tool list, error wrapping in execute, description passthrough

#### Tool Schema Builder (~8 tests)
- **File**: `tests/integration/tools/registry.test.ts` (tested indirectly via workflow-as-tool resolution)
- **Source**: `lib/tools/registry.ts`
- **Note**: `buildWorkflowToolSchema` is **not exported** — cannot be unit tested directly. Test indirectly through `resolveToolsForAssistant` workflow-as-tool path.
- **Scenarios**: workflow with string/number/boolean variables, null variables, empty variables, mixed types, required vs optional fields — verified via the generated tool's `parameters` schema

#### Utils (~4 tests)
- **File**: `tests/unit/utils.test.ts`
- **Source**: `lib/utils.ts`
- **Functions**:
  - `cn()` — merge classes, conflict resolution (e.g., `cn("p-4", "p-2")` → `"p-2"`)
  - `getTagColor(tag)` — deterministic hash-based fallback (same tag → same color), different tags can differ. **Note**: `localStorage` branch is not exercisable without jsdom — tests cover the hash fallback path only

**Subtotal: ~53 unit tests** (8 schema builder tests moved to integration)

### 3.2 Integration Tests (real Postgres)

#### Organization Context (~10 tests)
- **File**: `tests/integration/api/organization.test.ts`
- **Source**: `lib/organization.ts`
- **Functions**:
  - `getOrganizationContext(request, userId)` — valid header + accepted member, missing header returns null, user not a member returns null, pending invite (no acceptedAt) returns null, invalid org ID
  - `getOrganizationContextWithFallback(request, userId)` — header present uses it, no header falls back to first org, user with no orgs returns null, user with multiple orgs picks first accepted

#### Tool Registry (~23 tests, includes schema builder scenarios)
- **File**: `tests/integration/tools/registry.test.ts`
- **Source**: `lib/tools/registry.ts`
- **Functions**:
  - `resolveToolsForAssistant(assistantId, modelId, context)`:
    - Resolves builtin tools when enabled
    - Resolves custom tools with HTTP execution config
    - Resolves MCP tools via AssistantTool binding (mock MCP transport)
    - Resolves MCP tools via AssistantMcpServer binding (server-level, all tools from server)
    - Deduplication: AssistantMcpServer does not overwrite tools already registered via AssistantTool
    - Resolves community tools with userConfig from InstalledSkill binding
    - Resolves workflow-as-tool with correct schema
    - Returns empty when no tools bound
    - Skips tools when model lacks function calling capability
    - Handles mixed tool categories in single resolution
    - Error in one tool doesn't block others
  - `buildWorkflowToolSchema` (tested indirectly via workflow-as-tool):
    - Workflow with string/number/boolean variables produces correct JSON schema
    - Null variables produces empty parameters
    - Mixed required/optional variable handling
  - `logToolExecution()` — creates DB record on success, creates DB record with error field, records duration

#### Package Generator (~9 tests)
- **File**: `tests/integration/digital-employee/package-generator.test.ts`
- **Source**: `lib/digital-employee/package-generator.ts`
- **Functions**:
  - `generateEmployeePackage(employeeId)`:
    - Full package with tools, skills, channels
    - Employee with no integrations returns package with empty channels/tools
    - Employee with no assistant — **throws** `"Employee or assistant not found"`
    - Credential decryption for channel integrations
    - Coworker listing (excludes self)
    - Read-only files (TOOLS.md) regenerated from current state
    - Workspace file context includes all metadata
    - Syncs regenerated files back to DB
    - Handles missing/invalid encrypted credentials gracefully (logs error, skips)

#### API Routes (~25 tests)
- **File**: `tests/integration/api/tools.test.ts`
  - Tools CRUD: create tool, list tools, update tool, delete tool
  - Org isolation: user A cannot see user B's org tools
  - Auth: 401 without session

- **File**: `tests/integration/api/workflows.test.ts`
  - Workflows: create, list, org scoping
  - Auth: 401 without session

- **File**: `tests/integration/api/digital-employees.test.ts`
  - Digital employees: list, deployment config retrieval
  - Auth: 401 without session

**Subtotal: ~67 integration tests**

### Total: ~120 tests

## 4. Test Data Fixtures

Factory functions in `tests/helpers/fixtures.ts`:

```typescript
createTestUser(overrides?: Partial<User>): Promise<User>
createTestOrg(overrides?: Partial<Organization>): Promise<Organization>
createTestMembership(userId, orgId, role?, overrides?): Promise<OrganizationMember>
createTestAssistant(orgId, overrides?): Promise<Assistant>
createTestTool(orgId, overrides?): Promise<Tool>
createTestWorkflow(orgId, overrides?): Promise<Workflow>
createTestEmployee(orgId, assistantId, overrides?): Promise<DigitalEmployee>
createTestIntegration(employeeId, integrationId, overrides?): Promise<EmployeeIntegration>
```

Each factory:
- Has sensible defaults (faker-generated names, emails, etc.)
- Accepts overrides for any field
- Returns the created DB record
- Auto-cleaned via table truncation in `afterEach`

## 5. Conventions

### Naming
- Describe behavior: `"returns null when user is not a member"`
- Not implementation: `"test getOrganizationContext case 3"`

### File colocation
- Tests mirror source: `lib/workflow/compiler.ts` → `tests/unit/workflow/compiler.test.ts`

### Mocking rules
- Mock external I/O only: Docker API, MCP transports, Socket.io, HTTP fetch
- Never mock Prisma in integration tests — use real DB
- Unit tests can mock Prisma via `vi.mock()` when testing logic around queries

### DB cleanup
- `TRUNCATE ... CASCADE` all tables in `afterEach` for integration tests
- Global setup: `prisma db push` to sync schema
- Global teardown: disconnect Prisma client

### No snapshot tests
- High maintenance burden, break on trivial changes

### No UI component tests
- Skip React components and hooks
- Avoids jsdom + @testing-library/react dependency weight

## 6. Estimated Runtime

| Suite | Tests | Time |
|-------|-------|------|
| Unit tests (parallel) | ~53 | ~5-10s |
| Integration tests (sequential) | ~67 | ~3-5 min |
| **Total** | **~120** | **~4-6 min** |

## 7. CI Integration

Single command: `bun run test`

Future additions (not in scope):
- Coverage thresholds
- PR gate (block merge on test failure)
- Separate CI jobs for unit vs integration
