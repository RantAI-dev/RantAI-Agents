# Artifact Backend — Prompt Optimization & Backend Improvements

**Date:** 2026-04-06
**Scope:** Backend artifact system untuk chat — tool prompts, RAG indexing, version history, session cleanup, validation.

---

## Ringkasan Perubahan

### Part 1: Prompt & Tool Instruction (Quality Improvement)

#### 1A. `buildToolInstruction()` — Conditional Per-Type Injection
**File:** `src/lib/prompts/instructions.ts`

- Extracted 11 artifact type instructions ke `ARTIFACT_TYPE_INSTRUCTIONS` map (per-type constant)
- Extracted shared design rules ke `DESIGN_QUALITY_INSTRUCTION` constant
- **Path 2 (specific canvas mode)** sekarang inject hanya instruction untuk type yang diminta + design quality (~300-500 token vs ~3500 token sebelumnya)
- **Path 1 (auto)** dan **Path 3 (no canvas)** tetap inject semua type descriptions
- **Sebelum:** Specific canvas mode (misal `application/react`) hanya dapat constraint "You MUST use type=X" tanpa formatting rules — justru lebih sedikit guidance daripada auto mode
- **Sesudah:** Specific mode mendapat instruksi lengkap khusus type tersebut

#### 1B. Tool Descriptions
**Files:** `src/lib/tools/builtin/create-artifact.ts`, `src/lib/tools/builtin/update-artifact.ts`

- `create_artifact` description: Ditambahkan quality expectations — "complete, self-contained, production-quality, no placeholders, no TODOs"
- `update_artifact` description: Ditambahkan guidance untuk preserve structure, provide COMPLETE content, maintain production quality
- Parameter `content` descriptions: Sekarang spesifik per format (HTML full doc, React export default, slides JSON, etc.)
- Parameter `title`: "3-8 words" guidance
- Parameter `type`: Lebih concise, format-based description

---

### Part 2: Backend Improvements

#### 2A. RAG Re-indexing on Artifact Update
**Files baru:** `src/lib/rag/artifact-indexer.ts`
**Files diubah:** `src/lib/rag/vector-store.ts`, `src/lib/rag/index.ts`, `src/lib/tools/builtin/update-artifact.ts`, `src/lib/tools/builtin/create-artifact.ts`

- Dibuat `indexArtifactContent()` shared helper — chunk, embed, store ke SurrealDB
- Dibuat `deleteChunksByDocumentId()` di vector-store — hapus chunks tanpa hapus Document record
- `update_artifact` sekarang re-index content setelah update (background, fire-and-forget)
- `create_artifact` di-refactor untuk pakai shared helper yang sama
- **Sebelum:** RAG search mengembalikan content lama setelah artifact diupdate
- **Sesudah:** Content terbaru selalu terindeks

#### 2B. Version History — S3 Archival
**Files:** `src/lib/tools/builtin/update-artifact.ts`, `src/features/conversations/sessions/service.ts`

- Versi lama sekarang di-archive ke S3 key terpisah (`{s3Key}.v{N}`)
- Metadata hanya simpan pointer ringan: `{title, timestamp, contentLength, s3Key}`
- Fallback: jika S3 archive gagal, tetap simpan inline `content` (backward compatible)
- Cap 20 versi maksimal (versi tertua dihapus)
- **Sebelum:** Full content disimpan di metadata JSON — DB bloat seiring waktu
- **Sesudah:** DB ringan, content versi lama ada di S3

#### 2C. Session Deletion — S3 & RAG Cleanup
**Files:** `src/features/conversations/sessions/service.ts`, `src/features/conversations/sessions/repository.ts`

- Ditambah `findArtifactsBySessionId()` dan `deleteArtifactsBySessionId()` di repository
- `deleteDashboardChatSession()` sekarang cleanup sebelum delete session:
  1. Query semua artifact documents
  2. Batch delete S3 files via `deleteFiles()`
  3. Delete SurrealDB chunks via `deleteChunksByDocumentId()`
  4. Delete Document records via `deleteMany()`
  5. Delete session
- **Sebelum:** Session dihapus, documents jadi orphan (sessionId = null), S3 files dan SurrealDB chunks tetap ada
- **Sesudah:** Full cleanup — tidak ada resource orphan

#### 2D. Error Persistence Flag
**Files:** `src/lib/tools/builtin/create-artifact.ts`, `src/lib/tools/builtin/update-artifact.ts`

- Tool return value sekarang include `persisted: boolean`
- Jika S3/DB gagal, `persisted: false` — frontend bisa tampilkan warning
- **Sebelum:** Error silently swallowed, user tidak tahu artifact tidak tersimpan

#### 2E. Content Size Limit
**Files:** `src/lib/tools/builtin/create-artifact.ts`, `src/lib/tools/builtin/update-artifact.ts`

- `MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024` (512 KB)
- Validasi di awal `execute()` sebelum persistence
- Return error message jika melebihi limit

#### 2F. Tighten Zod Schemas
**File:** `src/features/conversations/sessions/schema.ts`

- 5 schema yang sebelumnya `z.any()` diganti dengan proper typed schemas:
  - `DashboardChatSessionCreateBodySchema` — `{assistantId: string, title?: string}`
  - `DashboardChatSessionUpdateBodySchema` — `{title?: string}`
  - `DashboardChatSessionMessagesBodySchema` — `{messages: Array<{id?, role, content, replyTo?, editHistory?, sources?, metadata?}>}`
  - `DashboardChatSessionMessageUpdateBodySchema` — `{messageId: string, content?, editHistory?, sources?, metadata?}`
  - `DashboardChatSessionMessageDeleteBodySchema` — `{messageIds: string[]}`
- Semua route sudah pakai `.safeParse()` — error 400 otomatis jika input tidak valid

---

## Files Changed Summary

| File | Perubahan |
|------|-----------|
| `src/lib/prompts/instructions.ts` | Refactored: per-type instruction map, conditional injection |
| `src/lib/tools/builtin/create-artifact.ts` | Improved descriptions, size limit, error flag, shared indexer |
| `src/lib/tools/builtin/update-artifact.ts` | Improved descriptions, RAG re-index, S3 version archival, size limit, error flag |
| `src/lib/rag/artifact-indexer.ts` | **NEW** — shared chunk+embed helper |
| `src/lib/rag/vector-store.ts` | Added `deleteChunksByDocumentId()` |
| `src/lib/rag/index.ts` | Exported new functions |
| `src/features/conversations/sessions/service.ts` | Session deletion cleanup, S3 version archival |
| `src/features/conversations/sessions/repository.ts` | Added `findArtifactsBySessionId()`, `deleteArtifactsBySessionId()` |
| `src/features/conversations/sessions/schema.ts` | Replaced `z.any()` with proper typed schemas |

---

## Verifikasi

- `bun check:domain-imports` — **PASSED** (1061 files)
- TypeScript dan lint memerlukan environment setup lengkap untuk dijalankan
- Manual test: buat artifact di chat, update, delete session — pastikan S3/RAG cleanup berjalan
