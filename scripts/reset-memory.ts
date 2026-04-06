
import { prisma } from '../src/lib/prisma';
import { SurrealDBClient, getSurrealDBConfigFromEnv } from '../src/lib/surrealdb';

async function resetMemory() {
  console.log('🔄 Starting memory system reset...');

  try {
    // 1. Reset PostgreSQL Memory (Working & Long-term)
    console.log('📦 Clearing PostgreSQL memory tables...');
    const deletedUserMemories = await prisma.userMemory.deleteMany({});
    console.log(`✅ Deleted ${deletedUserMemories.count} records from UserMemory (PostgreSQL).`);

    // 2. Reset SurrealDB Memory (Semantic)
    console.log('🧠 Clearing SurrealDB conversation memory...');
    const surrealConfig = getSurrealDBConfigFromEnv();
    const surrealClient = await SurrealDBClient.getInstance(surrealConfig);

    // We use a raw query to delete all records from the table
    try {
      await surrealClient.query('DELETE conversation_memory');
      console.log('✅ Cleared conversation_memory table (SurrealDB).');
      try {
        await surrealClient.disconnect();
      } catch (err) {
        // ignore
      }
    } catch (surrealError) {
      console.warn('⚠️  Warning: Could not clear SurrealDB memory. It might be empty or the table might not exist yet.', surrealError);
      try {
        await surrealClient.disconnect();
      } catch (err) {
        // ignore
      }
    }

    console.log('✨ Memory system reset completed successfully!');
  } catch (error) {
    console.error('❌ Error resetting memory system:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the reset
resetMemory()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
