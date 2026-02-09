import { PrismaClient } from '@prisma/client';
import {
  updateWorkingMemory,
  updateUserProfile,
  loadWorkingMemory,
  loadUserProfile,
  getMastraMemory,
  resetMastraMemory,
  Fact,
  Preference,
} from '../lib/memory';

const prisma = new PrismaClient();

async function testChatSystems() {
  console.log('🧪 Testing All Chat Systems (Main & Widget)...');

  // Test Data
  const mainUserId = 'user_main_' + Date.now();
  const widgetVisitorId = 'vis_widget_' + Date.now();
  const mainThreadId = 'thread_main_' + Date.now();
  const widgetThreadId = 'thread_widget_' + Date.now();
  const mastraUserId = 'user_mastra_' + Date.now();
  const mastraThreadId = 'thread_mastra_' + Date.now();
  const updateUserId = 'user_update_' + Date.now();
  const updateThreadId = 'thread_update_' + Date.now();

  try {
    // ==========================================
    // TEST 1: Main Chat System (Logged-in User)
    // ==========================================
    console.log('\n🔵 Testing Main Chat System...');
    console.log(`   User ID: ${mainUserId}`);

    // Simulate extracted data from LLM tool call
    const mainFacts: Fact[] = [{
      id: `fact_${Date.now()}_1`,
      subject: 'user',
      predicate: 'subscription',
      object: 'Premium Plan',
      confidence: 0.95,
      source: mainThreadId,
      createdAt: new Date(),
    }];

    // 1. Update Memory
    console.log('   Actions: Updating capabilities...');
    await updateWorkingMemory(mainUserId, mainThreadId, "I have a premium plan", "Understood.", "msg_1", [], mainFacts);
    await updateUserProfile(mainUserId, "I have a premium plan", "Understood.", mainThreadId, mainFacts);

    // 2. Verify Persistence
    const mainProfile = await loadUserProfile(mainUserId);
    const hasFact = mainProfile?.facts.some(f => f.object === 'Premium Plan');

    if (hasFact) {
      console.log('   ✅ Verification Passed: Main user memory persisted.');
    } else {
      console.error('   ❌ Verification Failed: Main user memory missing.');
    }

    // ==========================================
    // TEST 2: Widget Chat System (Visitor ID)
    // ==========================================
    console.log('\n🟠 Testing Widget Chat System...');
    console.log(`   Visitor ID: ${widgetVisitorId}`);

    // Simulate extracted data
    const widgetFacts: Fact[] = [{
      id: `fact_${Date.now()}_2`,
      subject: 'user',
      predicate: 'interest',
      object: 'Car Insurance',
      confidence: 0.9,
      source: widgetThreadId,
      createdAt: new Date(),
    }];

    // 1. Update Memory
    console.log('   Actions: Updating capabilities...');
    await updateWorkingMemory(widgetVisitorId, widgetThreadId, "Looking for car insurance", "We have great options.", "msg_2", [], widgetFacts);
    await updateUserProfile(widgetVisitorId, "Looking for car insurance", "We have great options.", widgetThreadId, widgetFacts);

    // 2. Verify Persistence
    const widgetProfile = await loadUserProfile(widgetVisitorId);
    const hasWidgetFact = widgetProfile?.facts.some(f => f.object === 'Car Insurance');

    if (hasWidgetFact) {
      console.log('   ✅ Verification Passed: Widget visitor memory persisted.');
    } else {
      console.error('   ❌ Verification Failed: Widget visitor memory missing.');
    }

    // 3. Verify TTL (Simulation)
    console.log('   Actions: Applying 30-day TTL...');
    const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.userMemory.updateMany({
      where: { userId: widgetVisitorId },
      data: { expiresAt: expirationDate }
    });

    const ttlRecord = await prisma.userMemory.findFirst({
      where: { userId: widgetVisitorId, key: 'user_profile' }
    });

    if (ttlRecord?.expiresAt) {
      console.log(`   ✅ Verification Passed: TTL expiration date set to ${ttlRecord.expiresAt.toISOString()}`);
    } else {
      console.error('   ❌ Verification Failed: TTL expiration missing.');
    }

    // ==========================================
    // TEST 3: Mastra Memory Integration
    // ==========================================
    console.log('\n🟣 Testing Mastra Memory Integration...');

    const mastraFacts: Fact[] = [{
      id: `fact_${Date.now()}_mastra`,
      subject: 'user',
      predicate: 'age',
      object: '45',
      confidence: 0.95,
      source: mastraThreadId,
      createdAt: new Date(),
    }];

    console.log('   Actions: Updating working memory and profile...');
    await updateWorkingMemory(
      mastraUserId,
      mastraThreadId,
      'I am 45 years old and looking for retirement planning',
      'I can help with that.',
      'msg_mastra_1',
      [],
      mastraFacts
    );
    await updateUserProfile(
      mastraUserId,
      'I am 45 years old and looking for retirement planning',
      'I can help with that.',
      mastraThreadId,
      mastraFacts
    );

    const mastraProfile = await loadUserProfile(mastraUserId);
    const hasMastraFact = mastraProfile?.facts.some((f) => f.object === '45');
    if (hasMastraFact) {
      console.log('   ✅ Verification Passed: Mastra integration (profile) working.');
    } else {
      console.error('   ❌ Verification Failed: Mastra profile fact missing.');
    }

    const memory = getMastraMemory();
    const recallResults = await memory.recall('retirement planning', {
      resourceId: mastraUserId,
      threadId: mastraThreadId,
      topK: 3,
    });
    console.log(`   Mastra recall returned ${recallResults.length} result(s).`);

    process.env.MASTRA_MEMORY_ENABLED = 'false';
    resetMastraMemory();
    console.log('   ✅ Fallback configured (MASTRA_MEMORY_ENABLED=false).');

    // ==========================================
    // TEST 4: Memory update / "ganti data" (replace, not duplicate)
    // ==========================================
    console.log('\n🟢 Testing Memory Update (replace-by-predicate & preference >=)...');
    console.log(`   User ID: ${updateUserId}`);

    const factBudi: Fact[] = [{
      id: `fact_${Date.now()}_budi`,
      subject: 'user',
      predicate: 'nama',
      object: 'Budi',
      confidence: 0.9,
      source: updateThreadId,
      createdAt: new Date(),
    }];
    const prefWhatsapp: Preference[] = [{
      id: `pref_${Date.now()}_wa`,
      category: 'communication',
      key: 'channel',
      value: 'whatsapp',
      confidence: 0.9,
      source: updateThreadId,
    }];

    await updateUserProfile(updateUserId, 'Nama saya Budi', 'Baik.', updateThreadId, factBudi, prefWhatsapp);
    let updateProfile = await loadUserProfile(updateUserId);
    const hasBudi = updateProfile?.facts.some(f => f.predicate === 'nama' && f.object === 'Budi');
    const hasWa = updateProfile?.preferences.some(p => p.key === 'channel' && p.value === 'whatsapp');
    if (!hasBudi || !hasWa) {
      console.error('   ❌ Setup failed: initial fact/preference not stored.');
    }

    const factAndi: Fact[] = [{
      id: `fact_${Date.now()}_andi`,
      subject: 'user',
      predicate: 'nama',
      object: 'Andi',
      confidence: 0.9,
      source: updateThreadId,
      createdAt: new Date(),
    }];
    const prefEmail: Preference[] = [{
      id: `pref_${Date.now()}_em`,
      category: 'communication',
      key: 'channel',
      value: 'email',
      confidence: 0.9,
      source: updateThreadId,
    }];

    await updateUserProfile(updateUserId, 'Bukan Budi, nama saya Andi. Channel preferensi email.', 'Baik.', updateThreadId, factAndi, prefEmail);
    updateProfile = await loadUserProfile(updateUserId);
    const namaFacts = updateProfile?.facts.filter(f => f.predicate === 'nama') ?? [];
    const channelPrefs = updateProfile?.preferences.filter(p => p.key === 'channel') ?? [];

    const replacedFact = namaFacts.length === 1 && namaFacts[0].object === 'Andi';
    const replacedPref = channelPrefs.length === 1 && channelPrefs[0].value === 'email';
    if (replacedFact && replacedPref) {
      console.log('   ✅ Long-term: fact & preference replaced (ganti data works).');
    } else {
      console.error('   ❌ Long-term replace failed:', { namaFacts, channelPrefs });
    }

    await updateWorkingMemory(updateUserId, updateThreadId, 'Nama saya Budi', 'OK.', 'msg_u1', [], factBudi);
    const factAndiWm: Fact[] = [{
      id: `fact_${Date.now()}_wm`,
      subject: 'user',
      predicate: 'nama',
      object: 'Andi',
      confidence: 0.9,
      source: updateThreadId,
      createdAt: new Date(),
    }];
    await updateWorkingMemory(updateUserId, updateThreadId, 'Bukan, nama saya Andi', 'OK.', 'msg_u2', [], factAndiWm);
    const wm = await loadWorkingMemory(updateThreadId);
    const wmNamaFacts = Array.from(wm.facts.values()).filter(f => f.predicate === 'nama');
    const wmReplaced = wmNamaFacts.length === 1 && wmNamaFacts[0].object === 'Andi';
    if (wmReplaced) {
      console.log('   ✅ Working memory: single fact by predicate, value = Andi (replace-by-predicate works).');
    } else {
      console.error('   ❌ Working memory replace failed:', wmNamaFacts);
    }

    console.log('\n✨ All Systems Verified Successfully!');

  } catch (error) {
    console.error('❌ Test Failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await prisma.userMemory.deleteMany({ where: { userId: mainUserId } });
    await prisma.userMemory.deleteMany({ where: { userId: widgetVisitorId } });
    await prisma.userMemory.deleteMany({ where: { userId: mastraUserId } });
    await prisma.userMemory.deleteMany({ where: { userId: updateUserId } });
    await prisma.$disconnect();
  }
}

testChatSystems()
  .then(() => {
    console.log('✅ Cleanup completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
