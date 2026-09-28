/**
 * saveMemory / forgetMemory tools shared by the dashboard chat and the widget.
 *
 * Writes happen INSIDE the tool call and are awaited, so the tool result is the truth
 * about what was stored. Previously saveMemory pushed onto a module-level queue and
 * returned `{ success: true, queued: true }`; the real write only happened after the
 * stream finished, and was skipped (with the queue entry leaked) if the client
 * disconnected — so a confirmed update could silently never land (QA CHAT-021), and
 * there was no way at all to delete (CHAT-022).
 */

import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Entity, Fact, Preference } from './types';
import {
  saveToUserProfile,
  forgetFromUserProfile,
  type ForgetCriteria,
} from './long-term-memory';
import { updateWorkingMemory, forgetFromWorkingMemory } from './working-memory';

export const saveMemoryInputSchema = z.object({
  facts: z.array(z.object({
    category: z.string().describe("Category of fact (e.g. 'bio', 'work', 'family')"),
    label: z.string().describe("Label/Predicate (e.g. 'age', 'occupation', 'location'). Reuse the same label when updating a value — the new value replaces the old one."),
    value: z.string().describe("Value/Object (e.g. '30', 'Engineer')"),
    confidence: z.number().min(0).max(1).default(0.9),
  })).optional(),
  preferences: z.array(z.object({
    category: z.string().describe("Category (e.g. 'communication', 'product')"),
    preference: z.string().describe("Key (e.g. 'channel', 'insurance_type')"),
    value: z.string().describe("Value (e.g. 'email', 'life')"),
  })).optional(),
  entities: z.array(z.object({
    name: z.string().describe("Name of entity (person, organization, etc.)"),
    type: z.string().describe("Type of entity (Person, Organization, Date, Location)"),
  })).optional(),
});

export const forgetMemoryInputSchema = z.object({
  keys: z.array(z.string()).optional()
    .describe("Labels/topics to forget, e.g. ['location'] for 'forget where I live', ['favorite_color']."),
  keywords: z.array(z.string()).optional()
    .describe("Specific values to forget wherever they are stored, e.g. ['Depok']."),
  all: z.boolean().optional()
    .describe(
      "true ONLY when the user asks to forget everything about them with no topic named " +
        "(\"forget everything about me\", \"hapus semua data saya\"). If they name a topic — even " +
        "\"all information about my location\" / \"semua informasi tentang lokasi saya\" — use keys " +
        "(e.g. ['location']) and leave this unset.",
    ),
});

export type SaveMemoryInput = z.infer<typeof saveMemoryInputSchema>;
export type ForgetMemoryInput = z.infer<typeof forgetMemoryInputSchema>;

export interface MemoryToolContext {
  threadId: string;
  /** Owner of the working-memory rows (e.g. `anon_<threadId>` for anonymous users). */
  workingMemoryUserId: string;
  workingMemoryEnabled: boolean;
  /** Owner of the long-term profile; null when anonymous or long-term memory is off. */
  profileUserId: string | null;
  /** Owner of semantic (vector) memory to scrub on forget; null to skip. */
  semanticUserId: string | null;
  /** The user's message this turn (for working-memory context detection). */
  userMessage: string;
  /** Hook after a successful profile write (widget: refresh visitor TTL). */
  afterProfileWrite?: () => Promise<unknown>;
}

/** Per-request flags the post-stream drain reads. */
export interface MemoryToolState {
  /** A memory tool ran this turn -> drain must not regex-extract / re-apply. */
  used: boolean;
  /** forgetMemory ran this turn -> drain must not re-store this turn in semantic memory. */
  forgot: boolean;
}

export function toFacts(input: SaveMemoryInput['facts'], source: string): Fact[] {
  const now = new Date();
  return (input ?? []).map(f => ({
    id: `fact_${nanoid(10)}`,
    subject: 'user',
    predicate: f.label || 'unknown',
    object: f.value || 'unknown',
    confidence: typeof f.confidence === 'number' ? f.confidence : 0.9,
    source,
    createdAt: now,
    updatedAt: now,
  }));
}

export function toPreferences(input: SaveMemoryInput['preferences'], source: string): Preference[] {
  const now = new Date();
  return (input ?? []).map(p => ({
    id: `pref_${nanoid(10)}`,
    category: p.category || 'general',
    key: p.preference || 'unknown',
    value: p.value || 'unknown',
    confidence: 0.9,
    source,
    createdAt: now,
    updatedAt: now,
  }));
}

export function toEntities(input: SaveMemoryInput['entities'], source: string): Entity[] {
  return (input ?? []).map(e => ({
    id: `ent_${nanoid(10)}`,
    name: e.name || 'unknown',
    type: (e.type || 'other') as Entity['type'],
    source,
    createdAt: new Date(),
    attributes: {},
    confidence: 0.9,
  }));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function executeSaveMemory(
  ctx: MemoryToolContext,
  state: MemoryToolState,
  input: SaveMemoryInput
) {
  state.used = true;
  const facts = toFacts(input?.facts, ctx.threadId);
  const preferences = toPreferences(input?.preferences, ctx.threadId);
  const entities = toEntities(input?.entities, ctx.threadId);
  const errors: string[] = [];
  let profile: 'saved' | 'unchanged' | 'not_enabled' | 'failed' = 'not_enabled';
  let workingMemory: 'saved' | 'not_enabled' | 'failed' = 'not_enabled';

  if (ctx.profileUserId && (facts.length > 0 || preferences.length > 0)) {
    try {
      const { changed } = await saveToUserProfile(ctx.profileUserId, facts, preferences);
      profile = changed ? 'saved' : 'unchanged';
      if (ctx.afterProfileWrite) await ctx.afterProfileWrite().catch(() => undefined);
    } catch (e) {
      profile = 'failed';
      errors.push(`profile: ${errMsg(e)}`);
      console.error('[Memory Tool] saveMemory profile write failed:', e);
    }
  }

  if (ctx.workingMemoryEnabled && (facts.length > 0 || entities.length > 0)) {
    try {
      await updateWorkingMemory(
        ctx.workingMemoryUserId,
        ctx.threadId,
        ctx.userMessage,
        '',
        `msg_${Date.now()}`,
        entities,
        facts,
        { extract: false }
      );
      workingMemory = 'saved';
    } catch (e) {
      workingMemory = 'failed';
      errors.push(`working memory: ${errMsg(e)}`);
      console.error('[Memory Tool] saveMemory working-memory write failed:', e);
    }
  }

  return {
    success: errors.length === 0,
    stored: { profile, workingMemory },
    items: { facts: facts.length, preferences: preferences.length, entities: entities.length },
    ...(errors.length > 0
      ? { error: errors.join('; '), note: 'Not saved. Tell the user it could not be saved.' }
      : {}),
  };
}

export async function executeForgetMemory(
  ctx: MemoryToolContext,
  state: MemoryToolState,
  input: ForgetMemoryInput
) {
  state.used = true;
  const criteria: ForgetCriteria = {
    keys: (input?.keys ?? []).filter(k => typeof k === 'string' && k.trim().length > 0),
    keywords: (input?.keywords ?? []).filter(k => typeof k === 'string' && k.trim().length > 1),
    all: input?.all === true,
  };
  if (!criteria.all && criteria.keys!.length === 0 && criteria.keywords!.length === 0) {
    return {
      success: false,
      removed: {
        facts: [] as Array<{ key: string; value: string }>,
        preferences: [] as Array<{ key: string; value: string }>,
        workingMemoryItems: 0,
        semanticMemory: 'skipped' as const,
      },
      message: 'Nothing was deleted: no keys, keywords, or all=true were given.',
      error: 'Nothing specified to forget. Pass keys, keywords, or all=true.',
    };
  }
  state.forgot = true;

  const errors: string[] = [];
  let removedFacts: Array<{ key: string; value: string }> = [];
  let removedPreferences: Array<{ key: string; value: string }> = [];
  let workingMemoryItems = 0;
  let semantic: 'deleted' | 'skipped' | 'failed' = 'skipped';

  if (ctx.profileUserId) {
    try {
      const r = await forgetFromUserProfile(ctx.profileUserId, criteria);
      removedFacts = r.removedFacts;
      removedPreferences = r.removedPreferences;
    } catch (e) {
      errors.push(`profile: ${errMsg(e)}`);
      console.error('[Memory Tool] forgetMemory profile delete failed:', e);
    }
  }

  if (ctx.workingMemoryEnabled) {
    try {
      workingMemoryItems = await forgetFromWorkingMemory(ctx.workingMemoryUserId, ctx.threadId, criteria);
    } catch (e) {
      errors.push(`working memory: ${errMsg(e)}`);
      console.error('[Memory Tool] forgetMemory working-memory delete failed:', e);
    }
  }

  if (ctx.semanticUserId && (criteria.all || criteria.keywords!.length > 0)) {
    try {
      const sv = await import('./surreal-vector');
      if (criteria.all) await sv.deleteUserMemories(ctx.semanticUserId);
      else await sv.deleteUserMemoriesContaining(ctx.semanticUserId, criteria.keywords!);
      semantic = 'deleted';
    } catch (e) {
      // Vector store may be absent (e.g. no SurrealDB); profile deletion still stands.
      semantic = 'failed';
      console.error('[Memory Tool] forgetMemory semantic delete failed:', e);
    }
  }

  const total = removedFacts.length + removedPreferences.length + workingMemoryItems;
  let message: string;
  if (errors.length > 0) {
    message = 'Deletion failed or was incomplete. Tell the user it could not be fully deleted.';
  } else if (total === 0 && !criteria.all) {
    message = 'No stored memory matched; nothing was deleted. Tell the user nothing matching was stored.';
  } else {
    message = 'Deleted. It will not be used in future conversations.';
  }

  return {
    success: errors.length === 0,
    removed: {
      facts: removedFacts,
      preferences: removedPreferences,
      workingMemoryItems,
      semanticMemory: semantic,
    },
    message,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
}

export function createMemoryTools(ctx: MemoryToolContext) {
  const state: MemoryToolState = { used: false, forgot: false };
  const tools = {
    saveMemory: tool({
      description:
        'Save important facts, preferences, and entities about the user. Saved immediately; ' +
        'a value for an existing label REPLACES the old value (use it for updates/corrections).',
      inputSchema: zodSchema(saveMemoryInputSchema),
      execute: async (input: SaveMemoryInput) => executeSaveMemory(ctx, state, input),
    }),
    forgetMemory: tool({
      description:
        'Delete stored memory about the user. Call this whenever the user asks you to forget, ' +
        'delete or remove something (e.g. "forget my location", "hapus/lupakan data saya"). ' +
        'Returns exactly what was removed.',
      inputSchema: zodSchema(forgetMemoryInputSchema),
      execute: async (input: ForgetMemoryInput) => executeForgetMemory(ctx, state, input),
    }),
  };
  return { tools, state };
}
