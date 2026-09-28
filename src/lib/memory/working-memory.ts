/**
 * Working Memory
 * Tracks entities, facts, and context for current conversation session
 */

import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import {
  WorkingMemory,
  WorkingMemoryData,
  Entity,
  Fact,
  ConversationContext,
  DEFAULT_MEMORY_CONFIG,
} from './types';
import {
  normalizeMemoryKey,
  isMultiValuePredicate,
  memoryKeyMatches,
  memoryValueMatches,
} from './fact-keys';
import type { ForgetCriteria } from './long-term-memory';

/**
 * In-memory cache for active sessions (fast access).
 *
 * Bounded LRU with per-entry expiry. It used to be an unbounded Map whose hits ignored
 * the DB row's `expiresAt`, so every thread ever seen stayed resident for the life of
 * the process (a candidate for the latency growth in the CHAT-058 soak) and an expired
 * session could be served from cache forever.
 */
export const WORKING_MEMORY_CACHE_MAX = 500;
const workingMemoryCache = new Map<string, { wm: WorkingMemory; expiresAt: number }>();

function cacheGet(threadId: string): WorkingMemory | undefined {
  const entry = workingMemoryCache.get(threadId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    workingMemoryCache.delete(threadId);
    return undefined;
  }
  // LRU touch
  workingMemoryCache.delete(threadId);
  workingMemoryCache.set(threadId, entry);
  return entry.wm;
}

function cacheSet(threadId: string, wm: WorkingMemory): void {
  workingMemoryCache.delete(threadId);
  workingMemoryCache.set(threadId, {
    wm,
    expiresAt: Date.now() + DEFAULT_MEMORY_CONFIG.workingMemoryTTL,
  });
  while (workingMemoryCache.size > WORKING_MEMORY_CACHE_MAX) {
    const oldest = workingMemoryCache.keys().next().value;
    if (oldest === undefined) break;
    workingMemoryCache.delete(oldest);
  }
}

/** Diagnostic/test hook. */
export function workingMemoryCacheSize(): number {
  return workingMemoryCache.size;
}

/**
 * Load working memory for a thread/session
 */
export async function loadWorkingMemory(threadId: string): Promise<WorkingMemory> {
  // Check cache first
  const cached = cacheGet(threadId);
  if (cached) {
    return cached;
  }

  // Try to load from database
  const stored = await prisma.userMemory.findFirst({
    where: {
      key: `working_memory:${threadId}`,
      type: 'WORKING',
      expiresAt: { gt: new Date() }, // Not expired
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (stored) {
    const data = stored.value as unknown as WorkingMemoryData;
    const workingMemory: WorkingMemory = {
      threadId: data.threadId,
      entities: new Map(data.entities.map(e => [e.id, e])),
      facts: new Map(data.facts.map(f => [f.id, f])),
      context: data.context,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    cacheSet(threadId, workingMemory);
    return workingMemory;
  }

  // Create new working memory
  const newWorkingMemory: WorkingMemory = {
    threadId,
    entities: new Map(),
    facts: new Map(),
    context: {
      currentTopic: null,
      intent: null,
      sentiment: null,
      language: 'en',
      lastUpdated: new Date(),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  cacheSet(threadId, newWorkingMemory);
  return newWorkingMemory;
}

/**
 * Save working memory to database
 */
async function saveWorkingMemory(
  userId: string,
  workingMemory: WorkingMemory
): Promise<void> {
  const data: WorkingMemoryData = {
    threadId: workingMemory.threadId,
    entities: Array.from(workingMemory.entities.values()),
    facts: Array.from(workingMemory.facts.values()),
    context: workingMemory.context,
    createdAt: workingMemory.createdAt.toISOString(),
    updatedAt: workingMemory.updatedAt.toISOString(),
  };

  const expiresAt = new Date(Date.now() + DEFAULT_MEMORY_CONFIG.workingMemoryTTL);

  await prisma.userMemory.upsert({
    where: {
      id: `wm_${workingMemory.threadId}`,
    },
    create: {
      id: `wm_${workingMemory.threadId}`,
      userId,
      type: 'WORKING',
      key: `working_memory:${workingMemory.threadId}`,
      value: data as object,
      expiresAt,
    },
    update: {
      value: data as object,
      expiresAt,
      updatedAt: new Date(),
    },
  });
}

/**
 * Extract entities from message content using heuristics
 * In production, this could use an LLM for better extraction
 */
function extractEntities(content: string, messageId: string): Entity[] {
  const entities: Entity[] = [];

  // Name detection (English and Indonesian, relaxed capitalization)
  const namePatterns = [
    /(?:my name is|i am|i'm|call me)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
    /(?:nama saya|panggil saya|aku)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
  ];

  for (const pattern of namePatterns) {
    const match = content.match(pattern);
    if (match) {
      // Capitalize first letter of name for consistency
      const rawName = match[1];
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      entities.push({
        id: nanoid(),
        type: 'person',
        name: name,
        attributes: { relationship: 'user' },
        confidence: 0.9,
        source: messageId,
        createdAt: new Date(),
      });
      break; // Found a name, stop looking
    }
  }

  // Number extraction (e.g., "I have 2 kids", "budget is 500k")
  const numberPatterns = [
    { pattern: /(\d+)\s*kids?|children/i, attr: 'numberOfChildren' },
    { pattern: /budget\s*(?:is|of)?\s*\$?(\d+[k]?)/i, attr: 'budget' },
    { pattern: /(\d+)\s*years?\s*old/i, attr: 'age' },
    { pattern: /family\s*(?:of|size)?\s*(\d+)/i, attr: 'familySize' },
  ];

  for (const { pattern, attr } of numberPatterns) {
    const match = content.match(pattern);
    if (match) {
      const value = match[1].toLowerCase().includes('k')
        ? parseInt(match[1]) * 1000
        : parseInt(match[1]);
      entities.push({
        id: nanoid(),
        type: 'other',
        name: attr,
        attributes: { value },
        confidence: 0.85,
        source: messageId,
        createdAt: new Date(),
      });
    }
  }

  // Product interest detection
  const productPatterns = [
    { pattern: /life\s*insurance/i, product: 'Life Insurance' },
    { pattern: /health\s*insurance/i, product: 'Health Insurance' },
    { pattern: /home\s*insurance/i, product: 'Home Insurance' },
  ];

  for (const { pattern, product } of productPatterns) {
    if (pattern.test(content)) {
      entities.push({
        id: nanoid(),
        type: 'product',
        name: product,
        attributes: { interest: true },
        confidence: 0.9,
        source: messageId,
        createdAt: new Date(),
      });
    }
  }

  return entities;
}

/**
 * Extract facts from message content
 */
function extractFacts(content: string, messageId: string): Fact[] {
  const facts: Fact[] = [];

  // Pattern-based fact extraction
  const factPatterns = [
    {
      pattern: /(?:i have|i've got)\s+(\d+)\s+(kids?|children|dogs?|cats?)/i,
      extract: (m: RegExpMatchArray) => ({ subject: 'user', predicate: 'has', object: `${m[1]} ${m[2]}` })
    },
    {
      pattern: /(?:i (?:am|work as|work for))\s+(?:a\s+)?([^,.]+)/i,
      extract: (m: RegExpMatchArray) => ({ subject: 'user', predicate: 'occupation', object: m[1].trim() })
    },
    {
      pattern: /(?:i live in|i'm from)\s+([^,.]+)/i,
      extract: (m: RegExpMatchArray) => ({ subject: 'user', predicate: 'location', object: m[1].trim() })
    },
    {
      pattern: /(?:my (?:spouse|husband|wife|partner)'?s? name is)\s+([A-Z][a-z]+)/i,
      extract: (m: RegExpMatchArray) => ({ subject: 'user', predicate: 'spouse_name', object: m[1] })
    },
  ];

  for (const { pattern, extract } of factPatterns) {
    const match = content.match(pattern);
    if (match) {
      const extracted = extract(match);
      facts.push({
        id: nanoid(),
        ...extracted,
        confidence: 0.85,
        source: messageId,
        createdAt: new Date(),
      });
    }
  }

  return facts;
}

/**
 * Detect conversation context from message
 */
function detectContext(content: string, currentContext: ConversationContext): ConversationContext {
  // Language detection (simple heuristic)
  const indonesianWords = ['saya', 'anda', 'apa', 'bagaimana', 'terima', 'kasih', 'tolong'];
  const hasIndonesian = indonesianWords.some(word =>
    content.toLowerCase().includes(word)
  );
  const language = hasIndonesian ? 'id' : 'en';

  // Simple sentiment detection
  const positiveWords = ['great', 'thanks', 'excellent', 'good', 'happy', 'love', 'perfect', 'bagus', 'senang'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'frustrated', 'angry', 'buruk', 'marah'];

  const contentLower = content.toLowerCase();
  const positiveCount = positiveWords.filter(w => contentLower.includes(w)).length;
  const negativeCount = negativeWords.filter(w => contentLower.includes(w)).length;

  let sentiment: 'positive' | 'neutral' | 'negative' | null = null;
  if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';
  else if (positiveCount > 0 || negativeCount > 0) sentiment = 'neutral';

  // Topic detection
  let currentTopic = currentContext.currentTopic;
  if (contentLower.includes('life insurance')) currentTopic = 'life_insurance';
  else if (contentLower.includes('health insurance')) currentTopic = 'health_insurance';
  else if (contentLower.includes('home insurance')) currentTopic = 'home_insurance';
  else if (contentLower.includes('quote') || contentLower.includes('pricing')) currentTopic = 'pricing';
  else if (contentLower.includes('claim')) currentTopic = 'claims';

  // Intent detection
  let intent = currentContext.intent;
  if (contentLower.includes('buy') || contentLower.includes('purchase') || contentLower.includes('sign up')) {
    intent = 'purchase';
  } else if (contentLower.includes('quote') || contentLower.includes('price') || contentLower.includes('cost')) {
    intent = 'get_quote';
  } else if (contentLower.includes('agent') || contentLower.includes('speak') || contentLower.includes('talk to')) {
    intent = 'agent_request';
  } else if (content.endsWith('?')) {
    intent = 'question';
  }

  return {
    currentTopic,
    intent,
    sentiment,
    language,
    lastUpdated: new Date(),
  };
}

/**
 * Update working memory after a message exchange
 */
export async function updateWorkingMemory(
  userId: string,
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  messageId: string,
  extractedEntities?: Entity[],
  extractedFacts?: Fact[],
  options: { extract?: boolean } = {}
): Promise<WorkingMemory> {
  // extract=false: the model already used the memory tools this turn (applied at call
  // time); do not regex-extract from the message again (it would re-add what a
  // forget request just removed).
  const extract = options.extract !== false;
  const workingMemory = await loadWorkingMemory(threadId);

  // Use provided entities or extract from message
  const newEntities = extractedEntities && extractedEntities.length > 0
    ? extractedEntities
    : extract ? extractEntities(userMessage, messageId) : [];

  if (newEntities.length > 0) {
    // console.log(`[Working Memory] Extracted ${newEntities.length} entities:`, newEntities.map(e => e.name).join(', '));
  }
  for (const entity of newEntities) {
    if (!entity.source) entity.source = messageId;
    if (!entity.createdAt) entity.createdAt = new Date();
    workingMemory.entities.set(entity.id, entity);
  }

  // Use provided facts or extract from message
  const newFacts = extractedFacts && extractedFacts.length > 0
    ? extractedFacts
    : extract ? extractFacts(userMessage, messageId) : [];

  if (newFacts.length > 0) {
    // console.log(`[Working Memory] Extracted ${newFacts.length} facts:`, newFacts.map(f => `${f.predicate}: ${f.object}`).join(', '));
  }
  for (const fact of newFacts) {
    if (!fact.source) fact.source = messageId;
    if (!fact.createdAt) fact.createdAt = new Date();
    fact.predicate = normalizeMemoryKey(fact.predicate);
    // Replace existing fact(s) with the same normalized predicate so "ganti X jadi Y"
    // works (no duplicate nama/age/location); multi-valued predicates dedupe by value.
    const multi = isMultiValuePredicate(fact.predicate);
    for (const [id, f] of workingMemory.facts.entries()) {
      if (normalizeMemoryKey(f.predicate) !== fact.predicate) continue;
      if (!multi || String(f.object).toLowerCase() === String(fact.object).toLowerCase()) {
        workingMemory.facts.delete(id);
      }
    }
    workingMemory.facts.set(fact.id, fact);
  }

  // Update context
  workingMemory.context = detectContext(userMessage, workingMemory.context);
  workingMemory.updatedAt = new Date();

  // Enforce limits
  const entityLimit = DEFAULT_MEMORY_CONFIG.maxEntities;
  const factLimit = DEFAULT_MEMORY_CONFIG.maxFacts;

  if (workingMemory.entities.size > entityLimit) {
    const entries = Array.from(workingMemory.entities.entries());
    workingMemory.entities = new Map(entries.slice(-entityLimit));
  }

  if (workingMemory.facts.size > factLimit) {
    const entries = Array.from(workingMemory.facts.entries());
    workingMemory.facts = new Map(entries.slice(-factLimit));
  }

  // Save to database
  // console.log(`[Working Memory] Saving working memory for thread ${threadId}...`);
  await saveWorkingMemory(userId, workingMemory);

  // Update cache
  cacheSet(threadId, workingMemory);

  return workingMemory;
}

function wmFactMatches(f: Fact, c: ForgetCriteria): boolean {
  if (c.all) return true;
  if ((c.keys ?? []).some(k => memoryKeyMatches(f.predicate, k))) return true;
  return (c.keywords ?? []).some(kw => memoryValueMatches(f.object, kw) || memoryKeyMatches(f.predicate, kw));
}

function wmEntityMatches(e: Entity, c: ForgetCriteria): boolean {
  if (c.all) return true;
  const attrs = Object.values(e.attributes ?? {}).map(String);
  if ((c.keys ?? []).some(k => memoryKeyMatches(e.type, k) || memoryKeyMatches(e.name, k))) return true;
  return (c.keywords ?? []).some(kw => memoryValueMatches(e.name, kw) || attrs.some(a => memoryValueMatches(a, kw)));
}

function scrubWorkingMemory(wm: WorkingMemory, c: ForgetCriteria): number {
  let removed = 0;
  for (const [id, f] of wm.facts.entries()) {
    if (wmFactMatches(f, c)) { wm.facts.delete(id); removed++; }
  }
  for (const [id, e] of wm.entities.entries()) {
    if (wmEntityMatches(e, c)) { wm.entities.delete(id); removed++; }
  }
  if (removed > 0) wm.updatedAt = new Date();
  return removed;
}

/**
 * Remove matching facts/entities from ALL of this user's working-memory sessions
 * (DB rows + in-process cache), not only the current thread: a deletion request must
 * not survive in another open session.
 */
export async function forgetFromWorkingMemory(
  userId: string,
  threadId: string,
  criteria: ForgetCriteria
): Promise<number> {
  let removed = 0;

  // Current thread first (it may exist only in cache if nothing was saved yet).
  const current = await loadWorkingMemory(threadId);
  const removedCurrent = scrubWorkingMemory(current, criteria);
  removed += removedCurrent;
  if (removedCurrent > 0) {
    await saveWorkingMemory(userId, current);
    cacheSet(threadId, current);
  }

  const rows = await prisma.userMemory.findMany({
    where: { userId, type: 'WORKING' },
  });
  for (const row of rows) {
    const data = row.value as unknown as WorkingMemoryData;
    if (!data || data.threadId === threadId) continue;
    const facts = (data.facts ?? []).filter(f => !wmFactMatches(f, criteria));
    const entities = (data.entities ?? []).filter(e => !wmEntityMatches(e, criteria));
    const n = (data.facts?.length ?? 0) - facts.length + (data.entities?.length ?? 0) - entities.length;
    if (n === 0) continue;
    removed += n;
    await prisma.userMemory.update({
      where: { id: row.id },
      data: { value: { ...data, facts, entities, updatedAt: new Date().toISOString() } as object },
    });
    workingMemoryCache.delete(data.threadId);
  }

  return removed;
}

/**
 * Format working memory for injection into system prompt
 */
export function formatWorkingMemoryForPrompt(workingMemory: WorkingMemory): string {
  const parts: string[] = [];

  // Format entities
  if (workingMemory.entities.size > 0) {
    const entityDescriptions = Array.from(workingMemory.entities.values())
      .map(e => {
        const attrs = Object.entries(e.attributes)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `- ${e.name} (${e.type}): ${attrs}`;
      })
      .join('\n');
    parts.push(`Known entities in this conversation:\n${entityDescriptions}`);
  }

  // Format facts
  if (workingMemory.facts.size > 0) {
    const factDescriptions = Array.from(workingMemory.facts.values())
      .map(f => `- ${f.subject} ${f.predicate} ${f.object}`)
      .join('\n');
    parts.push(`Facts learned in this conversation:\n${factDescriptions}`);
  }

  // Format context
  const context = workingMemory.context;
  const contextParts: string[] = [];
  if (context.currentTopic) contextParts.push(`Topic: ${context.currentTopic}`);
  if (context.intent) contextParts.push(`User intent: ${context.intent}`);
  if (context.sentiment) contextParts.push(`User sentiment: ${context.sentiment}`);
  if (contextParts.length > 0) {
    parts.push(`Current conversation context:\n${contextParts.join(', ')}`);
  }

  if (parts.length === 0) return '';

  return `--- Working Memory (Current Session) ---\n${parts.join('\n\n')}`;
}

/**
 * Clear working memory for a session
 */
export async function clearWorkingMemory(threadId: string): Promise<void> {
  workingMemoryCache.delete(threadId);
  await prisma.userMemory.deleteMany({
    where: {
      key: `working_memory:${threadId}`,
      type: 'WORKING',
    },
  });
}

/**
 * Clean up expired working memories
 */
export async function cleanupExpiredWorkingMemories(): Promise<number> {
  const result = await prisma.userMemory.deleteMany({
    where: {
      type: 'WORKING',
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
