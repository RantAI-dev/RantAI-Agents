/**
 * LLM-based Fact Extractor for Memory System
 * Extracts user facts from conversation without manual regex patterns
 */

import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Fact } from './types';
import { nanoid } from 'nanoid';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const EXTRACTION_PROMPT = `You are a fact extraction assistant. Extract personal facts about the USER from their message.

Extract ONLY facts the user explicitly states about THEMSELVES. Return a JSON array.

Categories to extract:
- name: User's name
- age: User's age
- location: Where user lives/from
- occupation: User's job/profession
- salary: User's income/salary
- children: Number of children
- marital_status: married/single/divorced
- hobbies: User's interests
- company: Where they work
- education: Schools/degrees

Rules:
1. ONLY extract what user explicitly states about themselves
2. Do NOT infer or assume
3. Return empty array [] if no facts found
4. Use the user's original language for values

Return ONLY valid JSON array like:
[{"type": "name", "value": "Sulthan"}, {"type": "age", "value": "22"}]

User message: `;

interface ExtractedFact {
  type: string;
  value: string;
}

/**
 * Extract facts from user message using LLM
 */
export async function extractFactsWithLLM(
  userMessage: string,
  source: string
): Promise<Fact[]> {
  if (!userMessage || userMessage.length < 5) {
    return [];
  }

  try {
    const { text } = await generateText({
      model: openrouter('openai/gpt-4o-mini'),
      prompt: EXTRACTION_PROMPT + userMessage,
    });

    // Parse JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const extracted: ExtractedFact[] = JSON.parse(jsonMatch[0]);

    // Convert to Fact format
    return extracted.map((e) => ({
      id: nanoid(),
      subject: 'user',
      predicate: e.type,
      object: e.value,
      confidence: 0.9,
      source,
      createdAt: new Date(),
    }));
  } catch (error) {
    console.error('[Fact Extractor] LLM extraction failed:', error);
    return [];
  }
}
