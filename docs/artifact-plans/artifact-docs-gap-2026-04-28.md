# Gap audit — RESOLVED

> **Status (2026-04-28, post-edit):** all gaps identified in the
> original audit have been actioned in the 3 docs. This file is kept
> as a record of what was found and what was changed.
> **Source docs now pinned to `a81c343` (HEAD).**

---

## Summary of changes applied

### 1. Stale references — removed

All references to deleted code are gone from the 3 docs:

- `lib/document-ast/{schema,validate,to-docx,resolve-unsplash}.ts`
  and `examples/*` — table dropped from architecture §12; "Format B —
  AST" sub-section dropped from capabilities §6; AST mode lines pruned
  from deepscan §1, §2, §3, §4, §5, §6, §11, glossary.
- `renderers/document-renderer.tsx` — removed from architecture
  module map and §7; removed from capabilities §6 renderer paragraph;
  removed from deepscan §6 dispatch tree.
- `artifacts/edit-document-modal.tsx` — removed from architecture
  module map; D-12 marked resolved in deepscan §12.
- `lib/rendering/server/mermaid-to-svg.ts` — removed from
  architecture §11 and §14; removed from capabilities sandbox section;
  D-49/D-50/D-68/D-69 marked resolved in deepscan §12.
- `ARTIFACT_DOC_FORMAT_DEFAULT` env switch — replaced everywhere with
  the hardcoded `DOC_FORMAT = "script"` in `create-artifact.ts:18`.

### 2. Drift in numbers — reconciled

Capabilities was the consistently-stale doc. All 4 mismatches fixed:

| Constant | Was (caps) | Now (caps + verified) |
|---|---|---|
| `_mermaid-types.ts` entries | 22 | **25** |
| `SLIDE_LAYOUTS` entries | "17 layouts" | **18** (deprecated `image-text` included) |
| `RAW_HTML_DISALLOWED` items | 12 (with `<sub>`/`<script>`) | **10** (`<sub>` not in code; `<script>` lives in a separate env-gate) |
| `PYTHON_UNAVAILABLE_PACKAGES` | "12 in validator" | **15** |

### 3. Findings — closure status

D-N findings were re-verified against HEAD; deepscan §12 now splits
**Open** vs **Resolved**.

**Resolved since `8b6e69b`** (16 entries):
D-1, D-6, D-10, D-12, D-21, D-22, D-23, D-31, D-44, D-45, D-46
(downgraded), D-49, D-50, D-53 (dup), D-60, D-68, D-69, D-70.

**Still open** (kept in deepscan §12 with the same numbers, no
renumbering): D-2, D-3, D-4, D-5, D-7, D-8, D-9, D-11, D-13, D-14,
D-15, D-16, D-17, D-18, D-19, D-20, D-24, D-25, D-26, D-27, D-28,
D-29, D-30, D-32–D-43, D-47, D-48, D-51, D-52, D-54–D-59, D-61–D-67.

### 4. Coverage gaps — addressed

- **Streamdown 4th mermaid path:** still flagged as D-25 in deepscan
  with cross-link to capabilities §5. Not file:line-pinned in
  architecture because Streamdown is a third-party module — left as
  D-25 with no architecture pointer.
- **`csv.ts` new file:** added to architecture §1 module map and §13
  table. Resolves D-60.
- **Mermaid path count:** deepscan §11 reduced from "3 + 1 outlier"
  to "2 + 1 outlier" (server SVG path removed; client PNG + standalone
  preview remain), which now matches reality.

### 5. Re-pinning

All 3 docs' headers updated from `8b6e69b` to `a81c343`. Architecture
§16 footnote updated to acknowledge that some line numbers were
re-anchored ("upper", "mid", etc.) rather than re-counted exactly,
since the AST removal moved many surfaces by tens of lines.

---

## Original audit findings (preserved for traceability)

The pre-edit findings are preserved below as reference. All have now
been actioned per the summary above.

### A. Stale terhadap HEAD (`a81c343`)

`git diff --stat 8b6e69b..HEAD -- src/` showed:

| File yang dihapus | Doc yang merujuk (sekarang sudah dibersihkan) |
|---|---|
| `src/lib/document-ast/schema.ts` (376 LoC) | architecture §12 |
| `src/lib/document-ast/validate.ts` (290 LoC) | architecture §12; deepscan D-44 |
| `src/lib/document-ast/to-docx.ts` (827 LoC) | architecture §12; deepscan D-45/D-70 |
| `src/lib/document-ast/resolve-unsplash.ts` (139 LoC) | architecture §12 |
| `src/lib/document-ast/examples/{letter,proposal,report}.ts` | (internal) |
| `src/.../renderers/document-renderer.tsx` (630 LoC) | architecture §7; capabilities §6 Format B |
| `src/.../artifacts/edit-document-modal.tsx` (73 LoC) | architecture §1; deepscan D-12 |
| `src/lib/rendering/server/mermaid-to-svg.ts` (140 LoC) | architecture §14; capabilities sandbox; deepscan D-49/D-50/D-68/D-69 |

### B. Drift antar-3-doc (sekarang aligned)

| Konstanta | Was-architecture | Was-capabilities | Was-deepscan | **HEAD** | Resolution |
|---|---|---|---|---|---|
| `_mermaid-types.ts` | 25 | 22 | 25 | **25** | caps fixed |
| `SLIDE_LAYOUTS` | 18 | 17 | 18 | **18** | caps fixed |
| `RAW_HTML_DISALLOWED` | 10 | 12 | (none) | **10** | caps fixed |
| `PYTHON_UNAVAILABLE_PACKAGES` | 15 | 12 | (none) | **15** | caps fixed |

### C. Coverage gap (sekarang sudah diisi)

- Streamdown 4th-mermaid-path → kept as D-25 in deepscan, called out in
  capabilities §5.
- D-12 EditDocumentModal orphan → file deleted (`0b25e56`); D-12 marked
  resolved.
- D-38 metrics no external sink → still listed in deepscan §12 (open).
- D-64 XLSX no chart-emit → architecture §13 row now flags D-64.
- D-51 chart-to-svg light theme → architecture §14 row now flags D-51.
- Cross-validator inconsistency `area` chart in sheet vs slides → still
  noted in capabilities §10 as "worth noting"; not elevated to a D-N.
