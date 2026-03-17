import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser,
  createTestOrg,
  createTestAssistant,
  createTestEmployeeGroup,
  createTestEmployee,
  createTestIntegration,
} from "../../helpers/fixtures"

// IMPORTANT: All mocks must be declared before importing the module under test
vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

vi.mock("@/lib/workflow/credentials", () => ({
  decryptCredential: vi.fn().mockReturnValue({ token: "test-token" }),
}))

vi.mock("@/lib/digital-employee/clawhub", () => ({
  getClawHubSkill: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/digital-employee/mcp-mapping", () => ({
  getMcpServerConfig: vi.fn().mockReturnValue(null),
  MCP_INTEGRATION_IDS: [],
}))

import { generateEmployeePackage } from "@/lib/digital-employee/package-generator"

beforeAll(async () => {
  await testPrisma.$connect()
})

afterEach(async () => {
  await cleanupDatabase()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})

describe("generateEmployeePackage", () => {
  it("throws when employee does not exist", async () => {
    await expect(generateEmployeePackage("nonexistent-id")).rejects.toThrow(
      "Employee or assistant not found"
    )
  })

  it("generates a package for a basic employee", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id, {
      name: "Alice",
    })

    const pkg = await generateEmployeePackage(employee.id)

    expect(pkg.employee.id).toBe(employee.id)
    expect(pkg.employee.name).toBe("Alice")
    expect(pkg.agent.model).toBe("test/model")
  })

  it("includes connected channel integrations", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    await createTestIntegration(employee.id, "telegram", {
      status: "connected",
      encryptedData: "test-encrypted-data",
    })

    const pkg = await generateEmployeePackage(employee.id)

    expect(pkg.channelIntegrations).toBeDefined()
    expect(pkg.channelIntegrations).toHaveLength(1)
    expect(pkg.channelIntegrations![0].channelId).toBe("telegram")
    expect(pkg.channelIntegrations![0].credentials).toEqual({ token: "test-token" })
  })

  it("skips disconnected integrations", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    await createTestIntegration(employee.id, "telegram", {
      status: "disconnected",
      encryptedData: "test-encrypted-data",
    })

    const pkg = await generateEmployeePackage(employee.id)

    expect(pkg.channelIntegrations).toBeUndefined()
  })

  it("lists coworkers excluding self in TEAM.md workspace file", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant1 = await createTestAssistant(org.id)
    const assistant2 = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)

    const employee1 = await createTestEmployee(org.id, assistant1.id, group.id, user.id, {
      name: "Employee One",
      status: "ACTIVE",
    })
    await createTestEmployee(org.id, assistant2.id, group.id, user.id, {
      name: "Employee Two",
      status: "ACTIVE",
    })

    const pkg = await generateEmployeePackage(employee1.id)

    // Coworkers are reflected in the TEAM.md workspace file, not directly on the package
    const teamMd = pkg.workspaceFiles["TEAM.md"]
    expect(teamMd).toBeDefined()
    expect(teamMd).toContain("Employee Two")
    expect(teamMd).not.toContain("Employee One")
  })

  it("generates TEAM.md with no coworkers message when employee is alone", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id)

    const pkg = await generateEmployeePackage(employee.id)

    const teamMd = pkg.workspaceFiles["TEAM.md"]
    expect(teamMd).toBeDefined()
    // With no coworkers, TEAM.md should indicate no teammates
    expect(teamMd).toMatch(/no coworkers/i)
  })

  it("does not include integrations from other employees", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const assistant1 = await createTestAssistant(org.id)
    const assistant2 = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)

    const employee1 = await createTestEmployee(org.id, assistant1.id, group.id, user.id)
    const employee2 = await createTestEmployee(org.id, assistant2.id, group.id, user.id)

    // Only employee2 has a telegram integration
    await createTestIntegration(employee2.id, "telegram", {
      status: "connected",
      encryptedData: "test-encrypted-data",
    })

    const pkg = await generateEmployeePackage(employee1.id)

    expect(pkg.channelIntegrations).toBeUndefined()
  })
})
