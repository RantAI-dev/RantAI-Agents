# Batch 8 — `application/sheet` Quality Upgrade Plan

## 1. Findings from the Renderer

File: [src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx)

**Accepted input formats — BOTH CSV and JSON:**
- The renderer first checks `content.trimStart().startsWith("[")`. If true, it `JSON.parse`s and expects an **array of objects** (`[{col: val, ...}, ...]`). Keys of `data[0]` become the headers.
- Otherwise it falls back to a built-in RFC-4180-ish CSV parser (`parseCSV`, lines 200–239) supporting:
  - Comma delimiter only.
  - Double-quote field wrapping; `""` escapes a literal quote inside a quoted field.
  - `\n` and `\r\n` line endings.
  - Quoted fields may contain commas and newlines.
  - Fields are `.trim()`-ed.
  - Rows where every field is empty are dropped.
- Header row is **required** — `lines.length < 2` produces a hard parse error: `"No data rows found"`.

**Data type handling — ALL VALUES BECOME STRINGS.**
- For JSON: `row[h] = String(item[h] ?? "")`. Numbers, booleans, dates → all coerced to strings before TanStack ever sees them.
- Sorting therefore is **lexicographic**, not numeric. (Important consequence for the prompt: tell the model to zero-pad / ISO-format if it wants sortability.)
- No date parsing, no number formatting, no auto-detection.

**TanStack Table features actually enabled:**
- `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`.
- Click header to toggle sort (`getToggleSortingHandler`).
- A single global filter input (`globalFilter`) — substring match across all columns.
- **No pagination, no column pinning, no resizing, no grouping.** All rows render at once → real performance ceiling.
- Row count badge in toolbar.
- CSV export button (`handleExportCSV`) — re-quotes fields containing `,`, `"`, or `\n`.
- Sticky header, hover row, no zebra striping.

**Empty / error state:** if `parseError` is set OR `lines.length < 2`, an amber warning panel renders the raw content in a `<pre>`.

**Current `sheet.ts` rules (gap):** 2 sentences. No mention of JSON support, no format rules, no anti-patterns, no examples array, no string-coercion warning, no sortability guidance. Effectively no instruction.

## 2. Top 3 Most Impactful Additions

1. **Document that BOTH CSV and JSON-array-of-objects are accepted, and specify the exact JSON shape** (`[{col: val}, ...]` with consistent keys). The current rules say "CSV" only — the LLM never knows JSON is an option, even though it's the safer format for data with commas.
2. **Tell the model values are coerced to strings and sorted lexicographically.** This unlocks two concrete rules: (a) use ISO `YYYY-MM-DD` dates so sort works, (b) zero-pad numeric IDs if numeric ordering matters, (c) keep currency as plain numbers (`1234.50`) not formatted strings (`$1,234.50`).
3. **Hard CSV format rules + anti-patterns** addressing the dominant LLM failure modes: mismatched column count, unquoted commas, currency symbols inside numeric columns, mixed date formats, placeholder data (`foo`, `bar`), >100 rows, >10 columns.

## 3. Implementation Steps

### 3.1 Rewrite [src/lib/prompts/artifacts/sheet.ts](src/lib/prompts/artifacts/sheet.ts)

Token budget ≤ 1,200 for `rules`. Sections:

1. **What this type is** — interactive table via TanStack React Table; features available to user (click-to-sort, global filter, CSV export, row count). Accepts CSV **or** JSON array of objects. Type boundary table (vs `text/markdown` table, vs `text/html`, vs `application/react`).
2. **Format rules — CSV** — header row required; comma delimiter; quote any field containing `,`, `"`, or newline; escape `"` as `""`; same column count on every row; no trailing comma; UTF-8, no BOM.
3. **Format rules — JSON** — top-level must be a non-empty array; every object has the same keys (schema consistency); first object's keys become headers, so order them deliberately; **note that values will be stringified** so embedded objects/arrays render as `[object Object]` — flatten before emitting.
4. **String-coercion + sortability** — explicit callout: the renderer turns every value into a string and sorts lexicographically. Therefore: ISO `YYYY-MM-DD` dates, plain unformatted numbers (`1234.5`, not `$1,234.50`), zero-pad IDs if you want numeric order (`007` not `7`), consistent boolean spelling (`true`/`false`).
5. **Column design** — Title Case headers; identifier → attributes → metrics → date/status order; ≤ 10 columns; descriptive names (`Unit Price` not `price`).
6. **Data quality** — realistic mock data (no `foo`/`bar`/`John Doe`/`example.com`), 10–30 rows typical, ≤ 100 hard cap (no pagination), varied values (sortable/filterable), 3–7 categorical buckets.
7. **Anti-patterns** (bullet list mirroring validation rules below).
8. **Examples** array (2 entries):
   - **CSV** — 15-row employee directory: `ID, Full Name, Department, Job Title, Salary, Start Date, Status`. Includes one row whose Job Title contains a comma (e.g. `"Engineer, Senior"`) to demonstrate quoting. ISO dates. Plain numeric salaries.
   - **JSON** — ~10-row monthly sales: `[{ "Month": "2026-01", "Revenue": 48230.50, "Orders": 312, "Top Category": "Wearables" }, ...]`. Demonstrates numbers-as-numbers, ISO month strings.

`summary`: `"Tabular data as CSV or a JSON array of objects — rendered as an interactive sortable, filterable table with CSV export."`

### 3.2 Extend [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts)

Add `if (type === "application/sheet") return validateSheet(content)` to the dispatch in `validateArtifactContent`. New `validateSheet` function — no new dependencies, reuses logic similar to the renderer's parser.

**Detection:** `content.trimStart().startsWith("[")` → JSON branch, else CSV branch.

**ERRORS (block + retry):**
1. Empty content (`!content.trim()`).
2. *(JSON)* `JSON.parse` throws → "Invalid JSON".
3. *(JSON)* parsed value is not an array.
4. *(JSON)* array is empty.
5. *(JSON)* first element is not a plain object, or has zero keys.
6. *(JSON)* objects have inconsistent key sets (use first object's keys as the schema; any later object missing a key OR adding an unknown key → error).
7. *(CSV)* fewer than 2 non-empty lines (no header or no data rows).
8. *(CSV)* mismatched column count — header has N columns, at least one data row has a different count. Use a small inline RFC-4180-aware tokenizer (handle quoted fields containing commas) so we don't false-positive on legitimate quoted commas.

**WARNINGS:**
9. More than 100 data rows (performance — no pagination).
10. More than 10 columns (readability).
11. All values in a column are identical (column adds no sort/filter value).
12. *(JSON)* a value is a nested object or array → will render as `[object Object]`.
13. *(CSV)* a numeric-looking column contains currency symbols (`$`, `€`, `£`) or thousand separators in numbers (regex `^[\$€£]\s*\d` or `^\d{1,3}(,\d{3})+`).
14. *(CSV)* mixed date formats in a single column (heuristic: column matches an ISO date in some rows AND a non-ISO date like `Jan 15, 2024` or `01/15/2024` in others).

The validator must keep parsing cheap — single pass, no regex catastrophes. Inline CSV tokenizer modeled on the renderer's `parseCSV` (so we agree with what the renderer will see).

### 3.3 Tests

Add a new test file (location: `tests/unit/validate-artifact-sheet.test.ts` or co-located, matching existing convention — verify in step 1 of implementation):

| Case | Expected |
|---|---|
| Valid CSV: header + 10 rows × 5 cols | `ok: true` |
| Valid JSON array of objects, consistent keys | `ok: true` |
| Empty string | error (empty) |
| Whitespace only | error (empty) |
| CSV: 5-col header, one row has 4 cols | error (column count) |
| CSV: header only, no data | error (no data rows) |
| CSV: row contains a quoted field with a comma — column count still matches | `ok: true` (no false positive) |
| Invalid JSON `{not: valid}` | error (parse) |
| JSON top-level object `{"a":1}` | error (not an array) |
| Empty JSON array `[]` | error |
| JSON: objects with different key sets | error (schema mismatch) |
| JSON: value is a nested object | warning (will stringify) |
| CSV: 150 rows | warning (performance) |
| CSV: 15 columns | warning (readability) |
| CSV: column where every row has the same value | warning (no sort value) |
| CSV: numeric column with `$1,234.50` values | warning (currency in data) |
| CSV: date column mixing `2026-01-15` and `Jan 15, 2026` | warning (mixed formats) |

### 3.4 Manual Smoke Test

Run the 5 test prompts from the spec against Canvas Mode = Sheet, especially **prompt #5** (fields containing commas) — that's the primary regression target for CSV quoting.

## 4. Files Touched

| File | Change |
|---|---|
| [src/lib/prompts/artifacts/sheet.ts](src/lib/prompts/artifacts/sheet.ts) | Full rewrite of `rules`, `summary`, `examples` |
| [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) | Add `validateSheet` + dispatch line |
| `tests/unit/validate-artifact-sheet.test.ts` (new, location TBD in impl step 1) | New test cases above |
| `docs/artifact-plans/batch8-sheet-quality-upgrade.md` | This plan |

## 5. Open Questions / Risks

- **Date-format mixing detection** is heuristic; risk of false positives on columns that legitimately mix (e.g. timestamps + nulls). Mitigation: only fire the warning when ≥ 2 rows match each format and the column header looks date-ish (`/date|day|month|time/i`).
- **Schema-mismatch error for JSON** could be too strict if the LLM legitimately produces sparse rows. Decision: keep it as an error — sparse rows render as empty cells which is fine, but key-set drift means the *table shape* changes mid-stream, which IS a bug. If it bites in practice, downgrade to warning.
- **Token budget**: a tight 1,200. The format-rules section duplicates some content between CSV and JSON branches; if over budget, collapse the "string-coercion" callout into a single paragraph rather than its own section.

## 6. Effort Estimate

| # | Task | Effort |
|---|---|---|
| 1 | Confirm test file location + existing patterns | 15m |
| 2 | Rewrite `sheet.ts` (rules + summary + examples) | 1.5h |
| 3 | Implement `validateSheet` in `_validate-artifact.ts` | 1h |
| 4 | Tests (12+ cases) | 45m |
| 5 | Manual test prompts in Canvas Mode | 30m |
| **Total** | | **~4h** |

## 7. Report Answers (per spec §Output)

1. **Top 3 impactful additions** — see §2.
2. **Total effort** — ~4h.
3. **Format the renderer accepts** — **BOTH**. JSON array of objects is tried first (when content starts with `[`), CSV otherwise. This is the #1 finding and the current rules don't mention JSON at all.
4. **TanStack features enabled** — sorting (single click toggle, no multi-sort UI), global substring filter, that's it. **No pagination**, no column pinning, no resizing, no grouping. The "no pagination" fact is what makes the 100-row cap a real performance constraint, not a stylistic one.
5. **Data type handling** — none. Every value is `String(...)`-coerced before reaching TanStack, so sorting is **lexicographic on strings**. The instruction must tell the model to format dates as ISO `YYYY-MM-DD`, keep numbers unformatted, and zero-pad IDs if numeric ordering matters.
