# Perbandingan: `application/sheet` (RantAI) vs Skill `xlsx` (Claude AI)

**Tanggal:** 2026-04-23
**Sumber:**
- RantAI: [sheet.ts](src/lib/prompts/artifacts/sheet.ts), [sheet-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx), [_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts), [architecture-reference.md](docs/artifact-plans/architecture-reference.md)
- Claude: `SKILL (1).md` (xlsx skill)

---

## TL;DR

Sheet artifact Anda adalah **CSV viewer** (table display + sort/filter lexicographic + CSV download), sedangkan skill `xlsx` Claude adalah **spreadsheet engineering toolchain** (native `.xlsx` binary + formulas + multi-sheet + cell formatting + financial modeling conventions). Keduanya melayani kebutuhan yang sangat berbeda — bukan sekedar "feature gap", melainkan **kategori produk berbeda**.

Jika tujuannya menyamai Claude, Anda butuh **artifact type baru** (mis. `application/xlsx`), bukan ekspansi `application/sheet` — karena model data, renderer, dan storage-nya fundamental beda.

---

## 1. Matrix Perbandingan Fitur

| Kapabilitas | RantAI `application/sheet` | Claude `xlsx` skill |
|---|:---:|:---:|
| **Format file output** | CSV text (`.csv`) | Native `.xlsx` binary |
| **Multi-sheet workbook** | ❌ | ✓ |
| **Excel formulas** (SUM, AVERAGE, IF, VLOOKUP) | ❌ | ✓ full library |
| **Formula recalculation** | N/A | ✓ via LibreOffice (`scripts/recalc.py`) |
| **Error detection** (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`) | ❌ | ✓ post-recalc scan |
| **Cell formatting** (bold, italic, font, color) | ❌ | ✓ via openpyxl |
| **Background fill / conditional formatting** | ❌ | ✓ |
| **Number format strings** (`$#,##0`, `0.0%`, `0.0x`) | ❌ (string only) | ✓ |
| **Negative numbers in parens** `(123)` | ❌ | ✓ |
| **Zero as dash** (`-`) | ❌ | ✓ |
| **Merged cells** | ❌ | ✓ |
| **Column widths / row heights** | ❌ auto only | ✓ explicit |
| **Cell comments / data source citation** | ❌ | ✓ required for hardcodes |
| **Embedded charts** | ❌ (pakai Recharts/Mermaid separate) | ✓ native Excel charts |
| **Edit existing `.xlsx`** | ❌ | ✓ `load_workbook` preserves formulas |
| **CSV ↔ XLSX conversion** | ❌ one-way (CSV out) | ✓ bidirectional |
| **`.xlsm` macro-enabled** | ❌ | ✓ read-only via override |
| **Professional font conventions** (Arial/Times) | ❌ | ✓ enforced |
| **Financial color coding** (blue inputs / black formulas / green links / red external / yellow assumption) | ❌ | ✓ enforced |
| **Formulas over hardcoded values** | N/A | ✓ **CRITICAL** rule |
| **Sort** | ✓ lexicographic (client) | ✓ native Excel (numeric + date-aware) |
| **Filter** | ✓ global substring (client) | ✓ native Excel filters |
| **Download** | ✓ `.csv` | ✓ `.xlsx` (+ derivatives) |
| **Validation** | ✓ CSV well-formedness + column count | ✓ formula errors post-recalc |
| **Row cap** | ~100 (no pagination) | unlimited (Excel handles) |
| **Column cap** | 10 (readability) | unlimited |
| **Nested data** | ❌ flatten required | ❌ flatten still recommended |
| **Rendering** | TanStack Table (read-only grid) | N/A (Python generates file, opened in Excel) |

---

## 2. Analisis Kategori Perbedaan

### 2.1 Level Abstraksi: Data vs Dokumen
- **RantAI** memperlakukan spreadsheet sebagai **data payload** — header + rows of strings, dikonsumsi lewat sort/filter/export.
- **Claude xlsx** memperlakukan spreadsheet sebagai **dokumen engineered** — formulas = logic, formatting = semantik (color coding = peran sel), cell comment = audit trail.

**Implikasi:** Sheet Anda cocok untuk *data inspection*, tidak cocok untuk *financial modeling, what-if analysis, business deliverables*.

### 2.2 Model Persistence

| Aspek | RantAI | Claude |
|---|---|---|
| Storage format | UTF-8 text di S3/Prisma | Binary blob `.xlsx` (ZIP of XML) |
| Round-trip fidelity | 100% lossless (text) | Lossy jika pakai `data_only=True` on save |
| Edit in place | Textarea (code tab) | `load_workbook` + `wb.save()` |
| Version diff | Readable (text) | Opaque (binary) — hanya size + timestamp |

### 2.3 Runtime Tool

| Aspek | RantAI | Claude |
|---|---|---|
| Runtime | Browser (TanStack) | Pyodide? Tidak — **native Python + LibreOffice** |
| Formula engine | None | LibreOffice headless via `soffice` |
| Workflow | LLM emits CSV → validator → render | LLM writes Python script (openpyxl/pandas) → execute → recalc → verify |
| Error correction loop | 1x validator bounce | Multiple iterations (recalc → error JSON → fix → recalc) |

### 2.4 Prompt Engineering Standards

**Claude** punya **standar profesional eksplisit** yang tidak ada di RantAI:
- "Zero Formula Errors" sebagai hard requirement
- Industry-standard color conventions untuk financial models (RGB values specified)
- Number format strings (`$#,##0;($#,##0);-`) dengan semantic meaning
- Cell-level source documentation: `"Source: Company 10-K, FY2024, Page 45, [SEC EDGAR URL]"`
- "Assumptions Placement" rule — pisahkan input dari formula
- "Use formulas, not hardcoded calculated values" — hard-enforced dengan ❌ / ✓ contoh code

**RantAI** fokus ke **data hygiene** (ISO dates, plain numerals, consistent booleans), tidak ada konsep:
- Formula correctness
- Model auditability
- Financial convention compliance

---

## 3. Apa yang Kurang (Gap List, Prioritized)

### P0 — Fundamental (Tanpa ini, "tidak sama" dengan Claude)

1. **Artifact type baru: `application/xlsx`**
   - Tetap pertahankan `application/sheet` untuk CSV quick tables
   - Tambah `application/xlsx` untuk: financial models, multi-sheet reports, formatted deliverables
   - Mime type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

2. **Storage & transport: binary (base64-encoded) di S3**
   - CSV: text (current) → tetap inline
   - XLSX: upload biner ke S3, `content` field di DB = base64 string atau hanya s3Key reference
   - Validator: wajib pakai `xlsx`/`exceljs` parse, bukan text validation

3. **LLM output format: structured JSON**
   - LLM tidak bisa emit binary — harus emit JSON representation yang server-side di-convert
   - Schema usulan:
     ```json
     {
       "theme": { "font": "Arial", "fontSize": 11 },
       "sheets": [
         {
           "name": "Revenue Model",
           "columns": [{ "width": 14 }, { "width": 12 }],
           "cells": [
             { "ref": "A1", "value": "Year", "format": { "bold": true, "bg": "#F1F5F9" } },
             { "ref": "B1", "value": "2024", "numFmt": "0" },
             { "ref": "B2", "formula": "=B1*(1+$D$1)", "numFmt": "$#,##0;($#,##0);-", "fontColor": "#000000" },
             { "ref": "D1", "value": 0.15, "numFmt": "0.0%", "fontColor": "#0000FF", "bg": "#FFFF00" }
           ],
           "merges": ["A1:C1"],
           "frozenRows": 1
         }
       ]
     }
     ```
   - Server: `exceljs` workbook builder → `.xlsx` blob → S3

4. **Formula engine**
   - Option A (preferred): `hyperformula` (pure JS, runs in-browser atau Node) — no LibreOffice dep
   - Option B: spawn LibreOffice headless di worker (mirror pipeline Claude); lebih berat tapi 100% Excel-compatible
   - Recalc saat: create, update, sebelum download
   - Error surface: tampilkan `#REF!` / `#DIV/0!` / `#VALUE!` inline di cell + panel error list

### P1 — Professional Feature Parity

5. **Renderer: interactive Excel-like grid**
   - Candidates:
     - [`@fortune-sheet/react`](https://github.com/ruilisi/fortune-sheet) — MIT, supports formulas, formatting, merges
     - [`x-spreadsheet`](https://github.com/myliang/x-spreadsheet) — simpler, MIT
     - [`handsontable`](https://handsontable.com/) — paling lengkap tapi commercial license
   - Must support: formula bar, sort (numeric + date), filter, cell format preview, multi-sheet tabs

6. **Prompt rules profesional**
   - Tambahkan section "Financial Modeling Conventions" di `xlsx.ts` prompt:
     - Color coding (blue/black/green/red/yellow)
     - Number formats (currency, %, multiples, parens negatives, dash zeros)
     - "Assumptions placement" rule
     - "Formulas over hardcodes" rule (dengan ❌/✓ example)
   - Tambahkan section "Data Sources" — comment pattern untuk hardcoded values

7. **Multi-format download**
   - Split-button (mirror pattern `text/document`):
     - `.xlsx` (primary)
     - `.csv` (flat, first sheet only)
     - optional: `.pdf` (rendered sheet via LibreOffice, atau skip like document does)

### P2 — Nice to Have

8. **Charts embedded di workbook**
   - `exceljs` supports native Excel charts (bar, line, pie)
   - LLM bisa emit `{ "charts": [{ sheet, type, range, anchor }] }`
   - Alternatif simpler: rely ke Recharts artifact + reference manual

9. **Edit existing .xlsx in chat**
   - User upload `.xlsx` sebagai attachment → convert ke structured JSON → feed ke LLM → LLM emit patched JSON → re-generate `.xlsx`
   - Preserves formulas via round-trip (kecuali style edge cases)

10. **Cell comments dengan source attribution**
    - LLM wajib tulis comment pada hardcoded inputs: `{ "ref": "B5", "value": 182300, "comment": "Source: Company 10-K FY2024, p.45" }`

11. **Conditional formatting & data validation**
    - Later phase — `exceljs` supports keduanya

---

## 4. Apa yang RantAI **BETTER** dari Claude

Worth calling out — Anda bukan sekadar "tertinggal":

1. **UX inline** — Claude spreadsheet keluar sebagai file download saja, user harus buka di Excel/LibreOffice. RantAI render langsung di panel chat, langsung usable.
2. **Sort/filter client-side** — tanpa re-prompt. Claude spreadsheet = static file, sort/filter di Excel terpisah.
3. **Streaming-friendly** — CSV text bisa streamed live saat LLM generate. Binary XLSX harus tunggu complete.
4. **No LibreOffice dependency** — zero infra surprise, zero per-request overhead.
5. **RAG indexable** — CSV text straight-forward untuk semantic search. Binary XLSX butuh extract-text pipeline dulu.
6. **Versioning clean** — text diff di version history. XLSX versioning = opaque blobs.

**Implication:** Jangan ganti `application/sheet`. Tambah `application/xlsx` sebagai type **pelengkap**, bukan pengganti.

---

## 5. Rekomendasi Rencana Implementasi

### Phase A — MVP XLSX (1-2 minggu)
- [ ] Tambah `application/xlsx` ke `VALID_ARTIFACT_TYPES`, `TYPE_ICONS`, `TYPE_LABELS`, `TYPE_COLORS`, `ARTIFACT_REGISTRY`
- [ ] Tulis `xlsx.ts` prompt rules (structured JSON schema + financial conventions)
- [ ] Server-side: install `exceljs`, tulis `jsonToXlsxBuffer(structured)` + `xlsxBufferToBase64()`
- [ ] Storage: `s3Key` pointing ke binary, `content` = base64 (atau skip inline)
- [ ] Validator: parse JSON → sanity check (refs valid, no circular formula)
- [ ] Renderer MVP: `@fortune-sheet/react` read-only view
- [ ] Download: `.xlsx` blob

### Phase B — Formula Engine (1 minggu)
- [ ] Integrate `hyperformula` — recalc on create/update
- [ ] Surface formula errors di UI (cell highlight + panel error list)
- [ ] Validator: post-recalc scan for `#REF!` etc, fail with specific cell refs
- [ ] LLM retry loop consumes error detail

### Phase C — Professional Polish (1 minggu)
- [ ] Color coding conventions di prompt + validator warns on violations
- [ ] Multi-sheet navigation di renderer
- [ ] Split-button download (`.xlsx` + `.csv`)
- [ ] Cell comment / hardcode source rule

### Phase D — Advanced (optional)
- [ ] Charts via `exceljs` chart API
- [ ] Upload existing `.xlsx` → convert to structured JSON via `exceljs` reader
- [ ] Conditional formatting

---

## 6. Estimated Effort

| Phase | Effort | Complexity |
|---|---|---|
| A — MVP | 1-2 minggu | Medium (mostly infra + prompt) |
| B — Formula engine | 1 minggu | High (hyperformula learning curve) |
| C — Polish | 1 minggu | Low |
| D — Advanced | 2+ minggu | High (charts + bidirectional edit) |

**Total to match Claude parity:** ~4-5 minggu engineering

**Total to get "good enough" for business use:** Phase A + B = **2-3 minggu**

---

## 7b. ALTERNATIF: Upgrade `application/sheet` (Tanpa New Type)

**Pertanyaan:** Bagaimana kalau solusi-nya upgrade `application/sheet` existing, bukan tambah type baru?

**Jawaban singkat:** Bisa, dan arguably **lebih bersih** daripada tambah type baru — via **progressive content format** dengan backward compat 100%.

### 7b.1 Core Idea: Satu Type, Tiga Format Content

`application/sheet` tetap satu type, tapi **accept tiga input format** dengan auto-detection:

```
Content detection at render/validate/download time:
  startsWith("[")                → JSON array (existing, unchanged)
  startsWith("{") + has "$format"→ JSON workbook (NEW, upgrade path)
  else                           → CSV (existing, unchanged)
```

**Option A — CSV** (existing, zero change):
```csv
Name,Salary
Alice,100000
```

**Option B — JSON array of objects** (existing, zero change):
```json
[{ "Name": "Alice", "Salary": 100000 }]
```

**Option C — JSON Workbook** (NEW, opt-in via sentinel):
```json
{
  "$format": "workbook",
  "theme": { "font": "Arial", "fontSize": 11 },
  "sheets": [
    {
      "name": "Revenue Model",
      "columnWidths": { "A": 20, "B": 14 },
      "frozenRows": 1,
      "cells": [
        { "ref": "A1", "value": "Year",    "style": { "bold": true, "bg": "#F1F5F9" } },
        { "ref": "B1", "value": "Revenue", "style": { "bold": true, "bg": "#F1F5F9" } },
        { "ref": "A2", "value": 2024 },
        { "ref": "B2", "value": 1000000, "numFmt": "$#,##0", "style": { "fontColor": "#0000FF" } },
        { "ref": "A3", "value": 2025 },
        { "ref": "B3", "formula": "=B2*(1+$D$1)", "numFmt": "$#,##0;($#,##0);-" },
        { "ref": "D1", "value": 0.15, "numFmt": "0.0%", "style": { "fontColor": "#0000FF", "bg": "#FFFF00" },
          "comment": "Key assumption — growth rate" }
      ],
      "merges": ["A5:C5"]
    }
  ]
}
```

**Sentinel `$format: "workbook"`** — eksplisit opt-in, menghindari ambiguity dengan JSON array of objects di top-level. Alternatif: detect via shape (`has sheets array`), tapi sentinel lebih predictable buat validator + LLM.

### 7b.2 Komponen yang Di-upgrade (5 titik sentuh)

| Komponen | Current | Upgrade |
|---|---|---|
| **[sheet.ts prompt](src/lib/prompts/artifacts/sheet.ts)** | 2 options (CSV, JSON array) | +Option C section + Financial Conventions sub-section |
| **[sheet-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/sheet-renderer.tsx)** | TanStack only | Format-detect → simple (TanStack) ATAU workbook (`@fortune-sheet/react` lazy-load) |
| **[_validate-artifact.ts validateSheet](src/lib/tools/builtin/_validate-artifact.ts)** | CSV + JSON array validation | +`validateWorkbook()` branch: refs, formulas parseable, post-recalc `#REF!` scan |
| **Download button** ([artifact-panel.tsx](src/features/conversations/components/chat/artifacts/artifact-panel.tsx)) | `.csv` single | Split-button `.csv` + `.xlsx` (all modes — generate xlsx via exceljs) |
| **Storage** ([Prisma Document + S3](src/lib/s3/index.ts)) | text inline | **No change** — workbook JSON tetap text, tetap streamable, tetap diffable, tetap RAG-indexable |

### 7b.3 Renderer — Dual-Mode Dispatch

```tsx
export function SheetRenderer({ content, title }: SheetRendererProps) {
  const mode = detectSheetMode(content)  // "csv" | "array" | "workbook"

  if (mode === "workbook") {
    // Lazy-load heavy grid only when needed
    return <WorkbookRenderer content={content} title={title} />
  }

  // Existing fast path — unchanged
  return <SimpleTableRenderer content={content} title={title} />
}
```

**Kunci:** simple sheets tidak kena overhead bundle fortune-sheet. Workbook mode pakai dynamic import dengan Suspense (pattern identik dengan renderer artifact lain).

### 7b.4 Formula Engine — `hyperformula` (Pure JS)

- **Tidak perlu LibreOffice** (unlike Claude) — `hyperformula` adalah formula engine full-JS, open source (GPLv3 / commercial)
- Server-side recalc saat create/update — reject jika ada `#REF!` / `#DIV/0!` / circular (validator bounce ke LLM)
- Client-side: workbook renderer pakai engine yang sama untuk live recalc saat user edit
- 400+ Excel functions supported (SUM, AVERAGE, IF, VLOOKUP, INDEX/MATCH, date/time, financial, statistical, logical, text — cukup untuk 99% business cases)

### 7b.5 Download — Split Button untuk Semua Mode

| Current content | `.csv` download | `.xlsx` download |
|---|---|---|
| CSV text | native passthrough | `exceljs` generates `.xlsx` dari parsed CSV |
| JSON array | serialize to CSV | `exceljs` generates `.xlsx` |
| Workbook JSON | flatten first sheet to CSV | `exceljs` converts workbook JSON to `.xlsx` (fidelitas tinggi: formulas preserved, formatting preserved) |

**Pattern yang sama dengan `text/document`** (split-button `.md` + `.docx`) — user jadi familiar.

### 7b.6 Prompt Rules — Append, Jangan Rewrite

Tambah dua section ke [sheet.ts](src/lib/prompts/artifacts/sheet.ts) prompt, tanpa mengubah Option A/B existing:

```
## Option C — JSON Workbook (for formulas, formatting, multi-sheet)

Use when user asks for: financial model, multi-sheet report, formatted
business deliverable, calculations that should recompute when inputs change.

Sentinel: top-level object with `"$format": "workbook"`

[... schema ...]

## Financial Modeling Conventions (workbook mode only)

When generating workbook content for financial/business models, follow
industry-standard color coding UNLESS the user overrides:

- Blue font (#0000FF): hardcoded inputs user will change (assumptions)
- Black font (#000000): ALL formulas and calculations
- Green font (#008000): cross-sheet links
- Yellow background (#FFFF00): key assumptions needing attention

Number formats:
- Currency: "$#,##0;($#,##0);-"  (parens for negatives, dash for zero)
- Percentage: "0.0%"
- Multiples: "0.0x"
- Years: plain integer, no thousand separator

NEVER hardcode a calculated value. If cell C5 = B5 * 1.05, write
`"formula": "=B5*$B$6"` with B6 as the 5% assumption, NOT
`"value": 1050`. This is CRITICAL — the whole point of a model is
that it recalculates.

Hardcoded inputs MUST have a source comment: `"comment": "Source:
Company 10-K FY2024 p.45"` — or leave blank if synthetic mock.
```

### 7b.7 Decision Rule untuk LLM

Tambah tabel di prompt:

| User wants | Format |
|---|---|
| Plain data listing (employees, sales rows, inventory) | **CSV** or **JSON array** |
| Sortable/filterable quick table | **CSV** or **JSON array** |
| Financial model with growth rates, projections | **Workbook** |
| Multi-sheet analysis (Revenue + Costs + Summary) | **Workbook** |
| Anything with formulas that should recompute | **Workbook** |
| Formatted report with headers, colors, merged cells | **Workbook** |
| Budget tracker, P&L, balance sheet, forecast | **Workbook** |

### 7b.8 Keuntungan Upgrade vs New Type

| Aspek | Upgrade (satu type) | New Type (dua type) |
|---|---|---|
| LLM decision | Format detection otomatis dari konteks | LLM harus pilih type duluan (canvas mode issue) |
| Prompt rules | Satu file [sheet.ts](src/lib/prompts/artifacts/sheet.ts), append-only | Dua file, logic decision duplicated |
| Canvas mode UI | Tetap "Spreadsheet" — satu pilihan | User harus tahu "Sheet" vs "XLSX" — confusing |
| Icon/label/color di UI | Tetap `Table2` + green | Butuh icon/color baru — design churn |
| Existing artifacts | Zero migration — semua tetap work | Zero migration (tapi dua paths co-exist) |
| Validator entry | Satu dispatch + 3 branch | Dua validator function |
| Download UI | Satu panel, split-button | Dua panel behavior |
| RAG indexing | Satu path | Dua paths |
| Storage schema | Tidak berubah | Tidak berubah (kedua text) |
| Testing matrix | 3 format × N features | (1+2) × N features — mirip |

**Hasil:** upgrade **lebih bersih dari sudut LLM + UX + prompt**, dengan complexity shift ke **renderer + validator** (internal) — yang memang tempat yang tepat.

### 7b.9 Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Workbook JSON bengkak > 512 KB cap | Raise cap ke 2 MB khusus mode workbook (di [create-artifact.ts](src/lib/tools/builtin/create-artifact.ts)); atau compress dengan cell run-length encoding |
| LLM bingung kapan pick workbook vs CSV | Decision rule table di prompt (7b.7) + examples |
| Fortune-sheet bundle size impact | Lazy-load (dynamic import) — only load saat workbook detected |
| `hyperformula` license (GPL) | Check license compatibility — if blocking, evaluate `formulajs` (MIT, less complete) atau `xlsx-calc` (MIT) |
| Format detection false-positive | Sentinel `$format: "workbook"` explicit, tidak bergantung heuristic |
| Existing validator stricter di CSV mode | Tidak berubah — detection dispatch dulu sebelum validate |
| Streaming: workbook JSON parse partial gagal | Renderer show "parsing..." state sampai content complete (existing CSV behavior tetap streaming-friendly) |
| Version diff readable | Tetap — JSON text diff-able; bonus: diff workbook lebih semantic (cell refs) dibanding CSV positional |

### 7b.10 Effort Estimate — Upgrade Path

Sedikit **lebih ringan** dari new-type path karena tidak ada registry/icon/label churn:

| Phase | Item | Effort |
|---|---|---|
| **A — Workbook MVP** | Schema + prompt Option C + `detectSheetMode` + `WorkbookRenderer` (read-only fortune-sheet) + validator skeleton | 5-7 hari |
| **B — Formula engine** | Integrate `hyperformula` + post-recalc error surface + LLM retry loop | 3-5 hari |
| **C — Conventions** | Financial prompt section + `exceljs` download path + split-button | 2-3 hari |
| **D — Polish** | Numeric/date sort in simple mode (bonus fix — sort lexicographic bug) + workbook examples | 2-3 hari |

**Total:** ~2-3 minggu untuk full Claude-like parity via upgrade (vs 4-5 minggu untuk new-type full path).

### 7b.11 Bonus: Fix Bug Lexicographic Sort Sekalian

Simple mode (CSV / JSON array) saat ini sort lexicographic — `"10" < "2"`. Sekalian upgrade, **deteksi numeric/date di column** dan pakai natural sort. LLM tetap emit ISO dates, tapi renderer cerdas. User experience simple mode jadi jauh lebih baik tanpa LLM apapun.

---

## 7c. Rekomendasi Final

**Pilih upgrade path** (Section 7b) kecuali ada alasan kuat untuk fork type:
- Lebih sedikit churn di prompt + UI
- Backward compat 100%
- Complexity landing di renderer (tempat yang tepat), bukan di LLM decision layer
- Fix bonus: numeric/date sort di simple mode

**Hindari new type** kecuali:
- Ada kebutuhan strict separation antara "quick data" vs "engineered model" di canvas mode UI
- Tim menolak bundle size fortune-sheet di sheet renderer (meski lazy-loaded)
- RAG/search behavior perlu beda total antara mode

---

## 7d. JUJUR: Apakah Upgrade Path Bener-Bener Parity dengan Claude?

**Jawaban pendek:** Tidak 100%. Gap-nya spesifik dan penting untuk diketahui sebelum commit ke arsitektur.

Upgrade path (Section 7b) mencapai ~80-85% parity untuk **business modeling use cases umum**. Untuk **100% parity** perlu arsitektur tambahan — mirip dengan bagaimana `application/python` artifact pakai Pyodide, bukan cuma string validation.

### 7d.1 Perbandingan Workflow Kualitas

**Claude xlsx (full stack):**
```
LLM reads skill (financial conventions)
  ↓
LLM writes Python script (openpyxl + pandas)
  ↓
Execute Python → generate .xlsx
  ↓
LibreOffice headless recalculates formulas
  ↓
Scan ALL cells → JSON {total_errors, error_summary}
  ↓
If errors: LLM reads JSON, fixes, regenerates
  ↓ (iterative, same execution context)
Clean .xlsx output
```

**Upgrade path (proposed):**
```
LLM emits structured JSON workbook (tanpa Python)
  ↓
Server exceljs → .xlsx buffer
  ↓
hyperformula recalculates in-memory
  ↓
Tool result → LLM (errors jika ada)
  ↓
LLM retry loop via tool re-call (context window cost)
  ↓
Clean .xlsx output
```

### 7d.2 Gap Kualitas Konkret (7 item)

| Gap | Claude xlsx | Upgrade path | Matter? |
|---|---|---|---|
| **Formula engine fidelity** | LibreOffice = Excel-identical, 500+ fn, decades edge-case testing | hyperformula ~400 fn; `formulajs` MIT tapi lebih sedikit; edge cases bisa differ | Untuk complex financial/statistical: YA |
| **Data wrangling pre-sheet** | LLM punya pandas: read-CSV → merge → groupby → pivot → emit | LLM harus bayangkan hasil akhir + emit cell-by-cell | Untuk dataset besar / ETL: YA |
| **Iteration loop cost** | Same Python execution — fix → recalc dalam detik | Tool retry = new LLM call = context window + latency | Untuk complex models: YA (3-5x lebih mahal) |
| **Read existing .xlsx round-trip** | `load_workbook` preserve formulas+formatting 100% | exceljs reader ada tapi fidelity drop di file complex (conditional formatting, pivot tables, charts) | Untuk edit existing file: YA |
| **Native Excel charts** | openpyxl chart API mature, many types | exceljs charts ada tapi less tested, styling terbatas | Untuk visual deliverable: YA (medium) |
| **Exotic formulas** | `SUMPRODUCT` arrays, `INDIRECT`, `OFFSET`, array formulas, Excel 365 LET/LAMBDA | hyperformula core subset; array formula support terbatas | Untuk power users: YA (niche) |
| **Extract-text utility** | Claude `extract-text` untuk analyze existing xlsx content | Butuh implement sendiri | Bisa di-add, minor |

### 7d.3 Gap yang BUKAN Masalah (Common Cases)

Untuk ~80% kebutuhan business user, upgrade path **sudah cukup**:
- Cell formatting (bold, italic, color, bg, borders) — exceljs equivalent penuh
- Common formulas (SUM, AVERAGE, IF, VLOOKUP, INDEX/MATCH, date/time, basic financial) — hyperformula cover
- Multi-sheet workbook — equivalent
- Number format strings — equivalent
- Merged cells, column widths, frozen panes — equivalent
- Cell comments — equivalent
- Named ranges (simple) — equivalent
- Professional conventions (color coding, font) — pure prompt engineering

### 7d.4 Option untuk Close Gap 100%

Ada 4 arsitektur pilihan dari "upgrade ringan" sampai "full parity":

#### **Option 1: Upgrade Path Murni** (Section 7b)
- Effort: 2-3 minggu
- Parity: ~80-85%
- Infra: zero baru
- **Cukup untuk:** business models, financial proposals, monthly reports, budget trackers, simple forecasts
- **Tidak cukup untuk:** complex ETL pipelines, round-trip edit existing xlsx, power-user financial models

#### **Option 2: Upgrade + Pyodide Execution Layer** (Hybrid)
- LLM punya dua opsi emit content:
  - (a) JSON workbook (current upgrade path) — quick, simple cases
  - (b) **Python script** (seperti `application/python` artifact) yang pakai openpyxl+pandas, **execute di Pyodide**, hasilkan base64 `.xlsx` yang dikembalikan sebagai artifact content
- Sudah ada infra: [python-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx) — Pyodide v0.27 dengan pandas + numpy pre-loaded
- **openpyxl tersedia di Pyodide** (pure Python, tested) — perlu `micropip.install("openpyxl")` di bootstrap
- Effort: +2 minggu on top of Option 1
- Parity: ~92-95%
- Gap tersisa: **formula recalc fidelity** (Pyodide tidak punya LibreOffice) — tapi mostly OK karena openpyxl bisa preserve formulas dan Excel client-side handle recalc saat user open
- **Cukup untuk:** hampir semua use case real-world termasuk data wrangling pre-sheet
- **Tidak cukup untuk:** server-side formula verification (`#REF!` scan sebelum deliver)

#### **Option 3: Server-side Python + LibreOffice Executor** (Full Claude Parity)
- Bangun executor service: dockerized Python + openpyxl + pandas + LibreOffice headless
- LLM emit Python code → execute server-side → mirror Claude exactly (recalc + error scan + retry loop)
- Mirror pattern dengan RantaiClaw digital employee infrastructure (sudah ada Docker pattern)
- Effort: +3-4 minggu infra setup (sandboxing, timeout, security, LibreOffice container ~1GB)
- Parity: **100%** — bit-identical workflow dengan Claude
- **Cukup untuk:** SEMUA use case Claude xlsx support
- **Biaya:** infra cost (per-execution Docker spawn atau warm pool), operational complexity, security audit surface

#### **Option 4: Hybrid — Best of Everything**
- JSON workbook mode (Option 1) untuk quick simple sheets
- Pyodide Python mode (Option 2) untuk data wrangling + complex generation
- Server-side LibreOffice hanya untuk **verify step** di final — generate via Pyodide/exceljs, **kirim ke LibreOffice pure untuk recalc + error scan**, kembali ke LLM kalau ada error
- Effort: ~5-6 minggu total
- Parity: **100%**
- Biaya: Docker infra tapi minimal (hanya verify, bukan generate) → lighter than Option 3

### 7d.5 Rekomendasi Realistik Berbasis Target User

**Pertanyaan yang harus dijawab dulu:**

1. **Siapa primary user RantAI?** Knowledge workers bikin laporan standar, atau analysts bikin complex models dengan array formulas?
2. **Apakah user sering upload existing .xlsx untuk di-edit?** Atau mostly generate from scratch?
3. **Seberapa kritis formula fidelity?** Monthly revenue projection OK dengan minor edge case, atau audit-grade model yang harus bit-identical dengan Excel?
4. **Budget infra?** Pyodide = browser cost (user), LibreOffice server = your cost

**Rekomendasi berdasarkan profile:**

| Primary use case | Recommended option | Parity vs Claude |
|---|---|---|
| Business proposals, simple models, reports | **Option 1 (upgrade murni)** | 85% cukup |
| General knowledge worker + occasional complex | **Option 2 (+ Pyodide)** | 93% |
| Financial analyst / power user focus | **Option 4 (hybrid)** | 100% |
| Mirror Claude exactly, budget tidak isu | **Option 3 (server LibreOffice)** | 100% |

### 7d.6 Honest Verdict

**Upgrade path sendiri (Option 1) TIDAK mencapai parity penuh** — tapi untuk 80% user business real, gap-nya tidak akan kelihatan. User yang bikin monthly report atau simple financial model tidak akan tahu beda antara hyperformula vs LibreOffice.

**User yang AKAN tahu beda:**
- Analyst yang copy-paste model existing dan expect formula preserve
- Power user yang pakai `INDIRECT`, array formulas, atau `LET`/`LAMBDA`
- Tim yang bangun audit-grade model (banking, M&A, actuarial)
- User yang butuh round-trip edit `.xlsx` upload

**Kalau target user adalah "kebanyakan orang":** Option 1 cukup, dan effort saved bisa dipakai untuk polish UX (formula bar di renderer, keyboard shortcut, dll.).

**Kalau target user termasuk power users:** go Option 2 atau 4. Option 2 paling pragmatis — leverage existing Pyodide infra yang sudah battle-tested di Python artifact.

**Kalau target adalah "bit-identical dengan Claude, tidak kompromi":** Option 3 atau 4, accept infra cost.

### 7d.7 Proposed Middle Path

Kalau ragu, **Option 2 (Upgrade + Pyodide)** adalah sweet spot:
- Reuse infra Python artifact yang sudah ada (zero new infra)
- Close 3 gap paling material: data wrangling, openpyxl fidelity, iteration-in-context
- Tetap biarkan JSON workbook mode untuk simple cases (tidak semua sheet butuh Python)
- Gap yang tersisa (LibreOffice recalc) bisa di-handle dengan: generate → download → Excel client-side recalc saat user buka. Dalam praktik ini **tidak terlihat** karena Excel/LibreOffice auto-recalc saat open.

**Effort total Option 2:** ~4-5 minggu (Option 1: 2-3 minggu + Pyodide openpyxl bootstrap + dual-mode renderer + prompt untuk Python mode: ~2 minggu)

**Parity effective dalam praktik:** ~95% (gap 5% adalah server-side pre-delivery error scan, yang secara UX di-handle oleh Excel saat user buka file)

---

## 8. Summary per "Apa yang kurang dari saya"

**Inti kekurangan:**
1. Tidak ada **binary Excel file** support — hanya CSV text
2. Tidak ada **formula execution** — tidak bisa bikin model interaktif
3. Tidak ada **cell formatting** (bold/color/number format) — semua string plain
4. Tidak ada **multi-sheet** workbook
5. Tidak ada **professional financial conventions** di prompt rules (color coding, assumption placement, formula-over-hardcode)
6. Tidak ada **error detection** post-recalc (`#REF!` dll.)
7. Tidak ada **edit existing xlsx** round-trip
8. Sort **lexicographic saja** — `"10" < "2"` (ini bug untuk user kerja serius)

**Prioritas kalau mau catch up fast:**
- P0: `application/xlsx` type baru + structured JSON format + `exceljs` + `@fortune-sheet/react`
- P1: `hyperformula` formula recalc + financial prompt conventions
- P2: charts, upload-edit, comments
