import type { FlowState } from "./runtime-state"
import { resolveReference } from "./runtime-state"

// ─── Template Context ───────────────────────────────────

export interface TemplateContext {
  /** Input to the current node */
  input: unknown
  /** Full runtime state */
  flow: FlowState
  /** Current node info */
  node: { id: string; type: string }
}

// ─── Template Resolution ────────────────────────────────

const TEMPLATE_REGEX = /\{\{(.+?)\}\}/g

// Allowed globals in sandboxed expression evaluation
const SAFE_GLOBALS: Record<string, unknown> = {
  JSON,
  Math,
  Date,
  Array,
  Object,
  String,
  Number,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  undefined,
  null: null,
  true: true,
  false: false,
}

// Blocked identifiers — expressions containing these are rejected
const BLOCKED_IDENTIFIERS = [
  "process",
  "require",
  "import",
  "fetch",
  "global",
  "globalThis",
  "window",
  "eval",
  "Function",
  "__dirname",
  "__filename",
  "module",
  "exports",
]

/**
 * Resolve all `{{ ... }}` expressions in a template string.
 * Returns the resolved string.
 *
 * If the entire template is a single expression (e.g. "{{ input.name }}"),
 * returns the raw value (could be object/number/etc), not stringified.
 *
 * Examples:
 *   "Hello {{ input.name }}"           → "Hello John"
 *   "{{ $flow.state.count }}"           → 42 (raw number)
 *   "{{ nodeId.output.text }}"          → "some text"
 *   "Items: {{ input.items.length }}"   → "Items: 3"
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  if (typeof template !== "string") return String(template ?? "")

  // No expressions — return as-is (backward compatible with plain strings)
  if (!template.includes("{{")) return template

  return template.replace(TEMPLATE_REGEX, (_match, expr: string) => {
    const value = evaluateExpression(expr.trim(), ctx)
    if (value === undefined || value === null) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  })
}

/**
 * Resolve a template to a typed value.
 * If the template is a single expression, returns the raw value.
 * If it contains mixed text + expressions, returns a string.
 */
export function resolveTemplateValue(template: string, ctx: TemplateContext): unknown {
  if (typeof template !== "string") return template

  if (!template.includes("{{")) return template

  // Check if the entire string is a single expression
  const trimmed = template.trim()
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const inner = trimmed.slice(2, -2).trim()
    // Ensure there's no other {{ in between
    if (!inner.includes("{{")) {
      return evaluateExpression(inner, ctx)
    }
  }

  // Mixed content — resolve to string
  return resolveTemplate(template, ctx)
}

/**
 * Deep-resolve all string values in an object/array.
 * Non-string values pass through unchanged.
 */
export function resolveObjectTemplates<T>(obj: T, ctx: TemplateContext): T {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === "string") {
    return resolveTemplateValue(obj, ctx) as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveObjectTemplates(item, ctx)) as T
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveObjectTemplates(value, ctx)
    }
    return result as T
  }

  return obj
}

// ─── Expression Evaluation ──────────────────────────────

function evaluateExpression(expr: string, ctx: TemplateContext): unknown {
  // Security: reject blocked identifiers
  for (const blocked of BLOCKED_IDENTIFIERS) {
    // Match whole word only (not part of a property name)
    const regex = new RegExp(`(?<![.\\w])${blocked}(?![\\w])`)
    if (regex.test(expr)) {
      throw new TemplateError(
        `Blocked identifier "${blocked}" in template expression: {{ ${expr} }}`
      )
    }
  }

  // Fast path: simple reference like "input", "input.name", "$flow.state.key"
  const simpleRefResult = trySimpleReference(expr, ctx)
  if (simpleRefResult !== UNRESOLVED) return simpleRefResult

  // Complex expression — evaluate with sandboxed Function
  try {
    const scope = buildScope(ctx)
    const scopeKeys = Object.keys(scope)
    const scopeValues = scopeKeys.map((k) => scope[k])

    // eslint-disable-next-line no-new-func
    const fn = new Function(...scopeKeys, `"use strict"; return (${expr});`)
    return fn(...scopeValues)
  } catch (error) {
    if (error instanceof TemplateError) throw error
    throw new TemplateError(
      `Failed to evaluate template expression: {{ ${expr} }} — ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Sentinel for "could not resolve as simple reference"
const UNRESOLVED = Symbol("UNRESOLVED")

/**
 * Try to resolve a simple dot-notation reference without eval.
 * Returns UNRESOLVED if the expression is complex (operators, calls, etc).
 */
function trySimpleReference(expr: string, ctx: TemplateContext): unknown {
  // Simple ref: only contains word chars, dots, and brackets for array access
  if (!/^[\w.$\[\]]+$/.test(expr)) return UNRESOLVED

  // "input" or "input.x.y"
  if (expr === "input") return ctx.input
  if (expr.startsWith("input.")) {
    return getNestedFromInput(ctx.input, expr.slice(6).split("."))
  }

  // "$flow.state.x", "$variables.x", "$meta.x", "nodeId.output.x"
  return resolveReference(expr, ctx.flow)
}

function getNestedFromInput(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function buildScope(ctx: TemplateContext): Record<string, unknown> {
  // Build a flat scope with all resolvable references
  const scope: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    input: ctx.input,
    $flow: {
      state: ctx.flow.state,
      nodeOutputs: ctx.flow.nodeOutputs,
      variables: ctx.flow.variables,
      meta: ctx.flow.meta,
    },
    $variables: ctx.flow.variables,
    $meta: ctx.flow.meta,
    $node: ctx.node,
  }

  // Inject node outputs as top-level references so "nodeId.output.x" works
  // in complex expressions (e.g. "nodeId.output.count > 5")
  // Only inject if the nodeId is a valid JS identifier (no hyphens, etc.)
  for (const [nodeId, output] of Object.entries(ctx.flow.nodeOutputs)) {
    if (/^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(nodeId)) {
      scope[nodeId] = { output }
    }
  }

  return scope
}

// ─── Errors ─────────────────────────────────────────────

export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateError"
  }
}
