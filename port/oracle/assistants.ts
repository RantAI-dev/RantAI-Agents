#!/usr/bin/env bun
/**
 * Oracle for the assistants and system-prompt port (TypeScript -> Rust).
 *
 * The old TypeScript is the specification. This script runs the OLD implementation on one
 * JSON input per line and prints one JSON result per line:
 *
 *   bun port/oracle/assistants.ts < input.jsonl
 *   bun port/oracle/assistants.ts --cases port/cases/assistants.in.jsonl > port/cases/assistants.jsonl
 *
 * Input:  {"fn": "validateCreate", "args": [{ "name": "A", "systemPrompt": "..." }]}
 * Output (--cases mode): {"fn": ..., "args": ..., "expected": ...}
 *
 * Server-only imports (Prisma, the LLM provider, the AI SDK and the artifact prompt tables)
 * are stubbed with Bun.build plugins, the way `port/oracle/memory.ts` does it. The access
 * policy runs the real service functions against a stubbed repository; the per-call row and
 * hidden tool ids come from `globalThis.__ORACLE_ASSISTANTS__`.
 *
 * Two projections, both mechanical:
 * - A zod `unrecognized_keys` issue (path [], a list of key names) is projected to one JSON
 *   Pointer per key, because the Rust port reports unknown keys that way.
 * - The access functions return the service result projected to its HTTP status.
 *
 * Run it with TZ=UTC and the clock pinned: `resolvePromptVariables` resolves {{date}},
 * {{time}} and {{datetime}} from `new Date()`.
 */

import { plugin } from "bun";
import path from "node:path";

process.env.TZ = "UTC";
// Pin the clock: `resolvePromptVariables` reads `new Date()` for {{date}}, {{time}} and
// {{datetime}}. (Bun 1.4 has no Bun.setSystemTime, so `Date` itself is replaced; the old
// code looks the name up at call time, so it sees the replacement.)
const FIXED_NOW = new Date("2026-11-14T08:30:00.000Z");
class FixedDate extends Date {
  constructor(...parts: unknown[]) {
    if (parts.length === 0) super(FIXED_NOW.getTime());
    else super(...(parts as []));
  }
  static override now(): number {
    return FIXED_NOW.getTime();
  }
}
globalThis.Date = FixedDate as unknown as DateConstructor;

const ROOT = path.resolve(import.meta.dir, "../..");
const CACHE = path.join(ROOT, "node_modules/.cache/rantai-port");

/** The row the stubbed repository hands to the service under test, set per case. */
const oracle = {
  assistantRow: null as unknown,
  hiddenToolIds: [] as unknown[],
  replacedToolIds: null as unknown,
  replacedSkillIds: null as unknown,
};
(globalThis as unknown as { __ORACLE_ASSISTANTS__: unknown }).__ORACLE_ASSISTANTS__ = oracle;

/**
 * One stub for every `./repository` of the assistants feature (the union of the three
 * real repositories). The services under test read the row and capture what they write.
 */
const REPO_STUB = `
export async function findAssistantById() {
  return globalThis.__ORACLE_ASSISTANTS__.assistantRow;
}
export async function findAssistantAccessById() {
  return globalThis.__ORACLE_ASSISTANTS__.assistantRow;
}
export async function createAssistant(data) {
  return { id: "assistant_new", ...data };
}
export async function updateAssistantById(id, data) {
  return { id, ...data };
}
export async function deleteAssistantById() {
  return {};
}
export async function listAssistantsByScope() {
  return [];
}
export async function findHiddenAssistantToolIds() {
  return globalThis.__ORACLE_ASSISTANTS__.hiddenToolIds;
}
export async function findAssistantToolBindings() {
  return [];
}
export async function findAssistantSkillBindings() {
  return [];
}
export async function findAssistantMcpServerBindings() {
  return [];
}
export async function findAssistantWorkflowBindings() {
  return [];
}
export async function replaceAssistantToolBindings(_id, ids) {
  globalThis.__ORACLE_ASSISTANTS__.replacedToolIds = ids;
}
export async function replaceAssistantSkillBindings(_id, ids) {
  globalThis.__ORACLE_ASSISTANTS__.replacedSkillIds = ids;
}
export async function replaceAssistantMcpServerBindings() {}
export async function replaceAssistantWorkflowBindings() {}
export async function clearSystemDefaultAssistants() {}
export async function setAssistantSystemDefault(id) {
  return { id };
}
export async function unsetAssistantSystemDefault(id) {
  return { id };
}`;

/**
 * The artifact prompt tables stand in for the real ones: the instructions module only
 * branches on the type labels and embeds what `assembleArtifactContext` returns. The real
 * tables are not part of this slice; the Rust side takes them from its caller (see
 * `docs/port/differences.md`).
 */
const ARTIFACTS_STUB = `
export const CANVAS_TYPE_LABELS = {
  "text/html": "HTML page",
  "application/react": "React component",
  "application/mermaid": "Mermaid diagram",
};`;

const CONTEXT_STUB = `
export function assembleArtifactContext(type, mode) {
  if (mode === "summary") return "[artifact-summary]";
  if (!type) return "";
  return "[artifact-full:" + type + "]";
}`;

const STUBS: Record<string, string> = {
  "@prisma/client":
    'export const Prisma = { DbNull: { __prismaDbNull: true } };\nexport default {};',
  "server-only": "export default {};",
  "@/lib/prisma": "export const prisma = {};",
  ai: `
export const tool = (definition) => definition;
export const streamText = () => ({});
export const convertToModelMessages = async () => [];
export const stepCountIs = () => () => false;`,
  "@/lib/llm/provider": `
export const getChatProvider = () => () => ({});
export const resolveModelId = (id) => id;`,
  "@/lib/llm/provider-registry": `
export const getPlatformDefaultModel = (id) => id;`,
  "@/lib/models": `
export const DEFAULT_MODEL_ID = "model-default";
export const isValidModel = () => true;
export const isValidModelAsync = async () => true;
export const AVAILABLE_MODELS = [];`,
  "@/lib/llm/house-models": "export const HOUSE_MODELS = [];",
};

/** Relative stubs apply only to the module in the named directory. */
const RELATIVE_STUBS: Record<string, Record<string, string>> = {
  "assistants/core": { "./repository": REPO_STUB },
  "assistants/bindings": { "./repository": REPO_STUB },
  "assistants/default": { "./repository": REPO_STUB },
  "lib/prompts": { "./artifacts": ARTIFACTS_STUB, "./artifacts/context": CONTEXT_STUB },
};

function stubFor(importer: string, specifier: string): string | undefined {
  const direct = STUBS[specifier];
  if (direct) return direct;
  if (!specifier.startsWith("./")) return undefined;
  const dir = Object.keys(RELATIVE_STUBS).find((d) => importer.includes(d));
  return dir ? RELATIVE_STUBS[dir]?.[specifier] : undefined;
}

/** Bundle one old module with the heavy imports stubbed, then import it. */
async function loadOld(entry: string): Promise<unknown> {
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
            contents: STUBS[args.path] ?? RELATIVE_STUBS_STUB(args.path),
            loader: "ts",
          }));
        },
      },
    ],
  });
  if (!result.success) {
    console.error(result.logs);
    throw new Error(`oracle: cannot bundle ${entry}`);
  }
  const out = path.join(CACHE, entry.replace(/[/.]/g, "-") + ".ts");
  await Bun.write(out, await result.outputs[0]!.text());
  return (await import(out)) as unknown;
}

/** The stub body for a relative specifier recorded by `stubFor`. */
function RELATIVE_STUBS_STUB(specifier: string): string {
  for (const table of Object.values(RELATIVE_STUBS)) {
    const stub = table[specifier];
    if (stub) return stub;
  }
  return "export {};";
}

/* The old modules, with the shapes this oracle uses. */

interface ZodIssue {
  code: string;
  path: unknown[];
  keys?: unknown[];
}
interface ZodResult {
  success: boolean;
  data?: unknown;
  error?: { issues: ZodIssue[] };
}
interface SchemaModule {
  CreateAssistantSchema: { safeParse(body: unknown): ZodResult };
  UpdateAssistantSchema: { safeParse(body: unknown): ZodResult };
}
interface CompletenessModule {
  isNameValid(name: string): boolean;
  isSystemPromptValid(prompt: string): boolean;
  isModelValid(model: string, availableIds: string[]): boolean;
  computeTabStatus(form: unknown, tab: string): string;
  isDeployReady(form: unknown): { ok: boolean; missing: string[] };
}
interface CoreServiceModule {
  getAssistantForUser(params: unknown): Promise<unknown>;
  updateAssistantForUser(params: unknown): Promise<unknown>;
  deleteAssistantForUser(params: unknown): Promise<unknown>;
}
interface BindingsServiceModule {
  setAssistantTools(id: string, toolIds: unknown[], context: unknown): Promise<unknown>;
  setAssistantSkills(id: string, skillIds: unknown[], context: unknown): Promise<unknown>;
}
interface DefaultServiceModule {
  loadAssistantForDefaultMutation(params: unknown): Promise<unknown>;
}
interface OrganizationModule {
  canEdit(role: string): boolean;
  canManage(role: string): boolean;
}
interface WizardToolsModule {
  filterKnownIds(
    ids: string[],
    known: Set<string>,
  ): { kept: string[]; dropped: string[] };
}
interface WizardServiceModule {
  buildWizardSystemPrompt(ctx: unknown): string;
  sanitizeProposal(
    payload: unknown,
    known: Record<string, Set<string>>,
  ): { payload: unknown; dropped: unknown };
}
interface GuardRailsModule {
  buildGuardRailsPrompt(config: unknown): string;
}
interface VariablesModule {
  AVAILABLE_VARIABLES: string[];
  VARIABLE_DESCRIPTIONS: Record<string, string>;
  resolvePromptVariables(prompt: string, context: unknown): string;
}
interface ResponseFormatModule {
  getResponseFormatInstruction(format?: string): string;
}
interface InstructionsModule {
  LIVE_CHAT_HANDOFF_INSTRUCTION: string;
  buildToolInstruction(toolNames: string[], options?: unknown): string;
}
interface ApprovalModule {
  AUTO_APPROVED_TOOLS: ReadonlySet<string>;
  resolveToolApprovalMode(guardRails: unknown): string;
  toolNeedsApproval(name: string, mode: string): boolean;
}

const coreSchema = (await loadOld("src/features/assistants/core/schema.ts")) as SchemaModule;
const completeness = (await loadOld(
  "src/features/assistants/core/completeness.ts",
)) as CompletenessModule;
const coreService = (await loadOld("src/features/assistants/core/service.ts")) as CoreServiceModule;
const bindingsService = (await loadOld(
  "src/features/assistants/bindings/service.ts",
)) as BindingsServiceModule;
const defaultService = (await loadOld(
  "src/features/assistants/default/service.ts",
)) as DefaultServiceModule;
const organization = (await loadOld("src/lib/organization.ts")) as OrganizationModule;
const wizardTools = (await loadOld("src/features/assistants/wizard/tools.ts")) as WizardToolsModule;
const wizardService = (await loadOld(
  "src/features/assistants/wizard/service.ts",
)) as WizardServiceModule;
const guardRailsPrompt = (await loadOld("src/lib/prompts/guard-rails.ts")) as GuardRailsModule;
const promptVariables = (await loadOld("src/lib/prompts/variables.ts")) as VariablesModule;
const responseFormat = (await loadOld(
  "src/lib/prompts/response-format.ts",
)) as ResponseFormatModule;
const instructions = (await loadOld("src/lib/prompts/instructions.ts")) as InstructionsModule;
const approval = (await loadOld("src/lib/tools/approval.ts")) as ApprovalModule;

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

/** A service result projected to its HTTP status: a ServiceError keeps it, success is 200. */
function statusOf(result: unknown): number {
  const candidate = result as { status?: unknown } | null;
  return candidate && typeof candidate.status === "number" ? candidate.status : 200;
}

/** A zod issue list projected to JSON Pointers, one per unknown key, as the port reports them. */
function projectIssues(result: ZodResult): string[] {
  const errors: string[] = [];
  for (const issue of result.error?.issues ?? []) {
    if (issue.code === "unrecognized_keys" && Array.isArray(issue.keys)) {
      for (const key of issue.keys) errors.push(`/${String(key)}`);
    } else {
      errors.push(issue.path.map((segment) => `/${String(segment)}`).join(""));
    }
  }
  return errors;
}

function validation(result: ZodResult): { ok: boolean; errors: string[] } {
  return result.success
    ? { ok: true, errors: [] }
    : { ok: false, errors: projectIssues(result) };
}

function knownSets(args: unknown[], index: number): Record<string, Set<string>> {
  const record = argRecord(args, index);
  const sets: Record<string, Set<string>> = {};
  for (const [key, value] of Object.entries(record)) {
    sets[key] = new Set(Array.isArray(value) ? value.map(String) : []);
  }
  return sets;
}

const ASSISTANT_ID = "assistant_oracle";

/** Point the stubbed repository at one assistant row for the next access call. */
function loadRow(args: unknown[], index: number): void {
  const row = argRecord(args, index);
  oracle.assistantRow = { id: ASSISTANT_ID, ...row };
  oracle.hiddenToolIds = [];
  oracle.replacedToolIds = null;
  oracle.replacedSkillIds = null;
}

function contextOf(args: unknown[], index: number): unknown {
  return argRecord(args, index);
}

const FNS: Record<string, (args: unknown[]) => Promise<unknown> | unknown> = {
  validateCreate: (a) => validation(coreSchema.CreateAssistantSchema.safeParse(a[0] ?? null)),
  validateUpdate: (a) => validation(coreSchema.UpdateAssistantSchema.safeParse(a[0] ?? null)),

  isNameValid: (a) => completeness.isNameValid(argString(a, 0)),
  isSystemPromptValid: (a) => completeness.isSystemPromptValid(argString(a, 0)),
  isModelValid: (a) =>
    completeness.isModelValid(argString(a, 0), argArray(a, 1).map(String)),
  computeTabStatus: (a) => completeness.computeTabStatus(argRecord(a, 0), argString(a, 1)),
  isDeployReady: (a) => completeness.isDeployReady(argRecord(a, 0)),

  viewAssistant: async (a) => {
    loadRow(a, 1);
    const result = await coreService.getAssistantForUser({
      id: ASSISTANT_ID,
      context: contextOf(a, 0),
    });
    return { status: statusOf(result) };
  },
  editAssistant: async (a) => {
    loadRow(a, 1);
    const result = await coreService.updateAssistantForUser({
      id: ASSISTANT_ID,
      userId: "user_oracle",
      input: {},
      context: contextOf(a, 0),
    });
    return { status: statusOf(result) };
  },
  deleteAssistant: async (a) => {
    loadRow(a, 1);
    const result = await coreService.deleteAssistantForUser({
      id: ASSISTANT_ID,
      context: contextOf(a, 0),
    });
    return { status: statusOf(result) };
  },
  setAssistantToolBindings: async (a) => {
    loadRow(a, 1);
    oracle.hiddenToolIds = argArray(a, 3);
    const result = await bindingsService.setAssistantTools(
      ASSISTANT_ID,
      argArray(a, 2),
      contextOf(a, 0),
    );
    return {
      status: statusOf(result),
      merged: Array.isArray(oracle.replacedToolIds) ? oracle.replacedToolIds : null,
    };
  },
  setAssistantSkillBindings: async (a) => {
    loadRow(a, 1);
    const result = await bindingsService.setAssistantSkills(
      ASSISTANT_ID,
      argArray(a, 2),
      contextOf(a, 0),
    );
    return {
      status: statusOf(result),
      replaced: Array.isArray(oracle.replacedSkillIds) ? oracle.replacedSkillIds : null,
    };
  },
  setDefaultAssistant: async (a) => {
    loadRow(a, 1);
    const guard = await defaultService.loadAssistantForDefaultMutation({
      assistantId: ASSISTANT_ID,
      organizationId: argString(a, 2),
    });
    const visible = !(guard !== null && typeof guard === "object" && "status" in guard);
    return { allowed: visible && organization.canManage(argString(a, 0)) };
  },

  filterKnownIds: (a) =>
    wizardTools.filterKnownIds(argArray(a, 0).map(String), new Set(argArray(a, 1).map(String))),
  buildWizardSystemPrompt: (a) => wizardService.buildWizardSystemPrompt(argRecord(a, 0)),
  sanitizeProposal: (a) => wizardService.sanitizeProposal(argRecord(a, 0), knownSets(a, 1)),

  buildGuardRailsPrompt: (a) => guardRailsPrompt.buildGuardRailsPrompt(a[0] ?? null),
  resolvePromptVariables: (a) =>
    promptVariables.resolvePromptVariables(argString(a, 0), argRecord(a, 1)),
  availableVariables: () => promptVariables.AVAILABLE_VARIABLES,
  variableDescriptions: () => promptVariables.VARIABLE_DESCRIPTIONS,
  getResponseFormatInstruction: (a) => {
    const value = a[0];
    return responseFormat.getResponseFormatInstruction(
      typeof value === "string" ? value : undefined,
    );
  },
  buildToolInstruction: (a) =>
    instructions.buildToolInstruction(argArray(a, 0).map(String), a[1] ?? undefined),
  liveChatHandoffInstruction: () => instructions.LIVE_CHAT_HANDOFF_INSTRUCTION,

  resolveToolApprovalMode: (a) => approval.resolveToolApprovalMode(a[0] ?? null),
  toolNeedsApproval: (a) => approval.toolNeedsApproval(argString(a, 0), argString(a, 1)),
  autoApprovedTools: () => Array.from(approval.AUTO_APPROVED_TOOLS),
};

async function run(line: string): Promise<unknown> {
  const { fn, args } = JSON.parse(line) as { fn: string; args: unknown[] };
  const handler = FNS[fn];
  if (!handler) throw new Error(`oracle: unknown function ${fn}`);
  return await handler(args ?? []);
}

const args = process.argv.slice(2);
if (args[0] === "--cases") {
  const file = args[1];
  if (!file) throw new Error("usage: bun port/oracle/assistants.ts --cases <file.in.jsonl>");
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
