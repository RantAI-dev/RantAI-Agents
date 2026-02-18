import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: appendPoolParams(process.env.DATABASE_URL),
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/** Append connection pool params if not already present */
function appendPoolParams(url: string | undefined): string | undefined {
  if (!url) return url
  const hasPoolParams = url.includes("connection_limit") || url.includes("pool_timeout")
  if (hasPoolParams) return url
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}connection_limit=5&pool_timeout=10`
}
