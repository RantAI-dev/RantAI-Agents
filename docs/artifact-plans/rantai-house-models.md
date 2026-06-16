# RantAI House Models (MiniMax-backed, white-labeled)

**Status:** implemented on branch `feat/plan-aware-models` (uncommitted).
**TL;DR:** First-party, white-labeled models served **directly by MiniMax** (not via OpenRouter). Users see only RantAI branding. Priced with a **synthetic credit price decoupled from real cost** so we control the user-facing cost. This is the **cost / value lever** — not a "premium tier" (premium = frontier models gated per-plan, separate work).

---

## 1. The lineup (cheap → premium)

| RantAI model | id | upstream (server-only) | synthetic price $/1M (in/out) | context | vision | credits / 1M out |
|---|---|---|---|---|---|---|
| **RantAI Nano** | `rantai/nano` | `MiniMax-M2.5` | 0.08 / 0.30 | 205K | – | 300 |
| **RantAI Swift** | `rantai/swift` | `MiniMax-M2.7` | 0.10 / 0.40 | 205K | – | 400 |
| **RantAI Prime** | `rantai/prime` | `MiniMax-M3` | 0.60 / 2.40 | 1M | ✓ | 2,400 |

All three support **function/tool calling** and streaming. For reference, Claude Sonnet-class is ~15,000 credits / 1M output — so even Prime is ~6× cheaper for the user, and Nano/Swift ~37–50× cheaper.

> The synthetic prices are the **tuning knob**, set in `house-models.ts`. They are what the *user* is charged, deliberately decoupled from what the upstream costs us.

---

## 2. How it works (architecture)

Drop-in by design — adding a chat model touches **only** `house-models.ts`.

| File | Role |
|---|---|
| `packages/rantai-agents/src/lib/llm/house-models.ts` | Registry (pure, env-free, client-safe). Source of truth: id, branded name, synthetic `pricing`, capabilities, `backendModel`. |
| `packages/rantai-agents/src/lib/llm/provider.ts` | `getChatProvider()` returns a per-id router: `isHouseModel(id)` → MiniMax client (`MINIMAX_BASE_URL`), else OpenRouter. `resolveModelId` passes house ids through. **Zero call-site changes** (all 11 `getChatProvider()(resolveModelId(x))` sites unchanged). |
| `apps/cloud/src/lib/model-pricing.ts` | Spreads `HOUSE_MODELS` into `MODEL_PRICING`, so credit charging (fallback path — house models aren't in the synced `LlmModel` table) uses the synthetic price. |
| `apps/cloud/src/app/api/dashboard/models/route.ts` | Injects house models into the picker (only when `MINIMAX_API_KEY` is set); marks them `category: "recommended"`. |
| `packages/rantai-agents/src/features/assistants/wizard/service.ts` | `listModels` includes house models so wizard-built agents can default to a cheap option. |

**Gating:** `MINIMAX_API_KEY` present → models visible + usable; blank → hidden everywhere.
**Access:** paid plans only (`isModelAllowedForPlan`: free plan → free models only; free users fall back to `openrouter/free`).
**Endpoint:** international OpenAI-compatible `https://api.minimax.io/v1` (override via `MINIMAX_BASE_URL`). `api.minimaxi.com` / `api.minimaxi.chat` are the China-region hosts.

---

## 3. Adding a new chat model

Append one entry to `HOUSE_MODELS` in `house-models.ts` — nothing else changes:

```ts
{
  id: "rantai/<name>",
  name: "RantAI <Name>",
  provider: "RantAI",
  description: "User-facing copy — must NOT mention the upstream vendor.",
  contextWindow: 1_000_000,
  pricing: { input: 0.6, output: 2.4 }, // synthetic credit price ($/1M)
  capabilities: { vision: true, functionCalling: true, streaming: true },
  backendModel: "MiniMax-M3",           // exact upstream API id, server-only
}
```

Media models (image/video/voice/music) are **not** drop-in — see §6.

---

## 4. Economics ("untung")

Constants (`plans.ts`): `1 credit = $0.001` of cost · sold at **Rp 25/credit** (≈ $0.00159) · ~2% Midtrans fee · FX Rp 15,700/USD.

- **Markup:** you charge ~**1.56×** provider cost → gross margin on consumed credits ≈ **36%** at 100% utilization, **~75–85%** at typical 20–30% utilization (unused credits cost nothing).
- **Profit rule (pay-as-you-go upstream):** `synthetic_price > real_price × 0.64`. Below that you lose money per token.
- **On a flat MiniMax subscription** (marginal cost ≈ 0): any synthetic price is ~pure margin **up to the plan's rate/concurrency ceiling** — so the cheap `0.08–0.10` inputs are fine.
- ⚠️ The shipped Nano/Swift prices (`0.08/0.30`, `0.10/0.40`) are **below** MiniMax PAYG cost (~$0.25–0.30 / $1.00–1.20). They are profitable **only on a flat plan**. If you move to MiniMax pay-per-token, raise them toward pass-through (Swift `0.25/1.00`, Prime already at pass-through `0.60/2.40`).

---

## 5. Capacity & MiniMax plan-upgrade prediction

The binding limit is MiniMax's **5-hour window + concurrency**, not cost. Personal coding plans (M2.7 quota / concurrency):

| MiniMax plan | M2.7 calls/5hr | concurrency | est. RantAI paid users supported* |
|---|---|---|---|
| Plus ($20) | 4,500 | 3–4 | ~150 (heavy) – ~1,100 (light); **central ~375** |
| Max ($50) | 15,000 | 4–5 | ~500 – ~3,700; **central ~1,250** |
| Ultra ($120) | 29,077 | 6–7 | ~970 – ~7,300; **central ~2,400** |

\* Assumes ~60 M2.7 calls / active user / 5-hr window and ~20% of users active in the peak window — replace with real telemetry. Upgrade at ~70% of capacity for headroom.

**Two cautions:** (1) MiniMax cost is a rounding error vs revenue, so upgrade *early* — the trigger is throttling, not cost. (2) Personal coding subscriptions are **not licensed for multi-tenant resale**; for scale, move to MiniMax's **API / committed-use contract** (then §4's PAYG pricing applies).

---

## 6. Full MiniMax catalog (research, June 2026)

Confidence: pricing is aggregator-sourced (medium) — confirm on `platform.minimax.io` before locking commercial numbers. M3's $0.30/$1.20 is a **50%-off promo** (regular $0.60/$2.40).

### Chat / text — drop-in (OpenAI-compatible, all support function calling)
| API id | $/1M in/out | context | notes |
|---|---|---|---|
| `MiniMax-M3` | 0.60 / 2.40 (promo 0.30/1.20) | 1M | flagship, native multimodal (image+video in) |
| `MiniMax-M2.7` | 0.25 / 1.00 | 205K | proven, concise |
| `MiniMax-M2.5` | ~0.15 / ~1.20 | 205K | cheapest, strong coding |
| `MiniMax-M2.1` / `MiniMax-M2` | ~0.25 / ~1.00 | 205K | older |
| `MiniMax-01` (Text-01) | ~0.20 / 1.10 | up to 4M | legacy |

### Media + embeddings — NOT drop-in (separate REST APIs, async, per-unit billing → Media Studio work)
| API id | price | type |
|---|---|---|
| `image-01` | ~$0.0035 / image | text→image, image→image |
| `hailuo-02` (Pro) | ~$0.01–0.03 / second | video, up to 1080p |
| `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo` | ~$0.04–0.10 / 1k chars | TTS, voice cloning, 40+ langs |
| `music-2.6` (also 2.0/1.5/cover) | ~$0.035 / generation | songs up to 4 min |
| `embo-01` | unconfirmed | embeddings, 1536-dim |

Suggested future media branding: RantAI **Canvas** (image), **Motion** (video), **Voice** (TTS), **Score** (music).

---

## 7. Verification

```bash
cd apps/cloud
bun test src/lib/house-models.test.ts src/lib/model-pricing.test.ts src/lib/model-policy.test.ts
# models picker (server running with MINIMAX_API_KEY set):
curl -sS -b /tmp/cj.txt http://localhost:3001/api/dashboard/models \
  | python3 -c "import sys,json;[print(m['id'],'|',m['name'],'|',m['pricingOutput'],'|','locked' if m['locked'] else 'unlocked') for m in json.load(sys.stdin) if m['id'].startswith('rantai/')]"
```
Expected: tests green; three lines — `rantai/nano … 0.3`, `rantai/swift … 0.4`, `rantai/prime … 2.4` (unlocked on a paid plan).

`house-models.test.ts` includes a **white-label guard** that fails if "minimax"/"hailuo" ever appears in a user-facing field.

> NOTE: the earlier session verified the Swift path end-to-end (models API + stream + tests). The Nano/Prime run-verification was pending a transient platform outage at write time — run the block above to confirm green.

---

## 8. Caveats
- **White-label:** never surface the upstream vendor in UI/copy/model ids. Backend ids (`MiniMax-*`) are server-only.
- **Data residency:** MiniMax is China-origin. Accepted "fine for all paid traffic" for now; revisit for EU/enterprise.
- **Legacy dev seam:** `AI_PROVIDER_MODE=minimax` (global, prod-blocked, pins all traffic to one model) still exists in `provider.ts` — house models are the production path, not that.

**Sources:** OpenRouter (minimax-m2.7, minimax-m3), platform.minimax.io API docs, MiniMax-M2.7 tool-calling guide, pricepertoken, Segmind, Replicate, fal.ai, felloai.
