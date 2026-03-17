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
  createdBy: string,
  overrides: Record<string, unknown> = {}
) {
  return testPrisma.workflow.create({
    data: {
      name: faker.lorem.words(2),
      organizationId,
      createdBy,
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
