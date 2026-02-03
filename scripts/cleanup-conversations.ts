/**
 * Script to clean up old/mixed conversations from the database
 *
 * Usage: pnpm tsx scripts/cleanup-conversations.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Cleaning up conversations...")

  // Delete all messages
  const deletedMessages = await prisma.message.deleteMany({})
  console.log(`Deleted ${deletedMessages.count} messages`)

  // Delete all conversations
  const deletedConversations = await prisma.conversation.deleteMany({})
  console.log(`Deleted ${deletedConversations.count} conversations`)

  console.log("\nDone! All conversations and messages have been cleared.")
  console.log("Users will get fresh conversations on their next visit.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
