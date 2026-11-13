#!/usr/bin/env bun
/**
 * Oracle for the long-term user memory port (TypeScript -> Rust).
 *
 * The old TypeScript is the specification. This script runs the OLD implementation on one
 * JSON input per line and prints one JSON result per line:
 *
 *   bun port/oracle/memory.ts < input.jsonl
 *   bun port/oracle/memory.ts --cases port/cases/memory.in.jsonl > port/cases/memory.jsonl
 *
 * Input:  {"fn": "normalizeMemoryKey", "args": ["Base"]}
 * Output (--cases mode): {"fn": ..., "args": ..., "expected": ...}
 *
 * The old modules import Prisma, the LLM provider and `server-only`, none of which a script
 * can load, so they are bundled with those imports stubbed (Bun.build plugins). The stub for
 * Prisma is a small in-memory store, so the memory TOOLS run their real code path (write,
 * forget, result message) against it. `src/lib/memory/long-term-memory.ts` keeps
 * `summaryNeedsRefresh` private; the bundle appends one export line so the oracle can call
 * it. Nothing else in the old source is changed.
 *
 * Run it with TZ=UTC: the old formatter printed the interaction date with
 * `toLocaleDateString()`, which depends on the locale and the time zone.
 *
 * Two values cannot be taken from the old code and are projected instead: the ids and the
 * timestamps that `toFacts`/`toPreferences` generate from `nanoid()` and `new Date()`. The
 * projection replaces them with the values the caller injects in Rust ("<generated>" and the
 * `now` argument), because this crate takes time and ids from its caller.
 */

import { plugin } from "bun";
import path from "node:path";

process.env.TZ = "UTC";

const ROOT = path.resolve(import.meta.dir, "../..");
const CACHE = path.join(ROOT, "node_modules/.cache/rantai-port");

const STUBS: Record<string, string> = {
  "@/lib/prisma": `
export const prisma = {
  userMemory: {
    findFirst: async (args) => globalThis.__ORACLE_DB__.findFirst(args),
    updateMany: async (args) => globalThis.__ORACLE_DB__.updateMany(args),
    create: async (args) => globalThis.__ORACLE_DB__.create(args),
    deleteMany: async (args) => globalThis.__ORACLE_DB__.deleteMany(args),
  },
};`,
  "@/lib/llm/provider": `
export const getChatProvider = () => () => ({});
export const resolveModelId = (id) => id;`,
  "server-only": "export default {};",
  "./surreal-vector": `
export const deleteUserMemories = async () => {};
export const deleteUserMemoriesContaining = async () => {};
export const storeInVectorStore = async () => {};`,
};

/**
 * The relative stubs only apply to the module that imports them: `./config` from
 * `src/lib/memory/index.ts` is the memory config, not the RAG config.
 */
const RELATIVE_STUBS: Record<string, string> = {
  "./working-memory": `
export const formatWorkingMemoryForPrompt = () => "";
export const updateWorkingMemory = async () => {};
export const forgetFromWorkingMemory = async () => 0;
export const loadWorkingMemory = async () => null;
export const clearWorkingMemory = async () => {};
export const cleanupExpiredWorkingMemories = async () => 0;`,
  "./semantic-memory": `
export const formatSemanticRecallForPrompt = () => "";
export const storeForSemanticRecall = async () => {};
export const semanticRecall = async () => [];
export const clearSemanticMemory = async () => {};`,
  "./mastra-memory": "export {};",
  "./mastra-adapter": "export {};",
  "./config": "export const MEMORY_CONFIG = {}; export const getMemoryConfigSummary = () => ({});",
};

function stubFor(importer: string, specifier: string): string | undefined {
  const direct = STUBS[specifier];
  if (direct) return direct;
  if (!specifier.startsWith("./")) return undefined;
  const relative = RELATIVE_STUBS[specifier];
  if (!relative) return undefined;
  const inMemoryDir = importer.includes("/src/lib/memory/");
  return inMemoryDir ? relative : undefined;
}

/** The old module's types. The rows arrive as JSON, so a date is a string or a Date. */
interface OldFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

interface OldPreference {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface OldProfile {
  id: string;
  userId: string;
  facts: OldFact[];
  preferences: OldPreference[];
  interactionSummary: string;
  totalConversations: number;
  lastInteractionAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface OldForgetCriteria {
  keys?: string[];
  keywords?: string[];
  all?: boolean;
}

interface OldForgetResult {
  removedFacts: { key: string; value: string }[];
  removedPreferences: { key: string; value: string }[];
}

interface OldSaveFact {
  category: string;
  label: string;
  value: string;
  confidence?: number;
}

interface OldSavePreference {
  category: string;
  preference: string;
  value: string;
}

interface FactKeysModule {
  normalizeMemoryKey(raw: string | null | undefined): string;
  isMultiValuePredicate(predicate: string): boolean;
  memoryKeyMatches(storedKey: string, requestKey: string): boolean;
  memoryValueMatches(value: string | null | undefined, keyword: string): boolean;
}

interface LongTermModule {
  collapseFacts(facts: OldFact[]): OldFact[];
  collapsePreferences(preferences: OldPreference[]): OldPreference[];
  mergeFacts(existing: OldFact[], newFacts: OldFact[], now: Date): OldFact[];
  mergePreferences(
    existing: OldPreference[],
    newPreferences: OldPreference[],
    now: Date,
  ): OldPreference[];
  applyMemoryUpdate(
    profile: OldProfile,
    facts: OldFact[],
    preferences: OldPreference[],
    now: Date,
  ): boolean;
  applyForget(
    profile: OldProfile,
    criteria: OldForgetCriteria,
    now: Date,
  ): OldForgetResult;
  profileContentFingerprint(profile: OldProfile): string;
  summaryNeedsRefresh(profile: OldProfile): boolean;
  formatUserProfileForPrompt(profile: OldProfile | null): string;
}

interface MemoryToolsModule {
  toFacts(input: OldSaveFact[] | undefined, source: string): OldFact[];
  toPreferences(input: OldSavePreference[] | undefined, source: string): OldPreference[];
  executeSaveMemory(ctx: unknown, state: unknown, input: unknown): Promise<unknown>;
  executeForgetMemory(ctx: unknown, state: unknown, input: unknown): Promise<unknown>;
  createMemoryTools(ctx: unknown): {
    tools: Record<string, { description: string; inputSchema: { jsonSchema: unknown } }>;
  };
}

interface MemoryIndexModule {
  buildPromptWithMemory(
    basePrompt: string,
    workingMemory: unknown,
    semanticResults: unknown[],
    userProfile: OldProfile | null,
  ): string;
}

/** An argument of a case. */
function argString(args: unknown[], index: number): string {
  const value = args[index];
  return typeof value === "string" ? value : "";
}

function argArray(args: unknown[], index: number): unknown[] {
  const value = args[index];
  return Array.isArray(value) ? value : [];
}

function argRecord(args: unknown[], index: number): Record<string, unknown> {
  const value = args[index];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type Row = {
  id: string;
  userId: string;
  type: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/** The store the stubbed Prisma talks to: one LONG_TERM `user_profile` row per user. */
function fakeDb() {
  const rows = new Map<string, Row>();
  const state = { fail: false };
  return {
    rows,
    state,
    reset() {
      rows.clear();
      state.fail = false;
    },
    seed(userId: string, value: unknown) {
      const now = new Date();
      rows.set(`profile_${userId}`, {
        id: `profile_${userId}`,
        userId,
        type: "LONG_TERM",
        key: "user_profile",
        value,
        createdAt: now,
        updatedAt: now,
      });
    },
    async findFirst({ where }: { where: { userId: string; type: string; key: string } }) {
      if (state.fail) throw new Error("db down");
      const found = [...rows.values()].filter(
        (r) => r.userId === where.userId && r.type === where.type && r.key === where.key,
      );
      found.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return found[0] ?? null;
    },
    async updateMany({ where, data }: { where: { id: string; updatedAt: Date }; data: Row }) {
      const row = rows.get(where.id);
      if (!row) return { count: 0 };
      if (row.updatedAt.getTime() !== new Date(where.updatedAt).getTime()) return { count: 0 };
      row.value = data.value;
      row.updatedAt = data.updatedAt;
      return { count: 1 };
    },
    async create({ data }: { data: Row }) {
      const now = new Date();
      const row = { ...data, createdAt: now, updatedAt: now };
      rows.set(row.id, row);
      return row;
    },
    async deleteMany() {
      return { count: 0 };
    },
  };
}

const db = fakeDb();
(globalThis as unknown as { __ORACLE_DB__: unknown }).__ORACLE_DB__ = db;

/** Bundle one old module with the heavy imports stubbed, then import it. */
async function loadOld(entry: string, append = ""): Promise<unknown> {
  const result = await Bun.build({
    entrypoints: [path.join(ROOT, entry)],
    target: "bun",
    plugins: [
      {
        name: "oracle-stubs",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const stub = stubFor(args.importer, args.path);
            return stub ? { path: args.path, namespace: "oracle-stub" } : undefined;
          });
          build.onLoad({ filter: /.*/, namespace: "oracle-stub" }, (args) => ({
            contents: STUBS[args.path] ?? RELATIVE_STUBS[args.path],
            loader: "ts",
          }));
          if (append) {
            build.onLoad({ filter: /long-term-memory\.ts$/ }, async (args) => ({
              contents: (await Bun.file(args.path).text()) + append,
              loader: "ts",
            }));
          }
        },
      },
    ],
  });
  if (!result.success) {
    console.error(result.logs);
    throw new Error(`oracle: cannot bundle ${entry}`);
  }
  const out = path.join(CACHE, entry.replace(/[\/.]/g, "-") + ".ts");
  await Bun.write(out, await result.outputs[0]!.text());
  return (await import(out)) as unknown;
}

const factKeys = (await loadOld("src/lib/memory/fact-keys.ts")) as FactKeysModule;
const longTerm = (await loadOld(
  "src/lib/memory/long-term-memory.ts",
  "\nexport { summaryNeedsRefresh };\n",
)) as LongTermModule;
const memoryTools = (await loadOld("src/lib/memory/memory-tools.ts")) as MemoryToolsModule;
const memoryIndex = (await loadOld("src/lib/memory/index.ts")) as MemoryIndexModule;

/** The parts of a profile the memory functions change. */
function projectProfile(profile: OldProfile) {
  return {
    facts: profile.facts,
    preferences: profile.preferences,
    interactionSummary: profile.interactionSummary,
    updatedAt: profile.updatedAt ?? null,
  };
}

/** `toFacts`/`toPreferences` ids come from `nanoid()`; the caller injects them in Rust. */
function projectFact(fact: OldFact, now: string) {
  return {
    id: "<generated>",
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    confidence: fact.confidence,
    source: fact.source,
    createdAt: now,
    updatedAt: now,
  };
}

/** The same for a preference, whose fields are named differently. */
function projectPreference(preference: OldPreference, now: string) {
  return {
    id: "<generated>",
    category: preference.category,
    key: preference.key,
    value: preference.value,
    confidence: preference.confidence,
    source: preference.source,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The forget criteria as `executeForgetMemory` builds them
 * (`src/lib/memory/memory-tools.ts:186-190`). The old code has no function for it, so the
 * lines are copied here; `forgetMemoryResult` runs the real code path and checks them.
 */
function forgetCriteria(input: Record<string, unknown>): OldForgetCriteria {
  const keys = Array.isArray(input.keys) ? input.keys : [];
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];
  return {
    keys: keys.filter((k): k is string => typeof k === "string" && k.trim().length > 0),
    keywords: keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 1),
    all: input.all === true,
  };
}

function makeCtx(profileUserId: string | null) {
  return {
    threadId: "thread_oracle",
    workingMemoryUserId: "user_oracle",
    workingMemoryEnabled: false,
    profileUserId,
    semanticUserId: null,
    userMessage: "msg",
  };
}

function newState() {
  return { used: false, forgot: false };
}

/** The mode of the tool cases: what the store does with the write. */
type Mode = "ok" | "no_profile" | "fail";

async function runSaveMemory(input: unknown, profile: unknown, mode: Mode) {
  db.reset();
  db.state.fail = mode === "fail";
  if (mode !== "fail" && profile) db.seed("user_oracle", profile);
  return memoryTools.executeSaveMemory(
    makeCtx(mode === "no_profile" ? null : "user_oracle"),
    newState(),
    input ?? {},
  );
}

async function runForgetMemory(input: unknown, profile: unknown, mode: Mode) {
  db.reset();
  db.state.fail = mode === "fail";
  if (mode !== "fail" && profile) db.seed("user_oracle", profile);
  return memoryTools.executeForgetMemory(
    makeCtx(mode === "no_profile" ? null : "user_oracle"),
    newState(),
    input ?? {},
  );
}

const FNS: Record<string, (args: unknown[]) => unknown> = {
  normalizeMemoryKey: (a) => factKeys.normalizeMemoryKey(argString(a, 0)),
  isMultiValuePredicate: (a) => factKeys.isMultiValuePredicate(argString(a, 0)),
  memoryKeyMatches: (a) => factKeys.memoryKeyMatches(argString(a, 0), argString(a, 1)),
  memoryValueMatches: (a) => {
    const value = a[0];
    return factKeys.memoryValueMatches(
      typeof value === "string" ? value : null,
      argString(a, 1),
    );
  },
  collapseFacts: (a) => longTerm.collapseFacts(argArray(a, 0) as OldFact[]),
  collapsePreferences: (a) =>
    longTerm.collapsePreferences(argArray(a, 0) as OldPreference[]),
  mergeFacts: (a) =>
    longTerm.mergeFacts(
      argArray(a, 0) as OldFact[],
      argArray(a, 1) as OldFact[],
      new Date(argString(a, 2)),
    ),
  mergePreferences: (a) =>
    longTerm.mergePreferences(
      argArray(a, 0) as OldPreference[],
      argArray(a, 1) as OldPreference[],
      new Date(argString(a, 2)),
    ),
  applyMemoryUpdate: (a) => {
    const profile = argRecord(a, 0) as OldProfile;
    const changed = longTerm.applyMemoryUpdate(
      profile,
      argArray(a, 1) as OldFact[],
      argArray(a, 2) as OldPreference[],
      new Date(argString(a, 3)),
    );
    return { changed, ...projectProfile(profile) };
  },
  applyForget: (a) => {
    const profile = argRecord(a, 0) as OldProfile;
    const result = longTerm.applyForget(
      profile,
      argRecord(a, 1) as OldForgetCriteria,
      new Date(argString(a, 2)),
    );
    return { ...result, ...projectProfile(profile) };
  },
  profileContentFingerprint: (a) =>
    longTerm.profileContentFingerprint(argRecord(a, 0) as OldProfile),
  summaryNeedsRefresh: (a) => longTerm.summaryNeedsRefresh(argRecord(a, 0) as OldProfile),
  formatUserProfileForPrompt: (a) =>
    longTerm.formatUserProfileForPrompt(argRecord(a, 0) as OldProfile),
  buildPromptWithMemory: (a) => {
    const profile = a[1] === null || a[1] === undefined ? null : (a[1] as OldProfile);
    return memoryIndex.buildPromptWithMemory(argString(a, 0), null, [], profile);
  },
  toFacts: (a) =>
    memoryTools
      .toFacts(argArray(a, 0) as OldSaveFact[], argString(a, 1))
      .map((f) => projectFact(f, argString(a, 2))),
  toPreferences: (a) =>
    memoryTools
      .toPreferences(argArray(a, 0) as OldSavePreference[], argString(a, 1))
      .map((p) => projectPreference(p, argString(a, 2))),
  forgetCriteria: (a) => forgetCriteria(argRecord(a, 0)),
  saveMemoryResult: (a) => runSaveMemory(a[0], a[1], argString(a, 2) as Mode),
  forgetMemoryResult: (a) => runForgetMemory(a[0], a[1], argString(a, 2) as Mode),
  saveMemoryInputSchema: () => {
    const { tools } = memoryTools.createMemoryTools(makeCtx("user_oracle"));
    return tools.saveMemory.inputSchema.jsonSchema;
  },
  forgetMemoryInputSchema: () => {
    const { tools } = memoryTools.createMemoryTools(makeCtx("user_oracle"));
    return tools.forgetMemory.inputSchema.jsonSchema;
  },
};

async function run(line: string): Promise<unknown> {
  const { fn, args } = JSON.parse(line) as { fn: string; args: unknown[] };
  const handler = FNS[fn];
  if (!handler) throw new Error(`oracle: unknown function ${fn}`);
  return handler(args ?? []);
}

const args = process.argv.slice(2);
if (args[0] === "--cases") {
  const file = args[1];
  if (!file) throw new Error("usage: bun port/oracle/memory.ts --cases <file.in.jsonl>");
  const text = await Bun.file(file).text();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as { fn: string; args: unknown[] };
    const expected = await run(trimmed);
    out.push(JSON.stringify({ fn: parsed.fn, args: parsed.args, expected }));
  }
  console.log(out.join("\n"));
} else {
  const text = await Bun.stdin.text();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.stringify(await run(trimmed)));
  }
  console.log(out.join("\n"));
}
