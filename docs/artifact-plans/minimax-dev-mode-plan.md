# MiniMax Dev-Mode Provider Plan

**Tanggal:** 2026-04-30
**Tujuan:** pakai MiniMax sebagai chat provider hanya saat development supaya hemat token. Production tetap OpenRouter.
**Prinsip utama:** isolasi total — semua perubahan reversible dengan menghapus 1 file + 2 env var + 1 dependency, **tanpa** menyentuh 12 call site lagi.

---

## Prinsip reversibility

1. **Satu titik abstraksi**: semua logika provider switching hidup di `src/lib/llm/provider.ts`. Call site tidak pernah tahu MiniMax ada.
2. **Helper bersifat permanen**: `getChatProvider()` + `resolveModelId()` adalah API stabil. Saat MiniMax dihapus, helper-nya **tetap ada**, isi-nya yang diganti jadi pass-through OpenRouter saja. Ini mencegah refactor 12 file di masa depan.
3. **Tidak ada cabang MiniMax di luar helper**: pencarian `grep -rn "minimax\|MiniMax\|MINIMAX" src/` hanya boleh nge-hit `provider.ts`. Kalau ada lain, itu pelanggaran prinsip — fix dulu.
4. **Tidak ada migrasi DB**: tidak menambah row Provider, tidak mengubah schema. Provider dev tidak boleh mengotori data prod.
5. **Tidak ada perubahan UI**: dashboard model selector, sync OpenRouter, semua tetap pakai OpenRouter. User tidak melihat opsi "MiniMax" di mana pun.

---

## Struktur file

### Baru
- `src/lib/llm/provider.ts` — helper terpusat.

### Diubah (12 file, mekanis 2 baris per file)
Replace `import { createOpenRouter } from "@openrouter/ai-sdk-provider"` + `createOpenRouter({...})` block + `openrouter(id)` call.

```
src/lib/llm/generate.ts
src/lib/memory/long-term-memory.ts
src/lib/workflow/chatflow.ts
src/lib/workflow/chatflow-memory.ts
src/lib/workflow/nodes/agent.ts
src/lib/workflow/nodes/llm.ts
src/lib/workflow/nodes/stream.ts
src/features/agent-api/service.ts
src/features/assistants/wizard/service.ts
src/features/chat-public/service.ts
src/features/digital-employees/whatsapp-webhooks/service.ts
src/features/widget/chat/service.ts
```

Pola pengganti:
```ts
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
// ...
const model = getChatProvider()(resolveModelId(modelId))
```

### Tidak disentuh (sengaja, bukan oversight)
- `src/lib/ocr/providers/openrouter-provider.ts` — OCR vision, MiniMax tidak setara.
- `src/lib/rag/embeddings.ts` + reranker — beda dimensi → invalidate vektor DB.
- `src/lib/document-intelligence/*` — biarkan OpenRouter.
- `src/lib/models/sync.ts`, `providers.ts` — katalog model UI, OpenRouter only.

---

## Bentuk `provider.ts`

```ts
import "server-only"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

// === REMOVAL CHECKLIST (kalau MiniMax mau dihapus) ===
// 1. Hapus import createOpenAICompatible di atas.
// 2. Hapus const MINIMAX_BASE_URL, MINIMAX_FALLBACK_MODEL, isDevMiniMax().
// 3. Sederhanakan getChatProvider() jadi: return createOpenRouter({ apiKey: ... }).
// 4. Sederhanakan resolveModelId(id) jadi: return id.
// 5. Hapus AI_PROVIDER_MODE & MINIMAX_API_KEY dari .env dan .env.example.
// 6. bun remove @ai-sdk/openai-compatible
// 7. Selesai. Tidak perlu menyentuh 12 call site.

const MINIMAX_BASE_URL = "https://api.minimaxi.chat/v1"
const MINIMAX_FALLBACK_MODEL = "MiniMax-M1"

function isDevMiniMax(): boolean {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.AI_PROVIDER_MODE !== "minimax") return false
  if (!process.env.MINIMAX_API_KEY) return false
  return true
}

// Hard guard — fail-fast kalau env bocor ke prod.
if (process.env.NODE_ENV === "production" && process.env.AI_PROVIDER_MODE === "minimax") {
  throw new Error(
    "[provider] AI_PROVIDER_MODE=minimax tidak boleh aktif di production. " +
    "Hapus env var ini dari deployment."
  )
}

export function getChatProvider() {
  if (isDevMiniMax()) {
    if (process.env.NODE_ENV !== "test") {
      console.log("[provider] mode=minimax (dev)")
    }
    return createOpenAICompatible({
      name: "minimax",
      baseURL: MINIMAX_BASE_URL,
      apiKey: process.env.MINIMAX_API_KEY!,
    })
  }
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY || "" })
}

export function resolveModelId(originalId: string): string {
  if (isDevMiniMax()) return MINIMAX_FALLBACK_MODEL
  return originalId
}
```

Catatan desain:
- **Hard guard di module top-level**, bukan di dalam fungsi. Kalau env salah, app crash saat startup, bukan saat user kirim pesan. Fail-loud.
- **Fallback ke OpenRouter otomatis** kalau `MINIMAX_API_KEY` tidak diisi, walau `AI_PROVIDER_MODE=minimax`. Mencegah app mati gara-gara lupa isi key.
- **Single fallback model** (`MiniMax-M1`) untuk semua call site. Kalau nanti perlu mapping per model, tambahkan di `resolveModelId` saja, call site tetap.

---

## Env

`.env` (sudah di-gitignore di repo ini, dikonfirmasi via `git check-ignore`):
```
AI_PROVIDER_MODE=minimax
MINIMAX_API_KEY=
```

`.env.example` (tambah dengan komentar):
```
# Dev-only: switch chat provider ke MiniMax untuk hemat token saat develop.
# Jangan set di production — akan throw saat startup. Lihat src/lib/llm/provider.ts.
AI_PROVIDER_MODE=
MINIMAX_API_KEY=
```

---

## Dependency

```
bun add @ai-sdk/openai-compatible
```

Saat removal: `bun remove @ai-sdk/openai-compatible`.

---

## Smoke test setelah patch

1. `bun dev` tanpa `MINIMAX_API_KEY` → jalan pakai OpenRouter (path fallback).
2. Set `MINIMAX_API_KEY` + `AI_PROVIDER_MODE=minimax` → `bun dev` → terminal log `[provider] mode=minimax (dev)`.
3. Kirim pesan ke salah satu assistant → respon dari MiniMax-M1.
4. Tool calling: cek satu tool (mis. RAG search) tetap ke-trigger.
5. `NODE_ENV=production AI_PROVIDER_MODE=minimax bun start` → harus throw saat boot.
6. `bun run typecheck` (atau `tsc --noEmit`) → 0 error.

---

## Removal procedure (referensi masa depan)

Saat MiniMax sudah tidak diperlukan:

1. Edit `src/lib/llm/provider.ts` ikuti REMOVAL CHECKLIST di header file.
2. `bun remove @ai-sdk/openai-compatible`
3. Hapus `AI_PROVIDER_MODE` & `MINIMAX_API_KEY` dari `.env` lokal masing-masing dev.
4. Hapus 2 baris di `.env.example`.
5. Hapus dokumen ini (`docs/artifact-plans/minimax-dev-mode-plan.md`).
6. Verifikasi: `grep -rn "minimax\|MiniMax\|MINIMAX" src/` → harus kosong.
7. `bun run typecheck` → 0 error.
8. Commit: `chore(llm): remove minimax dev provider, back to openrouter only`.

**Tidak perlu menyentuh 12 call site** — itulah point of the abstraction.

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Env bocor ke prod → app pakai dev provider | Hard guard throw saat startup |
| MiniMax-M1 tool calling beda dengan OpenRouter | Smoke test step 4. Kalau gagal, fallback ke `abab6.5s-chat`. |
| Latency MiniMax dari ID/SEA tidak setara | Acceptable buat dev — bukan untuk uji performa. |
| Developer lupa hard-test di OpenRouter sebelum merge | Tambahkan note di CONTRIBUTING / PR template: "uji akhir wajib `AI_PROVIDER_MODE= bun dev`". |
| Embedding model ikut switch tidak sengaja | Sudah dikecualikan eksplisit di plan; embedding pakai jalur sendiri (`src/lib/rag/embeddings.ts`) yang tidak lewat helper. |
