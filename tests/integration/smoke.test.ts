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
