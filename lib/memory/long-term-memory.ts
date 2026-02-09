/**
 * Long-term Memory
 * Persistent user profiles stored in PostgreSQL
 */

import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { UserProfile, Fact, Preference, DEFAULT_MEMORY_CONFIG } from './types';
// import { extractFactsWithLLM } from './fact-extractor';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

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
      model: openrouter('openai/gpt-4o-mini'),
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
 * Save user profile to database
 */
async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const profileId = `profile_${userId}`;

  await prisma.userMemory.upsert({
    where: { id: profileId },
    create: {
      id: profileId,
      userId,
      type: 'LONG_TERM',
      key: 'user_profile',
      value: profile as object,
    },
    update: {
      value: profile as object,
      updatedAt: new Date(),
    },
  });
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
      pattern: /(?:tinggal(?:\s+di)?|rumah(?:\s+(?:saya|di))?|domisili(?:\s+di)?|dari)\s+([^,.!?]+)/i,
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

/**
 * Merge new facts with existing, avoiding duplicates
 */
const MULTI_VALUE_PREDICATES = [
  'interest',
  'location',
  'language',
  'skill',
  'hobby',
  'visited',
  'preference',
];

/**
 * Merge new facts with existing, avoiding duplicates
 */
function mergeFacts(existing: Fact[], newFacts: Fact[]): Fact[] {
  const merged = [...existing];

  for (const newFact of newFacts) {
    const isMultiValue = MULTI_VALUE_PREDICATES.includes(newFact.predicate);

    if (isMultiValue) {
      // Multi-value: Add if object value doesn't exist for this predicate
      const duplicate = merged.find(
        f => f.predicate === newFact.predicate &&
          f.object.toLowerCase() === newFact.object.toLowerCase()
      );
      if (!duplicate) {
        merged.push(newFact);
      }
    } else {
      // Single-value: Find existing fact with same predicate
      const existingIndex = merged.findIndex(f => f.predicate === newFact.predicate);

      if (existingIndex >= 0) {
        // Update if new fact has higher confidence OR is newer and reasonable confidence
        // We favor the latest information from the user for single-value fields (like budget, age)
        const existingFact = merged[existingIndex];

        // If new fact is >= old confidence, update.
        // OR if new fact is > 0.8 confidence (high certainty), update regardless of old one.
        if (newFact.confidence >= existingFact.confidence || newFact.confidence >= 0.8) {
          merged[existingIndex] = newFact;
        }
      } else {
        // Add new fact
        merged.push(newFact);
      }
    }
  }

  // Limit to max facts
  return merged.slice(-DEFAULT_MEMORY_CONFIG.maxProfileFacts);
}

/**
 * Merge preferences
 */
function mergePreferences(existing: Preference[], newPrefs: Preference[]): Preference[] {
  const merged = [...existing];

  for (const newPref of newPrefs) {
    const existingIndex = merged.findIndex(
      p => p.category === newPref.category && p.key === newPref.key
    );

    if (existingIndex >= 0) {
      // Update if new preference has same or higher confidence (so explicit "ganti X jadi Y" replaces)
      if (newPref.confidence >= merged[existingIndex].confidence) {
        merged[existingIndex] = newPref;
      }
    } else {
      merged.push(newPref);
    }
  }

  return merged.slice(-30); // Limit preferences
}

/**
 * Update user profile after a conversation
 */
// Update user profile after a conversation
export async function updateUserProfile(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  conversationId: string,
  extractedFacts?: Fact[],
  extractedPreferences?: Preference[]
): Promise<UserProfile> {
  // Load existing profile or create new
  let profile = await loadUserProfile(userId);
  if (!profile) {
    // console.log(`[Long-term Memory] No existing profile for user ${userId}, creating new.`);
    profile = createNewProfile(userId);
  } else {
    // console.log(`[Long-term Memory] Loaded existing profile for user ${userId}: ${profile.facts.length} facts`);
  }

  // Use provided facts or extract using regex (fallback)
  const newFacts = extractedFacts && extractedFacts.length > 0
    ? extractedFacts
    : extractPermanentFacts(userMessage, assistantResponse, conversationId);

  if (newFacts.length > 0) {
    // console.log(`[Long-term Memory] Extracted ${newFacts.length} new facts:`, JSON.stringify(newFacts, null, 2));
  }

  // Merge facts
  const oldFactCount = profile.facts.length;
  profile.facts = mergeFacts(profile.facts, newFacts);

  if (profile.facts.length > oldFactCount) {
    // console.log(`[Long-term Memory] Profile updated. Facts increased from ${oldFactCount} to ${profile.facts.length}`);
  }

  // Use provided preferences or extract
  const newPrefs = extractedPreferences && extractedPreferences.length > 0
    ? extractedPreferences
    : extractPreferences(userMessage, assistantResponse, conversationId);

  if (newPrefs.length > 0) {
    // console.log(`[Long-term Memory] Extracted ${newPrefs.length} new preferences`);
  }
  profile.preferences = mergePreferences(profile.preferences, newPrefs);

  // Update metadata
  profile.totalConversations += 1;
  profile.lastInteractionAt = new Date();
  profile.updatedAt = new Date();

  // Generate updated interaction summary (every 5 conversations to save API calls)
  if (profile.totalConversations % 5 === 0 || profile.interactionSummary.startsWith('New user')) {
    // console.log(`[Long-term Memory] Generating interaction summary...`);
    profile.interactionSummary = await generateInteractionSummary(profile);
  }

  // Save profile
  // console.log(`[Long-term Memory] Saving profile for user ${userId}...`);
  await saveUserProfile(userId, profile);
  // console.log(`[Long-term Memory] Profile saved successfully.`);

  return profile;
}

/**
 * Format user profile for prompt injection
 */
export function formatUserProfileForPrompt(profile: UserProfile | null): string {
  if (!profile) return '';

  const parts: string[] = [];

  // Format key facts
  if (profile.facts.length > 0) {
    const factLines = profile.facts
      .filter(f => f.confidence >= DEFAULT_MEMORY_CONFIG.profileUpdateThreshold)
      .map(f => `- ${f.predicate}: ${f.object}`)
      .join('\n');
    if (factLines) {
      parts.push(`Known facts about this user:\n${factLines}`);
    }
  }

  // Format preferences
  if (profile.preferences.length > 0) {
    const prefLines = profile.preferences
      .filter(p => p.confidence >= 0.7)
      .map(p => `- ${p.key}: ${p.value}`)
      .join('\n');
    if (prefLines) {
      parts.push(`User preferences:\n${prefLines}`);
    }
  }

  // Add interaction summary
  if (profile.interactionSummary && !profile.interactionSummary.startsWith('New user')) {
    parts.push(`Quick context: ${profile.interactionSummary}`);
  }

  // Add interaction history
  if (profile.totalConversations > 1) {
    const lastDate = profile.lastInteractionAt ? new Date(profile.lastInteractionAt) : new Date();
    parts.push(`Interaction history: ${profile.totalConversations} conversations, last: ${lastDate.toLocaleDateString()}`);
  }

  if (parts.length === 0) return '';

  return `--- Long-term User Profile ---\n${parts.join('\n\n')}`;
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
