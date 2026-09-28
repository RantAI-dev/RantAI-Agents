/**
 * Long-term Memory
 * Persistent user profiles stored in PostgreSQL
 */

import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { UserProfile, Fact, Preference, DEFAULT_MEMORY_CONFIG } from './types';
import {
  normalizeMemoryKey,
  isMultiValuePredicate,
  memoryKeyMatches,
  memoryValueMatches,
} from './fact-keys';
import { withKeyLock } from './profile-lock';
// import { extractFactsWithLLM } from './fact-extractor';
import { generateText } from 'ai';
import { getChatProvider, resolveModelId } from '@/lib/llm/provider';

/**
 * Generate LLM-based interaction summary from user profile
 */
async function generateInteractionSummary(profile: UserProfile): Promise<string> {
  if (profile.facts.length === 0 && profile.preferences.length === 0) {
    return 'New user with no recorded information yet.';
  }

  const factsStr = profile.facts.map(f => `${f.predicate}: ${f.object}`).join(', ');
  const prefsStr = profile.preferences.map(p => `${p.key}: ${p.value}`).join(', ');

  try {
    const { text } = await generateText({
      model: getChatProvider()(resolveModelId('openai/gpt-4o-mini')),
      prompt: `Summarize this user in 2-3 concise sentences based on their profile:
Facts: ${factsStr || 'None'}
Preferences: ${prefsStr || 'None'}
Total conversations: ${profile.totalConversations}

Provide a brief, natural-sounding summary that captures the key aspects of this user.`,
    });
    return text.trim();
  } catch (error) {
    console.error('[Long-term Memory] Error generating summary:', error);
    return `User with ${profile.facts.length} known facts and ${profile.preferences.length} preferences.`;
  }
}

/**
 * Load user profile from database
 */
export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const stored = await prisma.userMemory.findFirst({
      where: {
        userId,
        type: 'LONG_TERM',
        key: 'user_profile',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!stored) return null;

    return stored.value as unknown as UserProfile;
  } catch (error) {
    console.error('[Long-term Memory] Error loading profile:', error);
    return null;
  }
}

/**
 * Create a new user profile
 */
function createNewProfile(userId: string): UserProfile {
  return {
    id: nanoid(),
    userId,
    facts: [],
    preferences: [],
    interactionSummary: 'New user, no interaction history yet.',
    totalConversations: 0,
    lastInteractionAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Extract permanent facts from a conversation
 * Higher confidence threshold than working memory
 */
function extractPermanentFacts(
  userMessage: string,
  assistantResponse: string,
  source: string
): Fact[] {
  const facts: Fact[] = [];
  const content = userMessage.toLowerCase();

  // Strong indicators of permanent facts (English + Indonesian)
  const factPatterns = [
    // Children - English
    {
      pattern: /(?:i have|i've got)\s+(\d+)\s+(kids?|children)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'has_children',
        object: m[1],
      }),
    },
    // Children - Indonesian
    {
      pattern: /(?:punya|memiliki)\s+(\d+)\s+(?:anak|orang anak)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'has_children',
        object: m[1],
      }),
    },
    // Age - English
    {
      pattern: /(?:i am|i'm)\s+(\d+)\s+years?\s+old/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'age',
        object: m[1],
      }),
    },
    // Age - Indonesian
    {
      pattern: /(?:umur(?:\s+saya)?|usia(?:\s+saya)?|saya\s+umur|saya\s+berumur|berumur)\s+(\d+)\s*(?:tahun)?/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'age',
        object: m[1],
      }),
    },
    // Occupation - English
    {
      pattern: /(?:i work as|i'm a|my job is)\s+(?:a\s+)?([^,.!?]+)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'occupation',
        object: m[1].trim(),
      }),
    },
    // Occupation - Indonesian
    {
      pattern: /(?:kerja(?:\s+sebagai)?|bekerja(?:\s+sebagai)?|pekerjaan(?:\s+saya)?|profesi(?:\s+saya)?)\s+([^,.!?]+)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'occupation',
        object: m[1].trim(),
      }),
    },
    // Location - English
    {
      pattern: /(?:i live in|i'm from|based in)\s+([^,.!?]+)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'location',
        object: m[1].trim(),
      }),
    },
    // Location - Indonesian
    {
      // Bare "dari X" used to match here too ("dari tadi", "bukan dari Depok"), writing
      // junk locations; require a first-person "saya/aku (berasal) dari".
      pattern: /(?:tinggal(?:\s+di)?|rumah(?:\s+(?:saya|di))?|domisili(?:\s+di)?|(?:saya|aku)\s+(?:berasal\s+)?dari)\s+([^,.!?]+)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'location',
        object: m[1].trim(),
      }),
    },
    // Marital status - English
    {
      pattern: /(?:married|single|divorced|widowed)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'marital_status',
        object: m[0].toLowerCase(),
      }),
    },
    // Marital status - Indonesian
    {
      pattern: /(?:sudah\s+menikah|belum\s+menikah|lajang|janda|duda|cerai)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'marital_status',
        object: m[0].toLowerCase(),
      }),
    },
    // Salary - English
    {
      pattern: /(?:salary|income|earn|make)\s+(?:is\s+)?(?:Rp\.?|IDR|USD|\$)?\s*([\d,.]+(?:k|m|juta|rb)?)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'salary',
        object: m[1].trim(),
      }),
    },
    // Salary - Indonesian
    {
      pattern: /(?:gaji(?:\s+saya)?|pendapatan(?:\s+saya)?|penghasilan(?:\s+saya)?)\s+(?:Rp\.?|IDR)?\s*([\d,.]+(?:\s*(?:juta|rb|ribu|k))?)/i,
      extract: (m: RegExpMatchArray) => ({
        subject: 'user',
        predicate: 'salary',
        object: m[1].trim(),
      }),
    },
  ];

  for (const { pattern, extract } of factPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const extracted = extract(match);
      facts.push({
        id: nanoid(),
        ...extracted,
        confidence: 0.9,
        source,
        createdAt: new Date(),
      });
    }
  }

  // Name extraction for permanent profile
  const namePatterns = [
    /(?:my name is|i am|i'm|call me)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
    /(?:nama saya|panggil saya|aku)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
  ];

  for (const pattern of namePatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const rawName = match[1];
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      facts.push({
        id: nanoid(),
        subject: 'user',
        predicate: 'name',
        object: name,
        confidence: 0.95, // High confidence for names
        source,
        createdAt: new Date(),
      });
      break;
    }
  }

  return facts;
}

/**
 * Extract preferences from conversation
 */
function extractPreferences(
  userMessage: string,
  assistantResponse: string,
  source: string
): Preference[] {
  const preferences: Preference[] = [];
  const content = userMessage.toLowerCase();

  // Insurance product preferences
  if (content.includes('life insurance')) {
    preferences.push({
      id: nanoid(),
      category: 'product_interest',
      key: 'insurance_type',
      value: 'life',
      confidence: 0.8,
      source,
    });
  }
  if (content.includes('health insurance')) {
    preferences.push({
      id: nanoid(),
      category: 'product_interest',
      key: 'insurance_type',
      value: 'health',
      confidence: 0.8,
      source,
    });
  }
  if (content.includes('home insurance')) {
    preferences.push({
      id: nanoid(),
      category: 'product_interest',
      key: 'insurance_type',
      value: 'home',
      confidence: 0.8,
      source,
    });
  }

  // Communication preferences
  if (content.includes('email') || content.includes('please email')) {
    preferences.push({
      id: nanoid(),
      category: 'communication',
      key: 'preferred_channel',
      value: 'email',
      confidence: 0.7,
      source,
    });
  }
  if (content.includes('call') || content.includes('phone')) {
    preferences.push({
      id: nanoid(),
      category: 'communication',
      key: 'preferred_channel',
      value: 'phone',
      confidence: 0.7,
      source,
    });
  }

  return preferences;
}

// ---------------------------------------------------------------------------
// Merge / conflict resolution
// ---------------------------------------------------------------------------

function timeOf(v: { updatedAt?: Date | string; createdAt?: Date | string }): number {
  const raw = v.updatedAt ?? v.createdAt;
  if (!raw) return NaN;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Later-in-array wins unless the earlier one carries a strictly newer timestamp. */
function isNewerOrEqual(candidate: Fact | Preference, incumbent: Fact | Preference): boolean {
  const a = timeOf(candidate);
  const b = timeOf(incumbent);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a >= b;
}

/**
 * Canonicalize predicates and collapse duplicate single-valued facts, keeping the most
 * recent. Also repairs profiles written before predicates were normalized (e.g. a
 * legacy profile holding both "location: Depok" and "location: Bandung").
 */
export function collapseFacts(facts: Fact[]): Fact[] {
  const out: Fact[] = [];
  const singleIdx = new Map<string, number>();
  for (const raw of facts) {
    const fact: Fact = { ...raw, predicate: normalizeMemoryKey(raw.predicate) };
    if (isMultiValuePredicate(fact.predicate)) {
      const dup = out.findIndex(
        f => f.predicate === fact.predicate &&
          String(f.object).toLowerCase() === String(fact.object).toLowerCase()
      );
      if (dup >= 0) {
        if (isNewerOrEqual(fact, out[dup])) out[dup] = fact;
      } else {
        out.push(fact);
      }
      continue;
    }
    const idx = singleIdx.get(fact.predicate);
    if (idx === undefined) {
      singleIdx.set(fact.predicate, out.length);
      out.push(fact);
    } else if (isNewerOrEqual(fact, out[idx])) {
      out[idx] = fact;
    }
  }
  return out;
}

/** Same as collapseFacts for preferences (keyed on the normalized key, not category). */
export function collapsePreferences(prefs: Preference[]): Preference[] {
  const out: Preference[] = [];
  const singleIdx = new Map<string, number>();
  for (const raw of prefs) {
    const pref: Preference = { ...raw, key: normalizeMemoryKey(raw.key) };
    if (isMultiValuePredicate(pref.key)) {
      const dup = out.findIndex(
        p => p.key === pref.key && String(p.value).toLowerCase() === String(pref.value).toLowerCase()
      );
      if (dup >= 0) {
        if (isNewerOrEqual(pref, out[dup])) out[dup] = pref;
      } else {
        out.push(pref);
      }
      continue;
    }
    const idx = singleIdx.get(pref.key);
    if (idx === undefined) {
      singleIdx.set(pref.key, out.length);
      out.push(pref);
    } else if (isNewerOrEqual(pref, out[idx])) {
      out[idx] = pref;
    }
  }
  return out;
}

/**
 * Merge new facts into existing ones.
 * Single-valued predicates: the new value REPLACES the old one (latest wins), unless
 * the new one is below the profile confidence threshold and the old one is not.
 * Multi-valued predicates (interest, skill, hobby, ...): append, deduplicated by value.
 */
export function mergeFacts(existing: Fact[], newFacts: Fact[], now: Date = new Date()): Fact[] {
  const merged = collapseFacts(existing);
  const threshold = DEFAULT_MEMORY_CONFIG.profileUpdateThreshold;

  for (const raw of newFacts) {
    const newFact: Fact = { ...raw, predicate: normalizeMemoryKey(raw.predicate), updatedAt: now };

    if (isMultiValuePredicate(newFact.predicate)) {
      const dup = merged.findIndex(
        f => f.predicate === newFact.predicate &&
          String(f.object).toLowerCase() === String(newFact.object).toLowerCase()
      );
      if (dup >= 0) merged[dup] = { ...merged[dup], updatedAt: now };
      else merged.push(newFact);
      continue;
    }

    const existingIndex = merged.findIndex(f => f.predicate === newFact.predicate);
    if (existingIndex < 0) {
      merged.push(newFact);
      continue;
    }
    const old = merged[existingIndex];
    if (newFact.confidence < threshold && old.confidence >= threshold) continue;
    // Move to the end so array order also reflects recency.
    merged.splice(existingIndex, 1);
    merged.push(newFact);
  }

  return merged.slice(-DEFAULT_MEMORY_CONFIG.maxProfileFacts);
}

/** Merge preferences with the same latest-wins rule, keyed on the normalized key. */
export function mergePreferences(
  existing: Preference[],
  newPrefs: Preference[],
  now: Date = new Date()
): Preference[] {
  const merged = collapsePreferences(existing);

  for (const raw of newPrefs) {
    const newPref: Preference = { ...raw, key: normalizeMemoryKey(raw.key), updatedAt: now };
    if (!newPref.createdAt) newPref.createdAt = now;

    if (isMultiValuePredicate(newPref.key)) {
      const dup = merged.findIndex(
        p => p.key === newPref.key && String(p.value).toLowerCase() === String(newPref.value).toLowerCase()
      );
      if (dup >= 0) merged[dup] = { ...merged[dup], updatedAt: now };
      else merged.push(newPref);
      continue;
    }

    const existingIndex = merged.findIndex(p => p.key === newPref.key);
    if (existingIndex >= 0) merged.splice(existingIndex, 1);
    merged.push(newPref);
  }

  return merged.slice(-30);
}

/** Stable content fingerprint, used to detect "did the remembered data change". */
export function profileContentFingerprint(profile: Pick<UserProfile, 'facts' | 'preferences'>): string {
  const f = (profile.facts ?? []).map(x => `${normalizeMemoryKey(x.predicate)}=${x.object}`).sort();
  const p = (profile.preferences ?? []).map(x => `${normalizeMemoryKey(x.key)}=${x.value}`).sort();
  return JSON.stringify([f, p]);
}

/**
 * Apply new facts/preferences to a profile in place.
 * - latest wins per normalized key
 * - a new single-valued fact removes a preference with the same normalized key, and
 *   vice versa, so the prompt never shows "blue" as a fact and "green" as a
 *   preference (CHAT-023)
 * - if the remembered content changed, the LLM "Quick context" summary is
 *   invalidated so it cannot keep repeating the old value (CHAT-021)
 * Returns true if remembered content changed.
 */
export function applyMemoryUpdate(
  profile: UserProfile,
  facts: Fact[],
  preferences: Preference[],
  now: Date = new Date()
): boolean {
  const before = profileContentFingerprint(profile);

  if (facts.length > 0) {
    profile.facts = mergeFacts(profile.facts ?? [], facts, now);
    const factKeys = new Set(
      facts.map(f => normalizeMemoryKey(f.predicate)).filter(k => !isMultiValuePredicate(k))
    );
    profile.preferences = (profile.preferences ?? []).filter(p => !factKeys.has(normalizeMemoryKey(p.key)));
  } else {
    profile.facts = collapseFacts(profile.facts ?? []);
  }

  if (preferences.length > 0) {
    profile.preferences = mergePreferences(profile.preferences ?? [], preferences, now);
    const prefKeys = new Set(
      preferences.map(p => normalizeMemoryKey(p.key)).filter(k => !isMultiValuePredicate(k))
    );
    profile.facts = profile.facts.filter(f => !prefKeys.has(normalizeMemoryKey(f.predicate)));
  } else {
    profile.preferences = collapsePreferences(profile.preferences ?? []);
  }

  const changed = profileContentFingerprint(profile) !== before;
  if (changed) {
    profile.interactionSummary = '';
    profile.updatedAt = now;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Forget
// ---------------------------------------------------------------------------

export interface ForgetCriteria {
  /** Keys/labels to forget, e.g. ["location"], ["favorite color"]. Synonyms apply. */
  keys?: string[];
  /** Values/keywords to forget wherever they appear, e.g. ["Depok"]. */
  keywords?: string[];
  /** Forget everything stored about the user. */
  all?: boolean;
}

export interface ForgetResult {
  removedFacts: Array<{ key: string; value: string }>;
  removedPreferences: Array<{ key: string; value: string }>;
}

function factMatches(f: Fact, c: ForgetCriteria): boolean {
  if (c.all) return true;
  if ((c.keys ?? []).some(k => memoryKeyMatches(f.predicate, k))) return true;
  return (c.keywords ?? []).some(kw => memoryValueMatches(f.object, kw) || memoryKeyMatches(f.predicate, kw));
}

function prefMatches(p: Preference, c: ForgetCriteria): boolean {
  if (c.all) return true;
  if ((c.keys ?? []).some(k => memoryKeyMatches(p.key, k) || memoryKeyMatches(p.category, k))) return true;
  return (c.keywords ?? []).some(kw => memoryValueMatches(p.value, kw) || memoryKeyMatches(p.key, kw));
}

/** Remove matching facts/preferences from a profile in place. */
export function applyForget(profile: UserProfile, criteria: ForgetCriteria, now: Date = new Date()): ForgetResult {
  const removedFacts: ForgetResult['removedFacts'] = [];
  const removedPreferences: ForgetResult['removedPreferences'] = [];

  profile.facts = (profile.facts ?? []).filter(f => {
    if (!factMatches(f, criteria)) return true;
    removedFacts.push({ key: normalizeMemoryKey(f.predicate), value: String(f.object) });
    return false;
  });
  profile.preferences = (profile.preferences ?? []).filter(p => {
    if (!prefMatches(p, criteria)) return true;
    removedPreferences.push({ key: normalizeMemoryKey(p.key), value: String(p.value) });
    return false;
  });

  if (removedFacts.length > 0 || removedPreferences.length > 0 || criteria.all) {
    // The summary was written from the removed data; never let it outlive a deletion.
    profile.interactionSummary = '';
    profile.updatedAt = now;
  }
  return { removedFacts, removedPreferences };
}

// ---------------------------------------------------------------------------
// Serialized read-merge-write
// ---------------------------------------------------------------------------

const MAX_CAS_ATTEMPTS = 8;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

function hydrateProfile(value: unknown): UserProfile {
  // Deep copy: never mutate an object the Prisma client (or a cache) may still hold.
  const p = JSON.parse(JSON.stringify(value ?? {})) as UserProfile;
  p.facts = Array.isArray(p.facts) ? p.facts : [];
  p.preferences = Array.isArray(p.preferences) ? p.preferences : [];
  p.interactionSummary = typeof p.interactionSummary === 'string' ? p.interactionSummary : '';
  p.totalConversations = typeof p.totalConversations === 'number' ? p.totalConversations : 0;
  return p;
}

/**
 * Read-modify-write the user's profile, serialized per user.
 *
 * In-process: a per-user promise-chain lock. Across processes/instances: optimistic
 * compare-and-swap on the row's `updatedAt` (each write strictly advances it), retried
 * on conflict. The mutator may run more than once and must only depend on the profile
 * it is given. Return `false` from the mutator to skip the write.
 */
export async function mutateUserProfile(
  userId: string,
  mutator: (profile: UserProfile) => boolean | void
): Promise<{ profile: UserProfile; written: boolean }> {
  return withKeyLock(`profile:${userId}`, async () => {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      const row = await prisma.userMemory.findFirst({
        where: { userId, type: 'LONG_TERM', key: 'user_profile' },
        orderBy: { updatedAt: 'desc' },
      });
      const profile = row ? hydrateProfile(row.value) : createNewProfile(userId);
      if (mutator(profile) === false) return { profile, written: false };

      if (row) {
        const prevTs = new Date(row.updatedAt).getTime();
        const nextTs = new Date(Math.max(Date.now(), prevTs + 1));
        const { count } = await prisma.userMemory.updateMany({
          where: { id: row.id, updatedAt: row.updatedAt },
          data: { value: profile as object, updatedAt: nextTs },
        });
        if (count === 1) return { profile, written: true };
      } else {
        try {
          await prisma.userMemory.create({
            data: {
              id: `profile_${userId}`,
              userId,
              type: 'LONG_TERM',
              key: 'user_profile',
              value: profile as object,
            },
          });
          return { profile, written: true };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      // Lost the race to another writer: back off briefly and re-read.
      await new Promise(r => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
    }
    throw new Error(`[Long-term Memory] Profile write conflict for user ${userId} after ${MAX_CAS_ATTEMPTS} attempts`);
  });
}

/**
 * Save facts/preferences to the long-term profile NOW (used by the saveMemory tool).
 * Does not count as a conversation; the post-stream drain does that.
 */
export async function saveToUserProfile(
  userId: string,
  facts: Fact[],
  preferences: Preference[]
): Promise<{ profile: UserProfile; changed: boolean }> {
  let changed = false;
  const { profile } = await mutateUserProfile(userId, p => {
    changed = applyMemoryUpdate(p, facts, preferences);
    return changed;
  });
  return { profile, changed };
}

/** Remove matching facts/preferences from the long-term profile (forgetMemory tool). */
export async function forgetFromUserProfile(
  userId: string,
  criteria: ForgetCriteria
): Promise<ForgetResult> {
  let result: ForgetResult = { removedFacts: [], removedPreferences: [] };
  await mutateUserProfile(userId, p => {
    result = applyForget(p, criteria);
    return result.removedFacts.length > 0 || result.removedPreferences.length > 0 || !!criteria.all;
  });
  return result;
}

function summaryNeedsRefresh(profile: UserProfile): boolean {
  const hasContent = profile.facts.length > 0 || profile.preferences.length > 0;
  if (!hasContent) return false;
  const s = profile.interactionSummary ?? '';
  return s === '' || s.startsWith('New user') || profile.totalConversations % 5 === 0;
}

/**
 * Regenerate the "Quick context" summary from the CURRENT facts. The LLM call runs
 * outside the profile lock; the result is only stored if the facts did not change in
 * the meantime, so a summary can never describe data that was since updated/forgotten.
 */
export async function refreshInteractionSummary(userId: string): Promise<void> {
  const current = await loadUserProfile(userId);
  if (!current) return;
  const fp = profileContentFingerprint(current);
  const summary = await generateInteractionSummary(current);
  await mutateUserProfile(userId, p => {
    if (profileContentFingerprint(p) !== fp) return false;
    p.interactionSummary = summary;
    return true;
  });
}

/**
 * Update user profile after a conversation turn (post-stream drain).
 *
 * `options.extract` (default true) controls the regex fallback. Callers pass false when
 * the model already used saveMemory/forgetMemory this turn: those writes are applied at
 * tool-call time, and re-running regex over e.g. "forget that I live in Depok" would
 * re-add the fact the user just asked to delete.
 */
export async function updateUserProfile(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  conversationId: string,
  extractedFacts?: Fact[],
  extractedPreferences?: Preference[],
  options: { extract?: boolean } = {}
): Promise<UserProfile> {
  const extract = options.extract !== false;

  const newFacts = extractedFacts && extractedFacts.length > 0
    ? extractedFacts
    : extract ? extractPermanentFacts(userMessage, assistantResponse, conversationId) : [];

  const newPrefs = extractedPreferences && extractedPreferences.length > 0
    ? extractedPreferences
    : extract ? extractPreferences(userMessage, assistantResponse, conversationId) : [];

  let { profile } = await mutateUserProfile(userId, p => {
    applyMemoryUpdate(p, newFacts, newPrefs);
    p.totalConversations += 1;
    p.lastInteractionAt = new Date();
    p.updatedAt = new Date();
    return true;
  });

  if (summaryNeedsRefresh(profile)) {
    await refreshInteractionSummary(userId);
    profile = (await loadUserProfile(userId)) ?? profile;
  }

  return profile;
}

function formatUpdated(v: Fact | Preference): string {
  const t = timeOf(v);
  if (Number.isNaN(t)) return '';
  return ` (updated ${new Date(t).toISOString().slice(0, 10)})`;
}

/**
 * Format user profile for prompt injection
 */
export function formatUserProfileForPrompt(profile: UserProfile | null): string {
  if (!profile) return '';

  const parts: string[] = [];

  let facts = collapseFacts(profile.facts ?? [])
    .filter(f => f.confidence >= DEFAULT_MEMORY_CONFIG.profileUpdateThreshold);
  let prefs = collapsePreferences(profile.preferences ?? []).filter(p => p.confidence >= 0.7);

  // Defensive: a fact and a preference on the same single-valued key -> keep the newer.
  const prefByKey = new Map(prefs.filter(p => !isMultiValuePredicate(p.key)).map(p => [p.key, p]));
  const dropPrefKeys = new Set<string>();
  facts = facts.filter(f => {
    const p = prefByKey.get(f.predicate);
    if (!p || isMultiValuePredicate(f.predicate)) return true;
    const pt = timeOf(p);
    const ft = timeOf(f);
    if (!Number.isNaN(pt) && (Number.isNaN(ft) || pt > ft)) return false; // preference is newer
    dropPrefKeys.add(p.key);
    return true;
  });
  prefs = prefs.filter(p => !dropPrefKeys.has(p.key));

  if (facts.length > 0) {
    parts.push(`Known facts about this user:\n${facts.map(f => `- ${f.predicate}: ${f.object}${formatUpdated(f)}`).join('\n')}`);
  }

  if (prefs.length > 0) {
    parts.push(`User preferences:\n${prefs.map(p => `- ${p.key}: ${p.value}${formatUpdated(p)}`).join('\n')}`);
  }

  // Add interaction summary (it is cleared whenever facts change, so it never predates them)
  if (profile.interactionSummary && !profile.interactionSummary.startsWith('New user')) {
    parts.push(`Quick context: ${profile.interactionSummary}`);
  }

  // Add interaction history
  if (profile.totalConversations > 1) {
    const lastDate = profile.lastInteractionAt ? new Date(profile.lastInteractionAt) : new Date();
    parts.push(`Interaction history: ${profile.totalConversations} conversations, last: ${lastDate.toLocaleDateString()}`);
  }

  if (parts.length === 0) return '';

  const rule =
    'Each item holds the CURRENT value. If anything here (or in past messages) conflicts, ' +
    'the most recently updated value is authoritative; treat older values as outdated and ' +
    'do not ask the user to choose between them. Anything the user asked to forget has been removed.';

  return `--- Long-term User Profile ---\n${rule}\n\n${parts.join('\n\n')}`;
}

/**
 * Clear user profile
 */
export async function clearUserProfile(userId: string): Promise<void> {
  await prisma.userMemory.deleteMany({
    where: {
      userId,
      type: 'LONG_TERM',
      key: 'user_profile',
    },
  });
  console.log(`[Long-term Memory] Cleared profile for user ${userId}`);
}
