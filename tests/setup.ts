import { testPrisma, cleanupDatabase } from "./helpers/db"
import { afterEach, beforeAll, afterAll } from "vitest"

beforeAll(async () => {
  await testPrisma.$connect()
})

afterEach(async () => {
  await cleanupDatabase()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})
