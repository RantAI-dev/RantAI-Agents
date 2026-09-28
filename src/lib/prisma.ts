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
  // One chat request makes a dozen-plus queries plus background memory
  // writes; at 5 connections, 30 concurrent chats queued past pool_timeout
  // and failed (QA CHAT-057). Same env knobs and defaults as the cloud edition.
  const limit = process.env.DATABASE_CONNECTION_LIMIT ?? "20"
  const timeout = process.env.DATABASE_POOL_TIMEOUT ?? "15"
  return `${url}${separator}connection_limit=${limit}&pool_timeout=${timeout}`
}
