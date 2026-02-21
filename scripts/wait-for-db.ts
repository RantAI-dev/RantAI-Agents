import { PrismaClient } from "@prisma/client";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

async function waitForDb() {
  const prisma = new PrismaClient();

  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`✓ Database is ready`);
      await prisma.$disconnect();
      return;
    } catch {
      console.log(`Waiting for database... (${i}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  await prisma.$disconnect();
  console.error("✗ Database not ready after retries");
  process.exit(1);
}

waitForDb();
