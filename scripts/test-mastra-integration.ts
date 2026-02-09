/**
 * Integration test: Mastra Memory + chat flow
 *
 * Simulates multi-turn conversation, save via Mastra, then semantic recall.
 */

import { getMastraMemory, resetMastraMemory } from '../lib/memory';

async function testIntegration() {
  console.log('🧪 Integration Test: Mastra Memory + Chat Flow\n');

  const userId = 'integration_test_user_' + Date.now();
  const threadId = 'integration_test_thread_' + Date.now();
  const memory = getMastraMemory();

  try {
    // Simulate multi-turn conversation (save messages)
    const turns = [
      {
        user: 'My name is Alice and I am 35 years old.',
        assistant: 'Nice to meet you, Alice! How can I help you today?',
      },
      {
        user: 'I have 2 kids and am looking for life insurance.',
        assistant: 'Life insurance is important for parents. Let me help you find the right coverage.',
      },
    ];

    for (const turn of turns) {
      await memory.saveMessage(threadId, {
        role: 'user',
        content: turn.user,
        metadata: { userId },
      });
      await memory.saveMessage(threadId, {
        role: 'assistant',
        content: turn.assistant,
        metadata: { userId },
      });
    }
    console.log('✅ Saved 2 conversation turns\n');

    // Wait for embeddings
    await new Promise((r) => setTimeout(r, 2000));

    // Semantic recall: family info
    console.log('Testing semantic recall: "Tell me about my family"...');
    const results = await memory.recall('Tell me about my family', {
      resourceId: userId,
      threadId,
      topK: 5,
    });
    console.log(`   Found ${results.length} relevant message(s).`);

    const hasName = results.some((r) => r.messageContent.toLowerCase().includes('alice'));
    const hasKids = results.some(
      (r) =>
        r.messageContent.includes('2 kids') || r.messageContent.includes('2 children')
    );
    if (hasName && hasKids) {
      console.log('✅ Integration test passed: recalled name and family info.');
    } else {
      console.warn('⚠️  Recall incomplete:', { hasName, hasKids });
    }

    // getMessages
    const list = await memory.getMessages(threadId, { userId, limit: 10 });
    console.log(`   getMessages returned ${list.length} message(s).\n`);
  } finally {
    resetMastraMemory();
  }
}

testIntegration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
