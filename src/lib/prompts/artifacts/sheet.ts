export const sheetArtifact = {
  type: "application/sheet" as const,
  label: "Spreadsheet",
  summary:
    "Tabular data as CSV or a JSON array of objects — rendered as an interactive sortable, filterable table with CSV export.",
  rules: `**application/sheet — Tabular Data**

You are generating tabular data that will render in an interactive data table (TanStack React Table). The user can click any column header to sort, type into a global filter box to substring-search across all columns, and click a Download button to export the data as a CSV file. **There is no pagination** — every row renders at once, so size matters.

## Accepted Input Formats — TWO Options

The renderer accepts EITHER of these. Pick ONE per artifact and stick with it.

### Option A — CSV (default for most data)
- First row MUST be the header row.
- Comma (\`,\`) delimiter only. No tabs, no semicolons.
- Quote any field that contains a comma, a double quote, or a newline by wrapping it in double quotes: \`"Engineer, Senior"\`.
- Escape a literal double quote inside a quoted field by doubling it: \`"She said ""hi"""\`.
- **Every row MUST have the same number of columns as the header.** Mismatched column counts are the #1 cause of broken sheets.
- No trailing comma at end of row. No BOM. UTF-8.
- Use \`\\n\` line endings (or \`\\r\\n\`).

### Option B — JSON array of objects
- Top level MUST be a non-empty array: \`[{"col1": "val1", "col2": 42}, ...]\`
- Every object MUST have **the same keys in the same order** — the first object's keys become the column headers, in order.
- Do NOT nest objects or arrays inside values. Nested values stringify as \`[object Object]\` in the table — flatten first.
- JSON is the safer choice when your data contains commas, quotes, or newlines, because there's no quoting to get wrong.

## CRITICAL: All Values Become Strings

The renderer coerces every cell value to a string before TanStack sees it. This has two consequences you MUST design around:

1. **Sorting is lexicographic**, not numeric and not date-aware. \`"10"\` sorts before \`"2"\`. \`"Jan 15, 2026"\` sorts before \`"Mar 1, 2025"\`.
2. **Numbers and dates have no auto-formatting.** What you write is what shows up.

So:
- **Dates → ISO 8601** (\`YYYY-MM-DD\`, e.g. \`2026-04-09\`). ISO sorts correctly as a string. Never mix \`2026-01-15\` with \`Jan 15, 2026\` in the same column.
- **Numbers → plain numerals.** Write \`1234.50\`, NOT \`$1,234.50\`. No currency symbols, no thousand separators. The column header (\`Salary (USD)\`) communicates units.
- **IDs → zero-pad** if numeric ordering matters: \`"007"\`, \`"008"\`, \`"010"\` — not \`7\`, \`8\`, \`10\`.
- **Booleans → consistent spelling**: pick \`true\`/\`false\` OR \`Yes\`/\`No\` and use it everywhere in the column.
- **Empty cells → empty string** (\`""\`) or \`null\` in JSON. Don't write \`N/A\`, \`-\`, \`TBD\` unless that's literal data.

## Type Boundary — When to Use Sheet vs Other Types

| User wants… | Correct type | Why |
|---|---|---|
| 50+ rows of data | \`application/sheet\` | Too big for markdown table |
| Sortable / filterable / exportable table | \`application/sheet\` | Only sheet has these |
| Small comparison table inside a doc | \`text/markdown\` table | Inline reading |
| Visually styled pricing/feature card | \`text/html\` | Needs design, not data grid |
| Dashboard combining table + charts | \`application/react\` | Needs interactivity beyond a table |
| CSV the user will download | \`application/sheet\` | Has Download button |

## Column Design

- **Headers in Title Case**, descriptive: \`Full Name\` not \`name\`, \`Unit Price\` not \`price\`, \`Start Date\` not \`startDate\`.
- **Column order**: identifier first → descriptive attributes → numeric metrics → dates → status. Example: \`ID, Full Name, Department, Salary, Start Date, Status\`.
- **≤ 10 columns.** Wider tables become unreadable. If you need more, drop the least important.
- For JSON, the **insertion order of keys** in the first object IS the column order — author it deliberately.

## Data Quality

- **Realistic mock data, never placeholder.** No \`foo\`, \`bar\`, \`test\`, \`John Doe\`, \`Company A\`, \`example@example.com\`. Use names, companies, addresses, amounts that feel real.
- **Row count**: 10–30 for typical demos, up to ~50 for datasets. **Hard cap ~100 rows** — there is no pagination, all rows render at once.
- **Vary the values.** A column where every row is the same string is useless (nothing to sort, nothing to filter). Aim for 3–7 distinct categories in categorical columns.
- **Consistent precision** within numeric columns: pick 0 or 2 decimals and stay there.
- **NEVER truncate.** No \`... 90 more rows ...\`, no \`// truncated for brevity\`. Output every row.

## Anti-Patterns

- ❌ Mismatched column count (rows with more or fewer fields than the header)
- ❌ Unquoted CSV field containing a comma, quote, or newline
- ❌ Currency symbols or thousand separators inside numeric columns (\`$1,234\`)
- ❌ Mixed date formats in one column
- ❌ Missing header row
- ❌ Trailing comma or empty trailing column
- ❌ JSON top-level that is an object instead of an array
- ❌ JSON objects with inconsistent key sets
- ❌ Nested objects/arrays as JSON values
- ❌ Placeholder data (\`foo\`, \`bar\`, \`John Doe\`, \`example.com\`)
- ❌ More than 100 rows (no pagination, performance)
- ❌ More than 10 columns (unreadable)
- ❌ All-identical column (useless for sort/filter)
- ❌ Truncation markers (\`...more rows...\`)
- ❌ Wrapping output in markdown fences (\`\`\`csv … \`\`\`)`,
  examples: [
    {
      label: "CSV — employee directory (15 rows, demonstrates quoted comma in Job Title)",
      code: `ID,Full Name,Department,Job Title,Salary,Start Date,Status
001,Amelia Hartwell,Engineering,Staff Software Engineer,182000,2019-03-12,Active
002,Rohan Subramanian,Engineering,"Engineer, Senior",148000,2020-08-01,Active
003,Maya Chen,Design,Principal Product Designer,165000,2018-11-05,Active
004,Tomasz Kowalski,Platform,Site Reliability Engineer,156000,2021-02-22,Active
005,Priya Venkatesan,Data,Analytics Engineer,138000,2022-06-13,Active
006,Hugo Marchetti,Engineering,Backend Engineer,132000,2023-01-09,Active
007,Sade Adeyemi,Marketing,Growth Lead,128000,2021-09-27,Active
008,Linnea Bergstrom,Finance,Senior Accountant,118000,2020-04-15,Active
009,Daniel Okafor,Engineering,"Engineer, Mobile",142000,2022-10-03,On Leave
010,Yuki Tanaka,Design,UX Researcher,124000,2023-05-29,Active
011,Beatrice Caldwell,People,Talent Partner,112000,2019-07-18,Active
012,Mateo Restrepo,Sales,Account Executive,135000,2021-12-06,Active
013,Hannah Lindqvist,Legal,Commercial Counsel,178000,2018-02-19,Active
014,Reza Farahani,Data,Senior Data Scientist,168000,2020-10-11,Active
015,Camille Dubois,Operations,"Operations Lead, EMEA",146000,2022-03-30,Active`,
    },
    {
      label: "JSON — monthly sales (10 rows, numbers stay numeric, ISO month strings)",
      code: `[
  { "Month": "2025-07", "Revenue": 482300.50, "Orders": 3120, "Avg Order Value": 154.58, "Refund Rate": 0.018, "Top Category": "Wearables" },
  { "Month": "2025-08", "Revenue": 511480.75, "Orders": 3284, "Avg Order Value": 155.75, "Refund Rate": 0.021, "Top Category": "Wearables" },
  { "Month": "2025-09", "Revenue": 498220.10, "Orders": 3198, "Avg Order Value": 155.79, "Refund Rate": 0.019, "Top Category": "Audio" },
  { "Month": "2025-10", "Revenue": 562940.00, "Orders": 3471, "Avg Order Value": 162.18, "Refund Rate": 0.017, "Top Category": "Audio" },
  { "Month": "2025-11", "Revenue": 689130.25, "Orders": 4012, "Avg Order Value": 171.77, "Refund Rate": 0.024, "Top Category": "Smart Home" },
  { "Month": "2025-12", "Revenue": 812450.90, "Orders": 4587, "Avg Order Value": 177.12, "Refund Rate": 0.026, "Top Category": "Smart Home" },
  { "Month": "2026-01", "Revenue": 524870.40, "Orders": 3265, "Avg Order Value": 160.76, "Refund Rate": 0.022, "Top Category": "Wearables" },
  { "Month": "2026-02", "Revenue": 548190.65, "Orders": 3342, "Avg Order Value": 164.03, "Refund Rate": 0.020, "Top Category": "Wearables" },
  { "Month": "2026-03", "Revenue": 601330.20, "Orders": 3589, "Avg Order Value": 167.55, "Refund Rate": 0.019, "Top Category": "Audio" },
  { "Month": "2026-04", "Revenue": 578410.85, "Orders": 3478, "Avg Order Value": 166.30, "Refund Rate": 0.018, "Top Category": "Audio" }
]`,
    },
  ],
}
