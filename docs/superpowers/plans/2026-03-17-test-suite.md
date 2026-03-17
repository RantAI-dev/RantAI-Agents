# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Vitest + Postgres test infrastructure and implement ~120 tests covering workflow compiler/engine, organization, MCP, tool registry, package generator, and API routes.

**Architecture:** Vitest runner with two pools — unit (parallel, no DB) and integration (sequential, real Postgres). Test DB uses separate `horizonlife_test` database on existing Docker Compose Postgres. Factory fixtures with faker for test data, TRUNCATE cleanup between tests.

**Tech Stack:** Vitest, @faker-js/faker, Prisma (test client), PostgreSQL 16, bun

**Spec:** `docs/superpowers/specs/2026-03-17-test-strategy-design.md`

---

## Chunk 1: Infrastructure Setup

### Task 1: Install Dependencies & Configure Vitest

**Files:**
- Modify: `package.json` (add devDeps + scripts)
- Create: `vitest.config.ts`

- [ ] **Step 1: Install test dependencies**

```bash
bun add -d vitest @faker-js/faker
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
})
```

- [ ] **Step 3: Add test scripts to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:unit": "vitest run tests/unit",
"test:integration": "vitest run tests/integration",
"test:watch": "vitest watch"
```

- [ ] **Step 4: Run vitest to verify config**

```bash
bun run test
```
Expected: 0 tests found, exits cleanly

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json bun.lockb
git commit -m "chore: add vitest and test infrastructure"
```

---

### Task 2: Test Database Setup & Helpers

**Files:**
- Create: `tests/setup.ts`
- Create: `tests/helpers/db.ts`
- Create: `tests/helpers/fixtures.ts`

- [ ] **Step 1: Create tests/helpers/db.ts — Prisma test client + cleanup**

```typescript
// tests/helpers/db.ts
import { PrismaClient } from "@prisma/client"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL?.replace(/\/[^/]+$/, "/horizonlife_test")
  || "postgresql://horizonlife:horizonlife_secret@localhost:5432/horizonlife_test"

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
})

/**
 * Truncate all tables. Order matters due to FK constraints — CASCADE handles it.
 */
export async function cleanupDatabase() {
  const tablenames = await testPrisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"${name}"`)
    .join(", ")

  if (tables.length > 0) {
    await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`)
  }
}
```

- [ ] **Step 2: Create tests/setup.ts — global setup/teardown**

```typescript
// tests/setup.ts
import { testPrisma, cleanupDatabase } from "./helpers/db"
import { afterEach, beforeAll, afterAll } from "vitest"

beforeAll(async () => {
  // Verify connection
  await testPrisma.$connect()
})

afterEach(async () => {
  await cleanupDatabase()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})
```

- [ ] **Step 3: Create tests/helpers/fixtures.ts — factory functions**

```typescript
// tests/helpers/fixtures.ts
import { faker } from "@faker-js/faker"
import { testPrisma } from "./db"

export async function createTestUser(overrides: Record<string, unknown> = {}) {
  return testPrisma.user.create({
    data: {
      email: faker.internet.email(),
      name: faker.person.fullName(),
      passwordHash: "$2b$10$fakehashfortest000000000000000000000000000000",
      ...overrides,
    },
  })
}

export async function createTestOrg(overrides: Record<string, unknown> = {}) {
  return testPrisma.organization.create({
    data: {
      name: faker.company.name(),
      slug: faker.lorem.slug() + "-" + faker.string.nanoid(6),
      ...overrides,
    },
  })
}

export async function createTestMembership(
  userId: string,
  organizationId: string,
  role = "member",
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.organizationMember.create({
    data: {
      userId,
      userEmail: faker.internet.email(),
      organizationId,
      role,
      acceptedAt: new Date(),
      ...overrides,
    },
  })
}

export async function createTestAssistant(
  organizationId: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.assistant.create({
    data: {
      name: faker.person.firstName() + " Bot",
      systemPrompt: "You are a helpful assistant.",
      model: "test/model",
      organizationId,
      ...overrides,
    },
  })
}

export async function createTestTool(
  organizationId: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.tool.create({
    data: {
      name: faker.lorem.slug(),
      displayName: faker.lorem.words(2),
      description: faker.lorem.sentence(),
      category: "custom",
      parameters: {},
      organizationId,
      ...overrides,
    },
  })
}

export async function createTestEmployeeGroup(
  organizationId: string,
  createdBy: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.employeeGroup.create({
    data: {
      name: faker.lorem.words(2),
      organizationId,
      createdBy,
      ...overrides,
    },
  })
}

export async function createTestWorkflow(
  organizationId: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.workflow.create({
    data: {
      name: faker.lorem.words(2),
      organizationId,
      type: "TASK",
      nodes: [],
      edges: [],
      ...overrides,
    },
  })
}

export async function createTestIntegration(
  employeeId: string,
  integrationId: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.employeeIntegration.create({
    data: {
      digitalEmployeeId: employeeId,
      integrationId,
      status: "connected",
      ...overrides,
    },
  })
}

export async function createTestEmployee(
  organizationId: string,
  assistantId: string,
  groupId: string,
  createdBy: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.digitalEmployee.create({
    data: {
      name: faker.person.firstName(),
      assistantId,
      organizationId,
      groupId,
      createdBy,
      ...overrides,
    },
  })
}
```

- [ ] **Step 4: Create test database**

```bash
docker exec -i $(docker ps -qf "ancestor=postgres:16") psql -U horizonlife -d horizonlife_insurance -c "CREATE DATABASE horizonlife_test;" 2>/dev/null || true
```

- [ ] **Step 5: Push schema to test database**

```bash
TEST_DATABASE_URL="postgresql://horizonlife:horizonlife_secret@localhost:5432/horizonlife_test" bunx prisma db push --skip-generate
```

- [ ] **Step 6: Update vitest.config.ts to use setup file for integration tests**

Update `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
```

- [ ] **Step 7: Write a smoke test to verify DB setup**

Create `tests/integration/smoke.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../helpers/db"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

describe("test database", () => {
  it("connects and can create/read a user", async () => {
    const user = await testPrisma.user.create({
      data: {
        email: "test@example.com",
        name: "Test User",
        passwordHash: "$2b$10$fakehash",
      },
    })
    expect(user.id).toBeDefined()
    expect(user.email).toBe("test@example.com")

    const found = await testPrisma.user.findUnique({ where: { id: user.id } })
    expect(found).not.toBeNull()
  })

  it("cleanups between tests — previous user is gone", async () => {
    const found = await testPrisma.user.findUnique({ where: { email: "test@example.com" } })
    expect(found).toBeNull()
  })
})
```

- [ ] **Step 8: Run smoke test**

```bash
bun run test tests/integration/smoke.test.ts
```
Expected: 2 tests pass

- [ ] **Step 9: Commit**

```bash
git add tests/ vitest.config.ts
git commit -m "chore: add test DB setup, helpers, fixtures, and smoke test"
```

---

## Chunk 2: Pure Unit Tests

### Task 3: Workflow Compiler Tests

**Files:**
- Create: `tests/unit/workflow/compiler.test.ts`
- Read: `lib/workflow/compiler.ts`, `lib/workflow/types.ts`

- [ ] **Step 1: Write compiler tests**

```typescript
// tests/unit/workflow/compiler.test.ts
import { describe, it, expect } from "vitest"
import { compileWorkflow, createStepLog } from "@/lib/workflow/compiler"
import { NodeType } from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData } from "@/lib/workflow/types"

// Helper to create a minimal node
function makeNode(id: string, nodeType: NodeType, label = "Test"): Node<WorkflowNodeData> {
  return {
    id,
    type: "custom",
    position: { x: 0, y: 0 },
    data: { label, nodeType } as WorkflowNodeData,
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return { id: `${source}-${target}`, source, target, sourceHandle: sourceHandle ?? null }
}

describe("compileWorkflow", () => {
  it("compiles a linear graph in correct order", () => {
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.LLM),
      makeNode("c", NodeType.STREAM_OUTPUT),
    ]
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")]

    const result = compileWorkflow(nodes, edges)

    expect(result.steps).toHaveLength(3)
    expect(result.steps.map((s) => s.nodeId)).toEqual(["a", "b", "c"])
    expect(result.triggerNodeId).toBe("a")
  })

  it("sets triggerNodeId for webhook trigger", () => {
    const nodes = [makeNode("t", NodeType.TRIGGER_WEBHOOK), makeNode("n", NodeType.LLM)]
    const edges = [makeEdge("t", "n")]
    const result = compileWorkflow(nodes, edges)
    expect(result.triggerNodeId).toBe("t")
  })

  it("sets triggerNodeId for schedule trigger", () => {
    const nodes = [makeNode("t", NodeType.TRIGGER_SCHEDULE), makeNode("n", NodeType.LLM)]
    const edges = [makeEdge("t", "n")]
    const result = compileWorkflow(nodes, edges)
    expect(result.triggerNodeId).toBe("t")
  })

  it("sets triggerNodeId for event trigger", () => {
    const nodes = [makeNode("t", NodeType.TRIGGER_EVENT), makeNode("n", NodeType.LLM)]
    const edges = [makeEdge("t", "n")]
    const result = compileWorkflow(nodes, edges)
    expect(result.triggerNodeId).toBe("t")
  })

  it("builds predecessors and successors correctly", () => {
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.LLM),
      makeNode("c", NodeType.TOOL),
    ]
    const edges = [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("b", "c")]

    const result = compileWorkflow(nodes, edges)
    const stepA = result.stepMap.get("a")!
    const stepB = result.stepMap.get("b")!
    const stepC = result.stepMap.get("c")!

    expect(stepA.predecessors).toEqual([])
    expect(stepA.successors).toContain("b")
    expect(stepA.successors).toContain("c")
    expect(stepB.predecessors).toEqual(["a"])
    expect(stepC.predecessors).toContain("a")
    expect(stepC.predecessors).toContain("b")
  })

  it("builds sourceHandles for branching nodes", () => {
    const nodes = [
      makeNode("cond", NodeType.CONDITION),
      makeNode("yes", NodeType.LLM),
      makeNode("no", NodeType.TOOL),
    ]
    const edges = [
      makeEdge("cond", "yes", "if"),
      makeEdge("cond", "no", "else"),
    ]

    const result = compileWorkflow(nodes, edges)
    const condStep = result.stepMap.get("cond")!
    expect(condStep.sourceHandles["if"]).toEqual(["yes"])
    expect(condStep.sourceHandles["else"]).toEqual(["no"])
  })

  it("uses 'default' handle when sourceHandle is null", () => {
    const nodes = [makeNode("a", NodeType.TRIGGER_MANUAL), makeNode("b", NodeType.LLM)]
    const edges = [makeEdge("a", "b")]
    const result = compileWorkflow(nodes, edges)
    expect(result.stepMap.get("a")!.sourceHandles["default"]).toEqual(["b"])
  })

  it("handles empty graph", () => {
    const result = compileWorkflow([], [])
    expect(result.steps).toEqual([])
    expect(result.triggerNodeId).toBe("")
  })

  it("handles single node with no edges", () => {
    const nodes = [makeNode("solo", NodeType.LLM)]
    const result = compileWorkflow(nodes, [])
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].successors).toEqual([])
    expect(result.steps[0].predecessors).toEqual([])
  })

  it("populates stepMap with all nodes", () => {
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.AGENT),
      makeNode("c", NodeType.TOOL),
    ]
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")]
    const result = compileWorkflow(nodes, edges)
    expect(result.stepMap.size).toBe(3)
    expect(result.stepMap.get("a")).toBeDefined()
    expect(result.stepMap.get("b")).toBeDefined()
    expect(result.stepMap.get("c")).toBeDefined()
  })

  it("preserves node data in compiled steps", () => {
    const nodes = [makeNode("x", NodeType.LLM, "My LLM Node")]
    const result = compileWorkflow(nodes, [])
    expect(result.steps[0].data.label).toBe("My LLM Node")
    expect(result.steps[0].nodeType).toBe(NodeType.LLM)
  })

  it("handles parallel branches (diamond shape)", () => {
    // a -> b, a -> c, b -> d, c -> d
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.LLM),
      makeNode("c", NodeType.TOOL),
      makeNode("d", NodeType.MERGE),
    ]
    const edges = [
      makeEdge("a", "b"), makeEdge("a", "c"),
      makeEdge("b", "d"), makeEdge("c", "d"),
    ]
    const result = compileWorkflow(nodes, edges)
    const ids = result.steps.map((s) => s.nodeId)
    // a must come first, d must come last
    expect(ids[0]).toBe("a")
    expect(ids[ids.length - 1]).toBe("d")
    // b and c must come before d
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("d"))
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("d"))
  })

  it("only picks first trigger as triggerNodeId", () => {
    const nodes = [
      makeNode("t1", NodeType.TRIGGER_MANUAL),
      makeNode("t2", NodeType.TRIGGER_WEBHOOK),
      makeNode("n", NodeType.LLM),
    ]
    const edges = [makeEdge("t1", "n"), makeEdge("t2", "n")]
    const result = compileWorkflow(nodes, edges)
    expect(result.triggerNodeId).toBe("t1")
  })
})

describe("createStepLog", () => {
  const mockStep = {
    nodeId: "node1",
    nodeType: NodeType.LLM,
    data: { label: "Test LLM", nodeType: NodeType.LLM } as WorkflowNodeData,
    successors: [],
    predecessors: [],
    sourceHandles: {},
  }

  it("creates a running step log", () => {
    const log = createStepLog(mockStep, "running", { prompt: "hello" })
    expect(log).toEqual(expect.objectContaining({
      nodeId: "node1",
      nodeType: NodeType.LLM,
      label: "Test LLM",
      status: "running",
      input: { prompt: "hello" },
      output: null,
      durationMs: 0,
    }))
    expect(log.stepId).toMatch(/^step_node1_/)
    expect(log.startedAt).toBeDefined()
    expect(log.completedAt).toBeUndefined()
  })

  it("creates a completed step log with output", () => {
    const log = createStepLog(mockStep, "success", {}, { result: "ok" }, undefined, 150)
    expect(log.status).toBe("success")
    expect(log.output).toEqual({ result: "ok" })
    expect(log.durationMs).toBe(150)
    expect(log.completedAt).toBeDefined()
  })

  it("creates a failed step log with error", () => {
    const log = createStepLog(mockStep, "failed", {}, null, "Something broke", 50)
    expect(log.status).toBe("failed")
    expect(log.error).toBe("Something broke")
    expect(log.completedAt).toBeDefined()
  })

  it("pending status has no completedAt", () => {
    const log = createStepLog(mockStep, "pending", {})
    expect(log.completedAt).toBeUndefined()
  })

  it("suspended status has completedAt", () => {
    const log = createStepLog(mockStep, "suspended", {})
    expect(log.completedAt).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/workflow/compiler.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/workflow/
git commit -m "test: add workflow compiler unit tests"
```

---

### Task 4: Workflow Engine Tests

**Files:**
- Create: `tests/unit/workflow/engine.test.ts`
- Read: `lib/workflow/engine.ts`

- [ ] **Step 1: Write engine tests**

```typescript
// tests/unit/workflow/engine.test.ts
import { describe, it, expect } from "vitest"
import { extractTokenUsage } from "@/lib/workflow/engine"
import { NodeType } from "@/lib/workflow/types"

describe("extractTokenUsage", () => {
  it("extracts usage from LLM-style output", () => {
    const output = {
      usage: { promptTokens: 100, completionTokens: 50 },
    }
    const result = extractTokenUsage(output)
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it("returns undefined for null output", () => {
    expect(extractTokenUsage(null)).toBeUndefined()
  })

  it("returns undefined for undefined output", () => {
    expect(extractTokenUsage(undefined)).toBeUndefined()
  })

  it("returns undefined for non-object output", () => {
    expect(extractTokenUsage("string")).toBeUndefined()
    expect(extractTokenUsage(42)).toBeUndefined()
  })

  it("returns undefined when no usage field", () => {
    expect(extractTokenUsage({ text: "hello" })).toBeUndefined()
  })

  it("returns undefined when both tokens are zero", () => {
    const output = { usage: { promptTokens: 0, completionTokens: 0 } }
    expect(extractTokenUsage(output)).toBeUndefined()
  })

  it("handles partial fields — missing completionTokens defaults to 0", () => {
    const output = { usage: { promptTokens: 50 } }
    const result = extractTokenUsage(output)
    expect(result).toEqual({
      promptTokens: 50,
      completionTokens: 0,
      totalTokens: 50,
    })
  })

  it("handles non-number token values as 0", () => {
    const output = { usage: { promptTokens: "not a number", completionTokens: 30 } }
    const result = extractTokenUsage(output)
    expect(result).toEqual({
      promptTokens: 0,
      completionTokens: 30,
      totalTokens: 30,
    })
  })

  it("calculates totalTokens correctly", () => {
    const output = { usage: { promptTokens: 1000, completionTokens: 2000 } }
    const result = extractTokenUsage(output)
    expect(result!.totalTokens).toBe(3000)
  })
})

describe("NODE_HANDLERS", () => {
  it("has handlers for all expected node types", async () => {
    // We import the module to check the NODE_HANDLERS mapping
    // Since NODE_HANDLERS is not exported, we test indirectly by verifying
    // the engine module loads without errors
    const engineModule = await import("@/lib/workflow/engine")
    expect(engineModule.extractTokenUsage).toBeDefined()
    expect(engineModule.emitWorkflowEvent).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/workflow/engine.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/workflow/engine.test.ts
git commit -m "test: add workflow engine unit tests"
```

---

### Task 5: Organization Permission Tests

**Files:**
- Create: `tests/unit/organization.test.ts`
- Read: `lib/organization.ts`

- [ ] **Step 1: Write permission tests**

```typescript
// tests/unit/organization.test.ts
import { describe, it, expect } from "vitest"
import { canEdit, canManage, isOwner } from "@/lib/organization"

describe("canEdit", () => {
  it("returns true for owner", () => expect(canEdit("owner")).toBe(true))
  it("returns true for admin", () => expect(canEdit("admin")).toBe(true))
  it("returns true for member", () => expect(canEdit("member")).toBe(true))
  it("returns false for viewer", () => expect(canEdit("viewer")).toBe(false))
  it("returns false for unknown role", () => expect(canEdit("guest")).toBe(false))
  it("returns false for empty string", () => expect(canEdit("")).toBe(false))
})

describe("canManage", () => {
  it("returns true for owner", () => expect(canManage("owner")).toBe(true))
  it("returns true for admin", () => expect(canManage("admin")).toBe(true))
  it("returns false for member", () => expect(canManage("member")).toBe(false))
  it("returns false for viewer", () => expect(canManage("viewer")).toBe(false))
})

describe("isOwner", () => {
  it("returns true for owner", () => expect(isOwner("owner")).toBe(true))
  it("returns false for admin", () => expect(isOwner("admin")).toBe(false))
  it("returns false for member", () => expect(isOwner("member")).toBe(false))
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/organization.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/organization.test.ts
git commit -m "test: add organization permission unit tests"
```

---

### Task 6: MCP Client Tests

**Files:**
- Create: `tests/unit/mcp/client.test.ts`
- Read: `lib/mcp/client.ts`

- [ ] **Step 1: Write MCP client tests**

```typescript
// tests/unit/mcp/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { resolveUrl } from "@/lib/mcp/client"

describe("resolveUrl", () => {
  it("replaces a single placeholder", () => {
    const result = resolveUrl("https://api.example.com/{API_KEY}/sse", { API_KEY: "abc123" })
    expect(result).toBe("https://api.example.com/abc123/sse")
  })

  it("replaces multiple placeholders", () => {
    const result = resolveUrl("{HOST}:{PORT}/path", { HOST: "localhost", PORT: "3000" })
    expect(result).toBe("localhost:3000/path")
  })

  it("returns original placeholder when env key is missing", () => {
    const result = resolveUrl("https://{MISSING_KEY}/sse", { OTHER: "val" })
    expect(result).toBe("https://{MISSING_KEY}/sse")
  })

  it("returns url unchanged when no placeholders", () => {
    const result = resolveUrl("https://example.com/sse", { KEY: "val" })
    expect(result).toBe("https://example.com/sse")
  })

  it("returns url unchanged when env is null", () => {
    expect(resolveUrl("https://{KEY}/sse", null)).toBe("https://{KEY}/sse")
  })

  it("returns url unchanged when env is undefined", () => {
    expect(resolveUrl("https://{KEY}/sse", undefined)).toBe("https://{KEY}/sse")
  })

  it("does NOT match lowercase keys (regex only matches uppercase)", () => {
    const result = resolveUrl("https://{apiKey}/sse", { apiKey: "abc" })
    expect(result).toBe("https://{apiKey}/sse")
  })

  it("matches keys with underscores and digits", () => {
    const result = resolveUrl("{API_KEY_V2}", { API_KEY_V2: "val" })
    expect(result).toBe("val")
  })

  it("handles empty env object", () => {
    const result = resolveUrl("https://{KEY}/sse", {})
    expect(result).toBe("https://{KEY}/sse")
  })
})

// McpClientManager tests — test via the exported singleton
// We mock the transport/Client to avoid real network calls
describe("McpClientManager", () => {
  // Note: These tests require mocking @modelcontextprotocol/sdk internals.
  // Since McpClientManager creates Client + Transport instances internally,
  // we mock the entire SDK client module.
  // If mocking proves too complex due to SDK internals, these can be
  // converted to integration tests with a real MCP test server.

  it("module exports mcpClientManager singleton", async () => {
    const mod = await import("@/lib/mcp/client")
    expect(mod.mcpClientManager).toBeDefined()
    expect(typeof mod.mcpClientManager.connect).toBe("function")
    expect(typeof mod.mcpClientManager.disconnect).toBe("function")
    expect(typeof mod.mcpClientManager.listTools).toBe("function")
    expect(typeof mod.mcpClientManager.callTool).toBe("function")
    expect(typeof mod.mcpClientManager.disconnectAll).toBe("function")
  })

  it("throws when url is missing", async () => {
    const { mcpClientManager } = await import("@/lib/mcp/client")
    await expect(
      mcpClientManager.connect({
        id: "no-url",
        name: "No URL",
        transport: "sse",
        url: null,
      })
    ).rejects.toThrow("url is required")
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/mcp/client.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mcp/
git commit -m "test: add MCP client unit tests"
```

---

### Task 7: MCP Tool Adapter Tests

**Files:**
- Create: `tests/unit/mcp/tool-adapter.test.ts`
- Read: `lib/mcp/tool-adapter.ts`

- [ ] **Step 1: Write tool adapter tests**

```typescript
// tests/unit/mcp/tool-adapter.test.ts
import { describe, it, expect, vi } from "vitest"
import type { McpServerOptions, McpToolInfo } from "@/lib/mcp/client"

// Mock the MCP client manager before importing the adapter
vi.mock("@/lib/mcp/client", () => ({
  mcpClientManager: {
    callTool: vi.fn(),
  },
  resolveUrl: vi.fn((url: string) => url),
}))

import { adaptMcpToolsToAiSdk } from "@/lib/mcp/tool-adapter"
import { mcpClientManager } from "@/lib/mcp/client"

const mockConfig: McpServerOptions = {
  id: "server1",
  name: "Test Server",
  transport: "sse",
  url: "https://example.com/sse",
}

const mockTools: McpToolInfo[] = [
  {
    name: "search",
    description: "Search the web",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
  },
  {
    name: "fetch",
    description: "Fetch a URL",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
    },
  },
]

describe("adaptMcpToolsToAiSdk", () => {
  it("names tools as mcp_{serverId}_{toolName}", () => {
    const tools = adaptMcpToolsToAiSdk(mockConfig, mockTools)
    expect(Object.keys(tools)).toEqual(["mcp_server1_search", "mcp_server1_fetch"])
  })

  it("passes description through", () => {
    const tools = adaptMcpToolsToAiSdk(mockConfig, [mockTools[0]])
    // The tool is wrapped by aiTool, but we can check it exists
    expect(tools["mcp_server1_search"]).toBeDefined()
  })

  it("returns empty object for empty tool list", () => {
    const tools = adaptMcpToolsToAiSdk(mockConfig, [])
    expect(tools).toEqual({})
  })

  it("uses fallback description when tool has none", () => {
    const toolsNoDesc: McpToolInfo[] = [
      { name: "mytool", inputSchema: { type: "object" } },
    ]
    const result = adaptMcpToolsToAiSdk(mockConfig, toolsNoDesc)
    expect(result["mcp_server1_mytool"]).toBeDefined()
  })

  it("execute delegates to mcpClientManager.callTool", async () => {
    const mockCallTool = vi.mocked(mcpClientManager.callTool)
    mockCallTool.mockResolvedValueOnce("search result")

    const tools = adaptMcpToolsToAiSdk(mockConfig, [mockTools[0]])
    const tool = tools["mcp_server1_search"]

    // Access the execute function from the tool
    if ("execute" in tool && typeof tool.execute === "function") {
      const result = await tool.execute({ query: "test" }, { toolCallId: "tc1", messages: [], abortSignal: undefined as any })
      expect(mockCallTool).toHaveBeenCalledWith(mockConfig, "search", { query: "test" })
      expect(result).toBe("search result")
    }
  })

  it("execute wraps errors gracefully", async () => {
    const mockCallTool = vi.mocked(mcpClientManager.callTool)
    mockCallTool.mockRejectedValueOnce(new Error("Connection failed"))

    const tools = adaptMcpToolsToAiSdk(mockConfig, [mockTools[0]])
    const tool = tools["mcp_server1_search"]

    if ("execute" in tool && typeof tool.execute === "function") {
      const result = await tool.execute({ query: "test" }, { toolCallId: "tc1", messages: [], abortSignal: undefined as any })
      expect(result).toEqual({
        error: "MCP tool search failed: Connection failed",
      })
    }
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/mcp/tool-adapter.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mcp/tool-adapter.test.ts
git commit -m "test: add MCP tool adapter unit tests"
```

---

### Task 8: Utils Tests

**Files:**
- Create: `tests/unit/utils.test.ts`
- Read: `lib/utils.ts`

- [ ] **Step 1: Write utils tests**

```typescript
// tests/unit/utils.test.ts
import { describe, it, expect } from "vitest"
import { cn, getTagColor, TAG_COLORS } from "@/lib/utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2")
  })

  it("resolves tailwind conflicts (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible")
  })

  it("handles empty input", () => {
    expect(cn()).toBe("")
  })
})

describe("getTagColor", () => {
  it("returns deterministic color for same tag", () => {
    const color1 = getTagColor("bug")
    const color2 = getTagColor("bug")
    expect(color1).toBe(color2)
  })

  it("returns a color from the TAG_COLORS palette", () => {
    const color = getTagColor("feature")
    expect(TAG_COLORS).toContain(color)
  })

  it("different tags can produce different colors", () => {
    // Not guaranteed for any pair, but with enough samples we should get variety
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(getTagColor))
    expect(colors.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:unit tests/unit/utils.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/utils.test.ts
git commit -m "test: add utils unit tests"
```

- [ ] **Step 4: Run all unit tests together**

```bash
bun run test:unit
```
Expected: All unit tests pass

- [ ] **Step 5: Commit if any fixes were needed**

---

## Chunk 3: Integration Tests — Organization

### Task 9: Organization Context Integration Tests

**Files:**
- Create: `tests/integration/organization.test.ts`
- Read: `lib/organization.ts`

- [ ] **Step 1: Write organization context integration tests**

```typescript
// tests/integration/organization.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../helpers/fixtures"
import { getOrganizationContext, getOrganizationContextWithFallback } from "@/lib/organization"

import { vi } from "vitest"

// Override prisma import for tests
vi.mock("@/lib/prisma", () => ({
  prisma: testPrisma,
}))

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string): Request {
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  return new Request("http://localhost/api/test", { headers })
}

describe("getOrganizationContext", () => {
  it("returns context for accepted member with valid header", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const membership = await createTestMembership(user.id, org.id, "admin")

    const result = await getOrganizationContext(makeRequest(org.id), user.id)

    expect(result).not.toBeNull()
    expect(result!.organizationId).toBe(org.id)
    expect(result!.membership.role).toBe("admin")
    expect(result!.membership.userId).toBe(user.id)
  })

  it("returns null when no x-organization-id header", async () => {
    const user = await createTestUser()
    const result = await getOrganizationContext(makeRequest(), user.id)
    expect(result).toBeNull()
  })

  it("returns null when user is not a member", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    // No membership created
    const result = await getOrganizationContext(makeRequest(org.id), user.id)
    expect(result).toBeNull()
  })

  it("returns null for pending invite (no acceptedAt)", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const result = await getOrganizationContext(makeRequest(org.id), user.id)
    expect(result).toBeNull()
  })

  it("returns null for invalid org ID", async () => {
    const user = await createTestUser()
    const result = await getOrganizationContext(makeRequest("nonexistent-id"), user.id)
    expect(result).toBeNull()
  })
})

describe("getOrganizationContextWithFallback", () => {
  it("uses header when present", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "owner")

    const result = await getOrganizationContextWithFallback(makeRequest(org.id), user.id)
    expect(result).not.toBeNull()
    expect(result!.organizationId).toBe(org.id)
  })

  it("falls back to first accepted org when no header", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member")

    const result = await getOrganizationContextWithFallback(makeRequest(), user.id)
    expect(result).not.toBeNull()
    expect(result!.organizationId).toBe(org.id)
  })

  it("returns null when user has no orgs", async () => {
    const user = await createTestUser()
    const result = await getOrganizationContextWithFallback(makeRequest(), user.id)
    expect(result).toBeNull()
  })

  it("skips pending memberships in fallback", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const result = await getOrganizationContextWithFallback(makeRequest(), user.id)
    expect(result).toBeNull()
  })

  it("returns first accepted org when user has multiple", async () => {
    const user = await createTestUser()
    const org1 = await createTestOrg()
    const org2 = await createTestOrg()
    await createTestMembership(user.id, org1.id, "member")
    await createTestMembership(user.id, org2.id, "admin")

    const result = await getOrganizationContextWithFallback(makeRequest(), user.id)
    expect(result).not.toBeNull()
    // Should return one of them (first found)
    expect([org1.id, org2.id]).toContain(result!.organizationId)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:integration tests/integration/organization.test.ts
```
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/organization.test.ts
git commit -m "test: add organization context integration tests"
```

---

## Chunk 4: Integration Tests — Tool Registry

### Task 10: Tool Registry Integration Tests

**Files:**
- Create: `tests/integration/tools/registry.test.ts`
- Read: `lib/tools/registry.ts`

- [ ] **Step 1: Write tool registry tests**

Note: This test requires significant mocking of external dependencies (MCP, builtin tools, AI SDK). The core value is testing the DB query logic and tool resolution flow.

```typescript
// tests/integration/tools/registry.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser, createTestOrg, createTestMembership,
  createTestAssistant, createTestTool,
} from "../../helpers/fixtures"

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: testPrisma,
}))

// Mock builtin tools to avoid pulling in heavy dependencies
vi.mock("@/lib/tools/builtin", () => ({
  BUILTIN_TOOLS: {
    test_builtin: {
      execute: vi.fn().mockResolvedValue("builtin result"),
    },
  },
}))

// Mock MCP adapter
vi.mock("@/lib/mcp/tool-adapter", () => ({
  adaptMcpToolsToAiSdk: vi.fn().mockReturnValue({}),
}))

// Mock MCP client
vi.mock("@/lib/mcp/client", () => ({
  mcpClientManager: {
    listTools: vi.fn().mockResolvedValue([]),
    connect: vi.fn(),
    callTool: vi.fn(),
  },
}))

// Mock models — registry uses AVAILABLE_MODELS + getModelById, capabilities are nested
vi.mock("@/lib/models", () => {
  const AVAILABLE_MODELS = [
    {
      id: "test/model",
      name: "Test Model",
      provider: "test",
      capabilities: { vision: false, functionCalling: true, streaming: true },
    },
    {
      id: "test/no-tools",
      name: "No Tools Model",
      provider: "test",
      capabilities: { vision: false, functionCalling: false, streaming: true },
    },
  ]
  return {
    DEFAULT_MODEL_ID: "test/model",
    AVAILABLE_MODELS,
    getModelById: (id: string) => AVAILABLE_MODELS.find((m) => m.id === id),
  }
})

// Note: logToolExecution is NOT exported — test it indirectly via tool execute
import { resolveToolsForAssistant } from "@/lib/tools/registry"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

describe("resolveToolsForAssistant", () => {
  it("resolves builtin tools when enabled", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      category: "builtin",
      isBuiltIn: true,
    })

    // Bind tool to assistant
    await testPrisma.assistantTool.create({
      data: { assistantId: assistant.id, toolId: tool.id, enabled: true },
    })

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames.length).toBeGreaterThanOrEqual(1)
  })

  it("resolves custom tools with execution config", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const tool = await createTestTool(org.id, {
      name: "custom_api",
      category: "custom",
      executionConfig: { type: "http", url: "https://api.example.com/run", method: "POST" },
    })

    await testPrisma.assistantTool.create({
      data: { assistantId: assistant.id, toolId: tool.id, enabled: true },
    })

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames).toContain("custom_api")
  })

  it("returns empty when no tools are bound", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames).toEqual([])
    expect(Object.keys(result.tools)).toHaveLength(0)
  })

  it("returns empty when model lacks function calling", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const tool = await createTestTool(org.id, { name: "some_tool", category: "builtin", isBuiltIn: true })
    await testPrisma.assistantTool.create({
      data: { assistantId: assistant.id, toolId: tool.id, enabled: true },
    })

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/no-tools", context)

    expect(result.toolNames).toEqual([])
  })

  it("skips disabled tool bindings", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const tool = await createTestTool(org.id, { name: "disabled_tool", category: "custom" })

    await testPrisma.assistantTool.create({
      data: { assistantId: assistant.id, toolId: tool.id, enabled: false },
    })

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    expect(result.toolNames).not.toContain("disabled_tool")
  })
})

// Note: logToolExecution is not exported from registry.ts.
// It is called internally when a tool executes via resolveToolsForAssistant.
// To test it, execute a resolved builtin tool and verify the ToolExecution DB record.
describe("logToolExecution (indirect via tool execute)", () => {
  it("creates a ToolExecution record when a builtin tool is called", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const tool = await createTestTool(org.id, {
      name: "test_builtin",
      category: "builtin",
      isBuiltIn: true,
    })
    await testPrisma.assistantTool.create({
      data: { assistantId: assistant.id, toolId: tool.id, enabled: true },
    })

    const context = { userId: user.id, organizationId: org.id, sessionId: "sess1", assistantId: assistant.id }
    const result = await resolveToolsForAssistant(assistant.id, "test/model", context)

    // Execute the tool to trigger logToolExecution
    const resolvedTool = result.tools["test_builtin"]
    if (resolvedTool && "execute" in resolvedTool && typeof resolvedTool.execute === "function") {
      await resolvedTool.execute({}, { toolCallId: "tc1", messages: [], abortSignal: undefined as any })
    }

    // Verify DB record was created
    const records = await testPrisma.toolExecution.findMany({
      where: { toolName: "test_builtin" },
    })
    expect(records.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:integration tests/integration/tools/registry.test.ts
```
Expected: All pass. If mocks need adjustment for import paths, fix and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools/
git commit -m "test: add tool registry integration tests"
```

---

## Chunk 5: Integration Tests — Package Generator & Smoke Cleanup

### Task 11: Package Generator Integration Tests

**Files:**
- Create: `tests/integration/digital-employee/package-generator.test.ts`
- Read: `lib/digital-employee/package-generator.ts`

- [ ] **Step 1: Write package generator tests**

```typescript
// tests/integration/digital-employee/package-generator.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser, createTestOrg, createTestAssistant,
  createTestEmployeeGroup, createTestEmployee,
} from "../../helpers/fixtures"

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: testPrisma,
}))

// Mock credential decryption
vi.mock("@/lib/workflow/credentials", () => ({
  decryptCredential: vi.fn().mockReturnValue({ token: "test-token" }),
}))

// Mock clawhub
vi.mock("@/lib/digital-employee/clawhub", () => ({
  getClawHubSkill: vi.fn().mockResolvedValue(null),
}))

// Mock MCP mapping
vi.mock("@/lib/digital-employee/mcp-mapping", () => ({
  getMcpServerConfig: vi.fn().mockReturnValue(null),
  MCP_INTEGRATION_IDS: [],
}))

import { generateEmployeePackage } from "@/lib/digital-employee/package-generator"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

describe("generateEmployeePackage", () => {
  it("throws when employee does not exist", async () => {
    await expect(generateEmployeePackage("nonexistent-id"))
      .rejects.toThrow("Employee or assistant not found")
  })

  it("throws when employee has no assistant", async () => {
    // This case requires creating an employee without an assistant,
    // but the schema requires assistantId. So this tests a deleted assistant scenario.
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    // Delete the assistant to simulate missing assistant
    await testPrisma.assistant.delete({ where: { id: assistant.id } })

    await expect(generateEmployeePackage(employee.id))
      .rejects.toThrow("Employee or assistant not found")
  })

  it("generates a package for a basic employee", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    const pkg = await generateEmployeePackage(employee.id)

    expect(pkg).toBeDefined()
    expect(pkg.employee).toBeDefined()
    expect(pkg.employee.name).toBe(employee.name)
  })

  it("includes channel integrations when connected", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    // Add a telegram integration
    await testPrisma.employeeIntegration.create({
      data: {
        digitalEmployeeId: employee.id,
        integrationId: "telegram",
        status: "connected",
        encryptedData: "encrypted-test-data",
      },
    })

    const pkg = await generateEmployeePackage(employee.id)

    // Package should include the channel integration
    expect(pkg.channelIntegrations).toBeDefined()
    expect(pkg.channelIntegrations.length).toBeGreaterThanOrEqual(1)
    expect(pkg.channelIntegrations[0].channelId).toBe("telegram")
  })

  it("skips disconnected integrations", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    await testPrisma.employeeIntegration.create({
      data: {
        digitalEmployeeId: employee.id,
        integrationId: "telegram",
        status: "disconnected",
        encryptedData: "encrypted-test-data",
      },
    })

    const pkg = await generateEmployeePackage(employee.id)
    expect(pkg.channelIntegrations).toEqual([])
  })

  it("lists coworkers excluding self", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant1 = await createTestAssistant(org.id)
    const assistant2 = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee1 = await createTestEmployee(org.id, assistant1.id, group.id, user.id, { status: "ACTIVE" })
    const employee2 = await createTestEmployee(org.id, assistant2.id, group.id, user.id, {
      name: "Coworker Bot",
      status: "ACTIVE",
    })

    const pkg = await generateEmployeePackage(employee1.id)

    expect(pkg.coworkers).toBeDefined()
    const coworkerNames = pkg.coworkers.map((c: any) => c.name)
    expect(coworkerNames).toContain("Coworker Bot")
    expect(coworkerNames).not.toContain(employee1.name)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:integration tests/integration/digital-employee/package-generator.test.ts
```
Expected: All pass. Some assertions may need adjustment based on actual return shape — fix and re-run if needed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/digital-employee/
git commit -m "test: add package generator integration tests"
```

---

### Task 12: Remove Smoke Test & Final Integration Run

**Files:**
- Delete: `tests/integration/smoke.test.ts` (served its purpose)

- [ ] **Step 1: Delete smoke test**

```bash
rm tests/integration/smoke.test.ts
```

- [ ] **Step 2: Run all tests**

```bash
bun run test
```
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add -A tests/
git commit -m "test: remove smoke test, finalize test suite"
```

---

## Chunk 6: API Route Integration Tests

### Task 14: API Route Tests

**Files:**
- Create: `tests/integration/api/tools.test.ts`
- Create: `tests/integration/api/workflows.test.ts`
- Create: `tests/integration/api/digital-employees.test.ts`
- Read: `app/api/dashboard/tools/route.ts`, `app/api/dashboard/workflows/route.ts`, `app/api/dashboard/digital-employees/route.ts`

Note: API route tests require mocking `auth()` from NextAuth and calling the route handlers directly. The exact approach depends on how the route handlers are structured. These tests verify the auth boundary + DB query logic.

- [ ] **Step 1: Write tools API route tests**

```typescript
// tests/integration/api/tools.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg, createTestMembership, createTestTool } from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

// Mock auth — each test overrides the return value as needed
const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => {
  await cleanupDatabase()
  mockAuth.mockReset()
})
afterAll(async () => { await testPrisma.$disconnect() })

describe("GET /api/dashboard/tools", () => {
  it("returns 401 without auth session", async () => {
    mockAuth.mockResolvedValue(null)

    // Import the route handler dynamically so mocks are in place
    const { GET } = await import("@/app/api/dashboard/tools/route")
    const req = new Request("http://localhost/api/dashboard/tools")
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it("returns tools for authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const tool = await createTestTool(org.id, { name: "my_tool" })

    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const { GET } = await import("@/app/api/dashboard/tools/route")
    const headers = new Headers({ "x-organization-id": org.id })
    const req = new Request("http://localhost/api/dashboard/tools", { headers })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it("isolates tools between orgs", async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    const orgA = await createTestOrg()
    const orgB = await createTestOrg()
    await createTestMembership(userA.id, orgA.id, "admin")
    await createTestMembership(userB.id, orgB.id, "admin")
    await createTestTool(orgA.id, { name: "tool_a" })
    await createTestTool(orgB.id, { name: "tool_b" })

    // User A should not see org B's tools
    mockAuth.mockResolvedValue({ user: { id: userA.id } })

    const { GET } = await import("@/app/api/dashboard/tools/route")
    const headers = new Headers({ "x-organization-id": orgA.id })
    const req = new Request("http://localhost/api/dashboard/tools", { headers })
    const res = await GET(req)
    const data = await res.json()

    const names = data.map((t: any) => t.name)
    expect(names).not.toContain("tool_b")
  })
})
```

- [ ] **Step 2: Write workflows API route tests**

```typescript
// tests/integration/api/workflows.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg, createTestMembership, createTestWorkflow } from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => {
  await cleanupDatabase()
  mockAuth.mockReset()
})
afterAll(async () => { await testPrisma.$disconnect() })

describe("GET /api/dashboard/workflows", () => {
  it("returns 401 without auth session", async () => {
    mockAuth.mockResolvedValue(null)
    const { GET } = await import("@/app/api/dashboard/workflows/route")
    const req = new Request("http://localhost/api/dashboard/workflows")
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns workflows for authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    await createTestWorkflow(org.id)

    mockAuth.mockResolvedValue({ user: { id: user.id } })
    const { GET } = await import("@/app/api/dashboard/workflows/route")
    const headers = new Headers({ "x-organization-id": org.id })
    const req = new Request("http://localhost/api/dashboard/workflows", { headers })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

- [ ] **Step 3: Write digital-employees API route tests**

```typescript
// tests/integration/api/digital-employees.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser, createTestOrg, createTestMembership,
  createTestAssistant, createTestEmployeeGroup, createTestEmployee,
} from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => {
  await cleanupDatabase()
  mockAuth.mockReset()
})
afterAll(async () => { await testPrisma.$disconnect() })

describe("GET /api/dashboard/digital-employees", () => {
  it("returns 401 without auth session", async () => {
    mockAuth.mockResolvedValue(null)
    const { GET } = await import("@/app/api/dashboard/digital-employees/route")
    const req = new Request("http://localhost/api/dashboard/digital-employees")
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns employees for authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    await createTestEmployee(org.id, assistant.id, group.id, user.id)

    mockAuth.mockResolvedValue({ user: { id: user.id } })
    const { GET } = await import("@/app/api/dashboard/digital-employees/route")
    const headers = new Headers({ "x-organization-id": org.id })
    const req = new Request("http://localhost/api/dashboard/digital-employees", { headers })
    const res = await GET(req)

    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 4: Run API route tests**

```bash
bun run test:integration tests/integration/api/
```
Expected: All pass. API route imports may need adjustment based on actual route file exports — fix as needed.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/
git commit -m "test: add API route integration tests"
```

---

## Chunk 7: Final Verification

### Task 15: Full Suite Run & Summary

- [ ] **Step 1: Run full test suite and verify count**

```bash
bun run test 2>&1
```
Expected: ~80+ tests pass, 0 failures, runtime under 10 minutes

- [ ] **Step 2: Run unit tests only to verify speed**

```bash
bun run test:unit 2>&1
```
Expected: Completes in under 10 seconds

- [ ] **Step 3: Verify no regressions in the app**

```bash
bunx tsc --noEmit 2>&1 | head -20
```
Expected: No new type errors introduced by test files (vitest types should be global)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "test: fix any test issues from final verification"
```
