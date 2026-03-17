import { PrismaClient } from "@prisma/client"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL?.replace(/\/[^/]+(\?.*)?$/, "/horizonlife_test")
  || "postgresql://horizonlife:horizonlife_secret@localhost:5432/horizonlife_test"

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
})

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
