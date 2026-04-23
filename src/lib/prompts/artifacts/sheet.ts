export const sheetArtifact = {
  type: "application/sheet" as const,
  label: "Spreadsheet",
  summary:
    "Tabular data for interactive preview and Excel download. Accepts CSV or a JSON array for flat tables; accepts a JSON spec (kind: \"spreadsheet/v1\") for workbooks with formulas, number formats, merged cells, named ranges, and multi-sheet layouts.",
  rules: `**application/sheet — Tabular Data and Workbooks**

You are generating content for an interactive spreadsheet artifact. Three content shapes are supported — **pick the simplest one that fits the task**.

## Shape Decision Table

| User's intent | Shape to emit | Download |
|---|---|---|
| A simple list / directory / static dataset | **CSV** (Shape A) | .csv |
| Same thing, but commas in values make CSV quoting annoying | **JSON array** (Shape B) | .csv |
| A financial model, budget, cap table, scenario compare, or anything with **formulas**, **number formatting** (\`$1,234.50\`, \`15.0%\`), **multi-sheet** structure, **merged cells**, or **cell notes** | **JSON spec** (Shape C) | .xlsx |

If any formula, percentage format, currency format, date format, multi-sheet layout, merged header, named range, or cell comment is called for, use Shape C. CSV and JSON-array shapes CANNOT express these.

---

## Shape A — CSV

First row is the header. Comma delimiter only. Quote any field containing a comma, quote, or newline with double-quotes. Escape internal quotes by doubling them. Every row must have the same column count. No trailing comma. UTF-8. Line endings \`\\n\` or \`\\r\\n\`.

## Shape B — JSON array of objects

Top level is a non-empty array. Every object has the same keys in the same order. First object's keys become the column headers, in order. Do NOT nest objects or arrays inside values.

## Shape C — JSON spec (kind: "spreadsheet/v1")

A full workbook specification. The renderer evaluates formulas live and exports a real .xlsx file.

### Schema (all fields not marked "optional" are required)

\`\`\`json
{
  "kind": "spreadsheet/v1",
  "theme": {
    "font": "Arial",
    "inputColor": "#0000FF",
    "formulaColor": "#000000",
    "crossSheetColor": "#008000",
    "highlightFill": "#FFFF00"
  },
  "namedRanges": {
    "GrowthRate": "Assumptions!B3"
  },
  "sheets": [
    {
      "name": "Assumptions",
      "columns": [
        { "width": 24 },
        { "width": 14, "format": "$#,##0" }
      ],
      "frozen": { "rows": 1, "columns": 0 },
      "cells": [
        { "ref": "A1", "value": "Starting Revenue", "style": "header" },
        { "ref": "B1", "value": 1200000, "format": "$#,##0", "style": "input", "note": "Source: Q4 2025 actuals" },
        { "ref": "B3", "formula": "=B1*(1+GrowthRate)", "format": "$#,##0", "style": "formula" }
      ],
      "merges": ["A1:C1"]
    }
  ]
}
\`\`\`

### Hard caps (validator rejects otherwise)
- Max **8 sheets** per workbook
- Max **500 cells** per sheet (roughly 50 rows × 10 cols; pick what fits, don't fill the cap)
- Max **200 formulas** per workbook
- Max **64 named ranges**
- Sheet names: letters, numbers, spaces, underscores only; ≤ 31 characters

### Cell rules
- \`ref\` is A1 notation (\`"A1"\`, \`"$B$12"\`). Required.
- Provide **either** \`value\` **or** \`formula\`, never both.
- \`formula\` must start with \`=\`. Use A1 refs and named ranges freely. Functions supported: SUM, AVERAGE, MIN, MAX, IF, IFERROR, VLOOKUP, INDEX, MATCH, SUMIF, SUMIFS, AVERAGEIFS, COUNTIFS, NPV, IRR, XIRR, PMT, RATE, DATE, EOMONTH, NETWORKDAYS, TEXT, LEFT, RIGHT, MID, LEN, CONCATENATE, ROUND, ABS, and most common Excel functions.
- Cross-sheet refs: \`Sheet2!A1\`. Same-sheet refs: \`A1\`.
- \`format\` is an Excel number format string. Common presets:
  - Currency: \`"$#,##0"\`, \`"$#,##0.00"\`, \`"$#,##0;($#,##0);-"\` (dash for zero)
  - Percentage: \`"0.0%"\`, \`"0.00%"\`
  - Multiples (P/E, EV/EBITDA): \`"0.0x"\`
  - Plain thousands: \`"#,##0"\`
  - Dates: \`"yyyy-mm-dd"\`, \`"mmm d, yyyy"\`
- \`style\` is one of: \`"header"\`, \`"input"\`, \`"formula"\`, \`"cross-sheet"\`, \`"highlight"\`, \`"note"\`.
  - Use \`"input"\` for hardcoded numbers the user is expected to change (assumptions, drivers).
  - Use \`"formula"\` for calculated cells.
  - Use \`"cross-sheet"\` for formulas pulling from another sheet.
  - Use \`"highlight"\` for cells needing user attention.
- \`note\` is a cell comment. Use it to cite sources for hardcoded numbers: \`"Source: Company 10-K, FY2024, Page 45"\`.

### Financial model conventions (apply when the user asks for a model)
- Put **all assumptions** (growth rates, margins, multiples, tax rates) in a dedicated \`Assumptions\` sheet. Cells use \`style: "input"\`.
- Reference assumptions from other sheets via **named ranges** or cross-sheet refs (never hardcode the same number twice).
- **Never mix number and letter dates in a column.** Pick ISO (\`"2026-04-23"\`) and stay.
- Years as text: \`"2026"\` value with format \`"0"\` (so Excel doesn't add thousand-separator).
- Use negative-in-parens format for currency: \`"$#,##0;($#,##0);-"\`.
- Round where precision adds noise: \`=ROUND(B2, 0)\` rather than ten decimal places.

## Anti-patterns (validator rejects)

- ❌ \`"kind": "spreadsheet/v2"\` or any value other than \`"spreadsheet/v1"\`
- ❌ Cell with both \`value\` and \`formula\`
- ❌ Cell with neither \`value\` nor \`formula\`
- ❌ Formula referencing an undefined cell (\`=Z99*2\` when Z99 is not in \`cells\`)
- ❌ Circular reference (\`A1: =B1+1\`, \`B1: =A1+1\`)
- ❌ Duplicate \`ref\` inside one sheet
- ❌ Duplicate sheet names
- ❌ Sheet name with \`!\`, \`:\`, \`*\`, \`?\`, \`/\`, \`\\\`, \`[\`, \`]\`
- ❌ Unknown \`style\` name (typos)
- ❌ More than 8 sheets / 500 cells per sheet / 200 formulas / 64 named ranges
- ❌ Using Shape A or B when the user's intent requires Shape C (formulas, formatting, multi-sheet)
- ❌ Markdown fences wrapping the JSON (\`\`\`json ... \`\`\`) — emit raw JSON only
- ❌ Placeholder data (\`"John Doe"\`, \`"Company A"\`, \`foo\`, \`bar\`) — use realistic names, companies, amounts`,
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
    {
      label: "JSON spec — 3-year revenue projection with Assumptions and Projections sheets",
      code: JSON.stringify(
        {
          kind: "spreadsheet/v1",
          theme: { font: "Arial", inputColor: "#0000FF", formulaColor: "#000000" },
          namedRanges: {
            StartingRevenue: "Assumptions!B2",
            GrowthRate: "Assumptions!B3",
            EbitdaMargin: "Assumptions!B4",
          },
          sheets: [
            {
              name: "Assumptions",
              columns: [{ width: 28 }, { width: 16, format: "$#,##0" }],
              frozen: { rows: 1 },
              cells: [
                { ref: "A1", value: "Driver", style: "header" },
                { ref: "B1", value: "Value", style: "header" },
                { ref: "A2", value: "Starting Revenue (FY25)" },
                { ref: "B2", value: 4200000, format: "$#,##0", style: "input", note: "Source: FY25 actuals" },
                { ref: "A3", value: "Annual Growth Rate" },
                { ref: "B3", value: 0.18, format: "0.0%", style: "input" },
                { ref: "A4", value: "EBITDA Margin" },
                { ref: "B4", value: 0.28, format: "0.0%", style: "input" },
              ],
            },
            {
              name: "Projections",
              columns: [
                { width: 18 },
                { width: 16, format: "$#,##0" },
                { width: 16, format: "$#,##0" },
                { width: 16, format: "$#,##0" },
              ],
              frozen: { rows: 1 },
              cells: [
                { ref: "A1", value: "Metric", style: "header" },
                { ref: "B1", value: "FY26", style: "header" },
                { ref: "C1", value: "FY27", style: "header" },
                { ref: "D1", value: "FY28", style: "header" },
                { ref: "A2", value: "Revenue" },
                { ref: "B2", formula: "=StartingRevenue*(1+GrowthRate)", style: "cross-sheet", format: "$#,##0" },
                { ref: "C2", formula: "=B2*(1+GrowthRate)", style: "formula", format: "$#,##0" },
                { ref: "D2", formula: "=C2*(1+GrowthRate)", style: "formula", format: "$#,##0" },
                { ref: "A3", value: "EBITDA" },
                { ref: "B3", formula: "=B2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
                { ref: "C3", formula: "=C2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
                { ref: "D3", formula: "=D2*EbitdaMargin", style: "cross-sheet", format: "$#,##0" },
              ],
            },
          ],
        },
        null,
        2
      ),
    },
  ],
}
