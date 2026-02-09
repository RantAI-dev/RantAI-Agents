/**
 * Performance benchmark: Mastra recall vs existing semanticRecall
 */

import { getMastraMemory, semanticRecall } from '../lib/memory';

async function benchmarkPerformance() {
  console.log('⚡ Performance Benchmark: Mastra vs Existing semanticRecall\n');

  const userId = 'perf_test_user_' + Date.now();
  const threadId = 'perf_test_thread_' + Date.now();
  const query = 'Tell me about insurance';
  const memory = getMastraMemory();

  // Setup: save a few messages
  for (let i = 0; i < 5; i++) {
    await memory.saveMessage(threadId, {
      role: 'user',
      content: `Message ${i} about insurance and coverage`,
      metadata: { userId },
    });
  }
  await new Promise((r) => setTimeout(r, 1500));

  const iterations = 10;

  // Benchmark Mastra recall
  console.log(`Benchmarking Mastra memory.recall() (${iterations} runs)...`);
  const mastraStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await memory.recall(query, { resourceId: userId, threadId, topK: 5 });
  }
  const mastraTime = Date.now() - mastraStart;
  const mastraAvg = mastraTime / iterations;
  console.log(`   Mastra: ${mastraTime}ms total, ${mastraAvg.toFixed(0)}ms avg\n`);

  // Benchmark existing semanticRecall
  console.log(`Benchmarking semanticRecall() (${iterations} runs)...`);
  const existingStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    await semanticRecall(query, userId, threadId, 5);
  }
  const existingTime = Date.now() - existingStart;
  const existingAvg = existingTime / iterations;
  console.log(`   Existing: ${existingTime}ms total, ${existingAvg.toFixed(0)}ms avg\n`);

  console.log('📊 Results:');
  console.log(`   Mastra:   ${mastraAvg.toFixed(2)}ms avg`);
  console.log(`   Existing: ${existingAvg.toFixed(2)}ms avg`);
  const overhead = mastraAvg - existingAvg;
  const pct = existingAvg > 0 ? ((overhead / existingAvg) * 100).toFixed(1) : '0';
  console.log(`   Overhead: ${overhead.toFixed(2)}ms (${pct}%)`);
  if (mastraAvg < 200) {
    console.log('\n✅ Latency within target (< 200ms).');
  } else {
    console.warn(`\n⚠️  Mastra avg above 200ms (${mastraAvg.toFixed(0)}ms).`);
  }
}

benchmarkPerformance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
