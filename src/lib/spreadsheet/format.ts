import { format as numfmtFormat } from "numfmt"

/**
 * Render a numeric cell value through an Excel format string.
 *
 * Why a wrapper instead of using `numfmt` directly:
 *  - Empty / null / undefined → "" (numfmt returns "0" for null, ugly)
 *  - Non-numeric value with numeric format → return as string (avoid throw)
 *  - Missing format → coerce to "General"-style stringification
 */
export function formatNumber(
  value: number | string | boolean | null | undefined,
  format: string | undefined,
): string {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value !== "number") {
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
    return String(value)
  }
  // D-62 note: the early-return covers the missing-format case; the catch
  // is NOT dead — `numfmt` throws on malformed format strings (e.g. an
  // unsupported token from the LLM). Both paths fall back to plain
  // String(value), but they catch different failure modes.
  if (!format) return String(value)
  try {
    return numfmtFormat(format, value) as string
  } catch {
    return String(value)
  }
}
