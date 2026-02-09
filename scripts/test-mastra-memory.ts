/**
 * Test Mastra Memory Integration
 *
 * Verifies that the Mastra-style memory API works with the existing
 * PostgreSQL + SurrealDB backend (saveMessage, getMessages, recall).
 */

import { getMastraMemory, resetMastraMemory } from '../lib/memory';

async function testMastraMemory() {
  console.log('🧪 Testing Mastra Memory Integration...\n');

  const testUserId = 'test_user_' + Date.now();
  const testThreadId = 'test_thread_' + Date.now();

  try {
    const memory = getMastraMemory();
    console.log('✅ Mastra Memory bridge created\n');

    // Test 1: Recall with no data
    console.log('Test 1: Semantic recall (no prior data)...');
    const emptyResults = await memory.recall('What is my name?', {
      resourceId: testUserId,
      threadId: testThreadId,
      topK: 3,
    });
    console.log(`   Found ${emptyResults.length} messages (expected 0 or few)\n`);

    // Test 2: Save messages
    console.log('Test 2: Saving messages...');
    await memory.saveMessage(testThreadId, {
      role: 'user',
      content: 'My name is John and I have 2 kids. I am interested in life insurance.',
      metadata: { userId: testUserId },
    });
    await memory.saveMessage(testThreadId, {
      role: 'assistant',
      content: 'Nice to meet you, John! I understand you have 2 children and are interested in life insurance.',
      metadata: { userId: testUserId },
    });
    console.log('   ✅ Messages saved\n');

    // Test 3: getMessages
    console.log('Test 3: getMessages...');
    const list = await memory.getMessages(testThreadId, { userId: testUserId, limit: 10 });
    console.log(`   Retrieved ${list.length} messages\n`);

    await new Promise((r) => setTimeout(r, 2000));

    // Test 4: Semantic recall after save
    console.log('Test 4: Semantic recall - "What is my name?"...');
    const nameResults = await memory.recall('What is my name?', {
      resourceId: testUserId,
      threadId: testThreadId,
      topK: 3,
    });
    const foundName = nameResults.some((r) => r.messageContent.toLowerCase().includes('john'));
    console.log(`   Found ${nameResults.length} results, name recalled: ${foundName ? '✅' : '⚠️'}\n`);

    // Test 5: Reset and singleton
    console.log('Test 5: Reset and singleton...');
    resetMastraMemory();
    const memory2 = getMastraMemory();
    await memory2.recall('hello', { resourceId: testUserId, threadId: testThreadId, topK: 2 });
    console.log('   ✅ Second instance works\n');

    console.log('🎉 Mastra Memory tests completed.');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

testMastraMemory()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
