# Fraud Detection — Complete Implementation Plan

> Blueprint implementasi end-to-end fraud detection system untuk demo ke client asuransi.
> Menggabungkan workflow engine (RantAI-Agents) + customer portal (HorizonLife-Demo).

---

## Daftar Isi

1. [Gambaran Besar](#1-gambaran-besar)
2. [Alur Demo End-to-End](#2-alur-demo-end-to-end)
3. [Komponen yang Dibangun](#3-komponen-yang-dibangun)
4. [HorizonLife-Demo: Portal Customer](#4-horizonlife-demo-portal-customer)
5. [Staff Dashboard (di HorizonLife-Demo)](#5-staff-dashboard-di-horizonlife-demo)
6. [Workflow Fraud Detection](#6-workflow-fraud-detection)
7. [Knowledge Base](#7-knowledge-base)
8. [Seed Data (Data Demo)](#8-seed-data-data-demo)
9. [Integrasi Antar Sistem](#9-integrasi-antar-sistem)
10. [Urutan Implementasi](#10-urutan-implementasi)
    - Fase 1–8: Selesai
    - [Fase 9: OCR Document Verification](#fase-9-ocr-document-verification) ⚠️ HAMPIR SELESAI (2 bug blocking — lihat §9.8)
    - [Fase 10: Fitur Lanjutan](#fase-10-fitur-lanjutan-opsional)

---

## 1. Gambaran Besar

### Dua Aplikasi, Tiga Peran

```
┌──────────────────────────────┐          ┌──────────────────────────────┐
│    HorizonLife-Demo           │          │    RantAI-Agents              │
│    (Portal + Staff Dashboard) │          │    (AI/Workflow Platform)      │
├──────────────────────────────┤          ├──────────────────────────────┤
│                               │          │                               │
│  Customer (/portal):          │          │  Workflow API (generic):       │
│  • Pilih profil demo          │          │  • POST /api/workflows/{id}/run│
│  • Ajukan klaim               │          │  • GET /api/workflows/discover │
│  • Upload dokumen             │ Workflow │  • Visual canvas editor        │
│  • Lihat status klaim         │  API +   │  • Template management         │
│  • Chat dengan CS             │  x-api-  │  • Execution monitoring        │
│                               │  key     │                               │
│  Staff (/staff):              │  ─────►  │  RAG / Knowledge Base:         │
│  • Login staff                │          │  • Fraud patterns              │
│  • Lihat klaim masuk          │          │  • Policy rules                │
│  • Trigger analisis fraud     │          │  • Medical benchmarks          │
│  • Lihat hasil + skor         │          │                               │
│  • Approve / Reject           │          │  Stack: Next.js 16 + Socket.io │
│  • Chat AI investigasi        │          │  DB: PostgreSQL + SurrealDB    │
│                               │          │  Storage: RustFS (shared)      │
│  Own DB (PostgreSQL):         │          │                               │
│  • Customer (merged +NIK,    │          │  ❌ TIDAK ada data insurance    │
│    gender, DOB)               │          │  ❌ TIDAK ada claims API        │
│  • Policy (merged +limit)    │          │  ❌ TIDAK ada rule engine       │
│  • Provider (baru)           │          │                               │
│  • Claim (baru)              │          │  ✅ Pure workflow service       │
│  • Rule engine (local)        │          │  ✅ Generic, reusable          │
│                               │          │  ✅ Shared RustFS (namespaced) │
│  Stack: Next.js 16            │          │                               │
│  UI: shadcn/ui, Tailwind v4   │          │                               │
└──────────────────────────────┘          └──────────────────────────────┘
                        │                           │
                        └──────── RustFS ───────────┘
                              rantai-files bucket
                              horizonlife/claims/*  ← dokumen klaim
                              documents/*           ← knowledge base RantAI
```

> **Catatan arsitektur (Updated Fase 9 — Storage)**:
> - Model `Customer` dan `Policy` yang sudah ada di HorizonLife **di-extend** dengan field fraud detection (NIK, gender, DOB, annualLimit, remainingLimit). Bukan model terpisah.
> - Model baru: `Provider` (RS/klinik) dan `Claim` (klaim + hasil analisis).
> - Rule engine (8 rules deterministik) jalan **lokal** di HorizonLife — pure function, 0 DB dependency ke RantAI.
> - RantAI-Agents = **"tukang jasa" murni** — hanya menyediakan workflow execution + shared infrastructure.
> - HorizonLife hanya butuh 2 workflow API call: fraud detection (STANDARD) + investigation (CHATFLOW).
> - **Storage**: HorizonLife menggunakan RustFS yang sama dengan RantAI-Agents, namespaced di `horizonlife/claims/*`. Ini valid karena HorizonLife adalah **full client** RantAI (chatbot, live agent, workflow) — bukan sekadar API consumer. Kalau HorizonLife hanya pakai workflow API tanpa infrastruktur RantAI lainnya, storage sebaiknya terpisah.

### Bagaimana Klaim Bekerja di Dunia Nyata

| Jalur | Siapa Submit | Cara | Dalam Sistem Kita |
|-------|-------------|------|-------------------|
| **Cashless** | Rumah Sakit | RS kirim tagihan via sistem | Webhook trigger (fase lanjut) |
| **Reimbursement** | Customer sendiri | Upload foto kuitansi + surat dokter | Form di HorizonLife-Demo |
| **Asuransi Jiwa** | Ahli waris | Kirim surat kematian + dokumen | Form di HorizonLife-Demo |

Untuk MVP/demo, fokus ke **reimbursement** — customer submit via form.

---

## 2. Alur Demo End-to-End

Demo dirancang dalam 5 act agar client asuransi melihat sistem berjalan dari ujung ke ujung:

### Act 1: Customer Submit Klaim (HorizonLife-Demo)

Presenter: *"Ini portal yang customer Anda gunakan"*

```
Customer pilih profil demo (Budi/Siti/Rudi/Dewi)
  → Isi form klaim multi-step:
    Step 1: Jenis klaim + nomor polis (auto-filled dari profil)
    Step 2: Detail diagnosa, RS, tanggal layanan
    Step 3: Upload dokumen (kuitansi, laporan medis)
    Step 4: Review & submit
  → "Klaim berhasil dikirim! ID: CLM-2026-001234"
```

### Act 2: Klaim Masuk ke Dashboard Staff (HorizonLife-Demo)

Presenter: *"Sekarang kita pindah ke sisi CS/investigator Anda"*

```
Dashboard menampilkan daftar klaim masuk:
  🔴 CLM-2026-001234 | Budi Santoso | Rp 18.500.000 | BARU
  ✅ CLM-2026-001233 | Andi Wijaya  | Rp 600.000     | AUTO-APPROVED

CS klik "Analisis" → workflow fraud detection berjalan
```

### Act 3: Analisis Real-Time

Presenter: *"Sistem sedang menganalisis secara otomatis"*

```
Progress bar real-time:
  ✅ Ekstraksi Dokumen .............. 2.1s
  ✅ Validasi Polis ................. 1.3s
  ⏳ Analisis Paralel:
     ✅ Rule Engine ................ 0.5s
     ⏳ AI Narrative Analysis ...... berjalan...
     ✅ Pattern Analysis ........... 3.2s
     ✅ Document Verification ....... 4.7s
  ⬜ Scoring
  ⬜ Keputusan
```

### Act 4: Hasil Analisis + Keputusan CS

```
Risk Score: 67/100 ⚠️ MEDIUM

Breakdown:
  Rule Engine (35%):      55/100  ██████
  AI Narrative (20%):     45/100  █████
  Pattern Match (30%):    85/100  █████████
  Doc Verification (15%): 70/100  ███████

Temuan Dokumen:
  ✓ Jumlah cocok
  ✗ Tanggal di kuitansi berbeda dari tanggal yang diklaim
  ✗ Nama provider sedikit berbeda

Temuan Lain:
  • [HIGH] Provider ini punya 12 klaim serupa dalam 3 bulan
  • [MEDIUM] Biaya 40% di atas rata-rata Jakarta

  [✅ Approve] [❌ Reject] [🔍 Investigasi]
```

### Act 5: Chat AI Investigasi (Paling "Wah")

Presenter: *"CS bisa tanya langsung ke AI soal klaim ini"*

```
CS: "Kenapa pattern score tinggi?"
AI: "Provider RS Medika Jakarta memiliki 12 klaim pneumonia
     dalam 3 bulan. Rata-rata industri: 3-4 klaim/bulan.
     2 klaim sebelumnya sudah di-flag sebagai fraud."

CS: "Ada riwayat klaim dari Budi Santoso?"
AI: "4 klaim dalam 2 tahun, total Rp 57.8 juta.
     Tidak ada pola mencurigakan dari sisi peserta."
```

---

## 3. Komponen yang Dibangun

| No | Komponen | Lokasi | Deskripsi |
|---|---|---|---|
| 1 | Halaman pilih profil demo | HorizonLife-Demo | Pilih 1 dari 4 customer demo |
| 2 | Form submit klaim (multi-step) | HorizonLife-Demo | Full page form + upload dokumen |
| 3 | Halaman status klaim | HorizonLife-Demo | Customer lihat progress klaim |
| 4 | Staff login | HorizonLife-Demo | Login staff untuk akses dashboard |
| 5 | Halaman daftar klaim (staff) | HorizonLife-Demo | CS lihat semua klaim masuk |
| 6 | Halaman detail + hasil analisis | HorizonLife-Demo | Skor, temuan, tombol approve/reject |
| 7 | Claims API + service key | RantAI-Agents | Backend API untuk CRUD klaim |
| 8 | Workflow fraud detection | RantAI-Agents | Engine analisis otomatis (via Public API) |
| 9 | Chatflow investigasi | RantAI-Agents | CS tanya-jawab AI soal klaim (via Workflow API) |
| 10 | Knowledge base (3 KB) | RantAI-Agents | Aturan polis, pola fraud, benchmark |
| 11 | Seed data | RantAI-Agents | 4 customer demo + history + provider |
| 12 | Staff proxy API | HorizonLife-Demo | Proxy routes ke RantAI-Agents + API key injection |

---

## 4. HorizonLife-Demo: Portal Customer

### Status Saat Ini
- Landing page dengan 3 produk asuransi (life, health, home)
- Chat widget embed dari RantAI-Agents (sudah ada)
- Tidak ada login, tidak ada halaman customer

### Yang Perlu Ditambahkan

#### 4.1 Halaman Pilih Profil Demo

**Route:** `/demo` atau `/claim` (entry point)

Tidak perlu login beneran — cukup pilih profil customer:

```
┌─────────────────────────────────────────────────────┐
│  HorizonLife Insurance — Demo                        │
│                                                       │
│  Pilih profil untuk demo:                            │
│                                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ 👤 Budi      │ │ 👤 Siti      │ │ 👤 Rudi      │  │
│  │ Santoso      │ │ Rahmawati   │ │ Hartono      │  │
│  │              │ │              │ │              │  │
│  │ Kesehatan    │ │ Kesehatan    │ │ Kesehatan    │  │
│  │ Premium      │ │ Standard     │ │ Basic        │  │
│  │ 2 thn aktif  │ │ 8 bln aktif  │ │ 6 bln aktif  │  │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                       │
│  ┌─────────────┐                                     │
│  │ 👤 Dewi      │                                    │
│  │ Kusuma       │                                    │
│  │              │                                    │
│  │ Asuransi     │                                    │
│  │ Jiwa         │                                    │
│  │ 3 bln aktif  │                                    │
│  └─────────────┘                                     │
└─────────────────────────────────────────────────────┘
```

Setelah pilih → simpan di localStorage/session → redirect ke dashboard customer.

#### 4.2 Dashboard Customer

**Route:** `/portal` (setelah pilih profil)

```
┌─────────────────────────────────────────────────────┐
│  HorizonLife — Selamat datang, Budi Santoso          │
│                                                       │
│  ┌──────────────────────────────────────────┐        │
│  │  Polis: POL-HK-00567                     │        │
│  │  Produk: Kesehatan Premium               │        │
│  │  Sisa Limit: Rp 320.000.000              │        │
│  │  Status: Aktif                            │        │
│  └──────────────────────────────────────────┘        │
│                                                       │
│  [📋 Ajukan Klaim]  [📊 Riwayat Klaim]              │
│                                                       │
│  Klaim Terbaru:                                      │
│  ┌──────────────────────────────────────────┐        │
│  │ CLM-2025-00156 | 10 Aug 2025             │        │
│  │ Patah tulang | Rp 45.000.000 | ✅ Approved │       │
│  ├──────────────────────────────────────────┤        │
│  │ CLM-2025-00034 | 5 Jan 2025              │        │
│  │ Rawat jalan | Rp 350.000 | ✅ Approved    │       │
│  └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

#### 4.3 Form Submit Klaim (Multi-Step)

**Route:** `/portal/claims/new`

**Step 1 — Jenis & Polis** (auto-filled dari profil):
- Jenis klaim: Kesehatan / Jiwa (radio)
- Nomor polis (read-only, dari profil)
- Nama tertanggung (read-only)

**Step 2 — Detail Layanan:**
- Nama RS / klinik (text input)
- Tanggal layanan (date picker)
- Diagnosa / keluhan (text area)
- Prosedur / tindakan (dynamic list — bisa tambah row):
  - Deskripsi + jumlah biaya per item
- Total biaya (auto-calculated)

**Step 3 — Upload Dokumen:**
- Kuitansi pembayaran (wajib)
- Surat diagnosa dokter (wajib)
- Resume medis (opsional)
- Resep obat (opsional)
- Dokumen lain (opsional)

**Step 4 — Review & Submit:**
- Ringkasan semua data
- Tombol "Submit Klaim"
- Setelah submit → redirect ke halaman status

#### 4.4 Halaman Status Klaim

**Route:** `/portal/claims/[id]`

```
┌──────────────────────────────────────────┐
│  Status Klaim: CLM-2026-001234           │
│                                           │
│  ● Dikirim ─── ● Dianalisis ─── ○ Selesai│
│                                           │
│  Status: Sedang Dianalisis               │
│  Diajukan: 18 Feb 2026, 14:30           │
│  Terakhir update: 18 Feb 2026, 14:32    │
│                                           │
│  Catatan:                                │
│  "Klaim Anda sedang dalam proses review" │
└──────────────────────────────────────────┘
```

---

## 5. Staff Dashboard (di HorizonLife-Demo)

> **PINDAH**: Claims dashboard **tidak lagi di RantAI-Agents**.
> Semua UI claims management sekarang di HorizonLife-Demo route `/staff/*`.
> RantAI-Agents hanya menyediakan backend API + workflow.

### Arsitektur (Updated Fase 8)

```
HorizonLife-Demo                          RantAI-Agents
/staff/claims (UI)                        /api/workflows/* (Workflow API only)
  │                                         │
  ├── /api/staff/claims ──────────────────► Own DB (direct query)
  ├── /api/staff/claims/[id] ─────────────► Own DB (direct query)
  ├── /api/staff/claims/[id]/analyze ─────► Own DB + local rule engine
  │                                         + POST /api/workflows/{id}/run (workflow API)
  ├── /api/staff/claims/[id]/decide ──────► Own DB (direct update)
  └── /api/staff/claims/[id]/investigate ─► POST /api/workflows/{id}/run (chatflow API)
```

> Data klaim disimpan di DB HorizonLife sendiri. RantAI-Agents hanya dipanggil untuk workflow execution (fraud detection + investigation chatflow).

### Auth: Simple Demo Staff Login

```
Route: /staff/login
Credentials: admin@horizonlife.com / demo123
Session: Cookie-based (hlf_staff_session)
```

### Staff Dashboard Routes

| Route | Deskripsi |
|-------|-----------|
| `/staff/login` | Halaman login staff |
| `/staff/claims` | Daftar semua klaim (filter, search, sort) |
| `/staff/claims/[id]` | Detail klaim (3 tab: Data, Analisis, Investigasi) |

### Status Klaim dan Warna

| Status | Badge | Deskripsi |
|---|---|---|
| `PENDING` | biru | Baru masuk, belum dianalisis |
| `ANALYZING` | kuning/amber | Workflow sedang berjalan |
| `AUTO_APPROVED` | hijau | Score LOW, otomatis disetujui |
| `REVIEW` | kuning | Score MEDIUM, perlu review CS |
| `ESCALATED` | merah | Score HIGH, di-freeze |
| `APPROVED` | hijau | Disetujui (manual oleh CS) |
| `REJECTED` | merah | Ditolak |
| `INVESTIGATING` | ungu | Sedang diinvestigasi |

### Detail Klaim — 3 Tab

**Tab 1 — Data Klaim**: Info peserta, polis, provider, diagnosis, prosedur + biaya, dokumen (dengan tombol Lihat/Unduh via presigned URL), riwayat klaim

**Tab 2 — Hasil Analisis**: Risk score bar, breakdown 4 komponen (Rule Engine 35%, AI Narrative 20%, Pattern 30%, Doc Verification 15%), verifikasi dokumen (amount/provider/date match), fraud flags, tombol Approve/Reject/Investigasi

**Tab 3 — Investigasi AI**: Chat streaming dengan chatflow workflow. AI punya akses ke data klaim, riwayat, provider profile, dan knowledge base fraud patterns

---

## 6. Workflow Fraud Detection

Detail lengkap ada di [FRAUD-DETECTION-WORKFLOW.md](FRAUD-DETECTION-WORKFLOW.md).

Ringkasan node flow:

```
MANUAL_TRIGGER (klaim masuk)
  → LLM: Ekstraksi dokumen
  → RAG_SEARCH: Validasi polis
  → PARALLEL:
      ├── CODE: Rule engine (8 aturan)
      ├── LLM: Analisis naratif
      ├── AGENT: Analisis pola (RAG + history)
      └── CONDITION: Ada dokumen?
            YES → TOOL: ocr_document (fetch dari RustFS via s3_key)
                  LLM: verifikasi dokumen vs klaim
                  → { doc_score, doc_findings, amount_match, ... }
            NO  → { doc_score: 50, has_documents: false }
  → MERGE: Gabungkan hasil
  → TRANSFORM: Hitung risk score (weighted average)
  → SWITCH: Routing berdasarkan level
      ├── LOW (0-29): Auto-approve
      ├── MEDIUM (30-69): Antrian review CS
      └── HIGH (70-100): Eskalasi + freeze
  → DATABASE: Simpan audit log
```

### Chatflow Mode (untuk Tab Investigasi)

```
MANUAL_TRIGGER (claim_id sebagai input)
  → AGENT (dengan tools: RAG search, claim history lookup, provider lookup)
  → STREAM_OUTPUT (CS tanya-jawab real-time)
```

---

## 7. Knowledge Base

3 knowledge base perlu dibuat dan diisi:

### 7.1 KB: Aturan Polis (`kb-policy-rules`)

Dokumen berisi:
- Produk asuransi (coverage, limit, premi, exclusion) per tier
- Daftar provider jaringan (in-network / out-network)
- Waiting period per produk
- ICD-10 codes yang di-cover per produk
- Range biaya wajar per prosedur per kota

### 7.2 KB: Pola Fraud (`kb-fraud-patterns`)

Dokumen berisi:
- 10 pola fraud asuransi kesehatan (HF-01 s/d HF-10)
- 7 pola fraud asuransi jiwa (LF-01 s/d LF-07)
- Indikator per pola (apa yang harus dicari)
- Contoh kasus sebelumnya (fiktif, untuk demo)

### 7.3 KB: Benchmark Biaya Medis (`kb-medical-benchmark`)

Dokumen berisi:
- Rata-rata biaya per diagnosa per kota
- Rata-rata frekuensi klaim normal
- Threshold yang dipakai rule engine
- Statistik provider (rata-rata klaim per bulan per tipe)

---

## 8. Seed Data (Data Demo)

Semua data di-seed ke database saat setup agar demo langsung bisa berjalan.

### 8.1 Customer Profiles (4 orang)

#### Budi Santoso — Customer Normal ✅
```
Polis: POL-HK-00567
Produk: Kesehatan Premium
Mulai: 1 Maret 2024 (2 tahun aktif)
Limit: Rp 500.000.000 / tahun
Sisa: Rp 320.000.000
Gender: Laki-laki
DOB: 1985-03-15

Riwayat (4 klaim, 2 tahun, semua APPROVED):
  CLM-2024-00012 | 15 Mar 2024 | J06.9 Flu           | Rp 450.000     | RS Mitra Keluarga
  CLM-2024-00089 | 20 Jul 2024 | A97.0 Demam berdarah | Rp 12.000.000  | RS Medika Jakarta
  CLM-2025-00034 | 5 Jan 2025  | J06.9 Rawat jalan    | Rp 350.000     | Klinik Pratama
  CLM-2025-00156 | 10 Aug 2025 | S52.5 Patah tulang   | Rp 45.000.000  | RS Medika Jakarta

Total klaim: Rp 57.800.000 (wajar)
Expected score klaim baru: < 30 (LOW → AUTO APPROVE)

Demo dokumen: kuitansi_budi.pdf + surat_dokter_budi.pdf
  → Semua data cocok: jumlah Rp 45.000.000 ✓, tanggal 10 Agt 2025 ✓, provider RS Medika Jakarta ✓
```

#### Siti Rahmawati — Agak Mencurigakan ⚠️
```
Polis: POL-HK-00890
Produk: Kesehatan Standard
Mulai: 1 Juni 2025 (8 bulan aktif)
Limit: Rp 200.000.000 / tahun
Sisa: Rp 98.000.000
Gender: Perempuan
DOB: 1988-06-20

Riwayat (6 klaim, 8 bulan — frekuensi tinggi):
  CLM-2025-00201 | 5 Jul 2025  | M54.5 Nyeri punggung  | Rp 8.000.000  | Klinik Sehat Jaya
  CLM-2025-00245 | 20 Jul 2025 | M54.5 Fisioterapi     | Rp 12.000.000 | Klinik Sehat Jaya
  CLM-2025-00301 | 15 Aug 2025 | M54.5 Fisioterapi     | Rp 10.000.000 | Klinik Sehat Jaya
  CLM-2025-00356 | 5 Sep 2025  | M54.5 MRI + terapi    | Rp 22.000.000 | Klinik Sehat Jaya
  CLM-2025-00412 | 1 Oct 2025  | M54.5 Fisioterapi     | Rp 18.000.000 | Klinik Sehat Jaya
  CLM-2025-00478 | 20 Nov 2025 | M54.5 Rawat inap      | Rp 32.000.000 | Klinik Sehat Jaya

Total klaim: Rp 102.000.000 (tinggi, semua di provider yang sama)
Expected score klaim baru: 30-69 (MEDIUM → REVIEW)
Red flags: frekuensi tinggi, provider sama, diagnosis berulang

Demo dokumen: kuitansi_siti.pdf + surat_dokter_siti.pdf
  → Data cocok TAPI pola mencurigakan: kunjungan ke-5 dari 6, akumulasi 70jt, watchlist provider
```

#### Rudi Hartono — Fraud 🔴
```
Polis: POL-HK-00999
Produk: Kesehatan Basic
Mulai: 1 Agustus 2025 (6 bulan aktif)
Limit: Rp 100.000.000 / tahun
Sisa: Rp 15.000.000
Gender: Laki-laki
DOB: 1975-12-10

Riwayat (7 klaim, 3 bulan — sangat mencurigakan):
  CLM-2025-00534 | 5 Sep 2025  | M54.5 Nyeri punggung  | Rp 15.000.000 | Klinik Sehat Jaya ⚠️
  CLM-2025-00567 | 12 Sep 2025 | M79.3 Fisioterapi     | Rp 8.000.000  | Klinik Sehat Jaya ⚠️
  CLM-2025-00612 | 28 Sep 2025 | M54.5 Fisioterapi     | Rp 12.000.000 | RS Watchlist ⚠️
  CLM-2025-00678 | 10 Oct 2025 | M54.5 Rawat inap      | Rp 22.000.000 | RS Watchlist ⚠️
  CLM-2025-00723 | 25 Oct 2025 | M79.3 Fisioterapi     | Rp 18.000.000 | Klinik Sehat Jaya ⚠️
  CLM-2025-00789 | 8 Nov 2025  | M54.5 Rawat inap      | Rp 35.000.000 | RS Watchlist ⚠️
  CLM-2025-00845 | 20 Nov 2025 | G89.4 MRI + fisio     | Rp 25.000.000 | Klinik Sehat Jaya ⚠️

Total klaim: Rp 135.000.000 (melebihi limit — sisa cuma 15jt!)
Expected score klaim baru: > 70 (HIGH → ESKALASI)
Red flags: polis baru, frekuensi gila, 2 provider watchlist, hampir habis limit

Demo dokumen: kuitansi_rudi.pdf + surat_dokter_rudi.pdf
  → INKONSISTENSI DISENGAJA untuk demonstrasi OCR:
    ✗ Jumlah di kuitansi: Rp 28.000.000 (klaim: Rp 35.000.000) — selisih 7 juta!
    ✗ Tanggal di kuitansi: 15 Oktober 2025 (klaim: 8 November 2025) — date mismatch!
    ✗ Spesialisasi dokter: Sp.An (anestesiologi) untuk kasus nyeri punggung (seharusnya Sp.OT/Sp.KFR)
  → OCR verification: amount_match: false, date_match: false
```

#### Dewi Kusuma — Klaim Asuransi Jiwa 💀
```
Polis: POL-AJ-00123
Produk: Asuransi Jiwa
Mulai: 1 November 2025 (3 bulan aktif!)
Uang pertanggungan: Rp 2.000.000.000
Gender: Perempuan
DOB: 1990-04-25

Riwayat: Tidak ada klaim sebelumnya
Expected score: > 80 (CRITICAL — LF-06: polis < 24 bulan + klaim > 500jt)
Red flags: polis sangat baru, nilai sangat besar, perlu investigasi mendalam

Demo dokumen: kuitansi_dewi.pdf + surat_dokter_dewi.pdf
  → Klaim cacat tetap total (G82.5 Tetraplegia) Rp 625.000.000
  → Polis baru Nov 2025, klaim Des 2025 (1 bulan) — LF-06 terpicu
  → Dokumen valid, tapi rule engine otomatis flag HIGH
```

### 8.2 Provider Data

| Provider | ID | Tipe | Kota | Jaringan | Watchlist | Klaim/bulan |
|---|---|---|---|---|---|---|
| RS Mitra Keluarga | PRV-MK | Rumah Sakit | Jakarta | ✅ Ya | ❌ Tidak | 38 (normal) |
| RS Medika Jakarta | PRV-MDK | Rumah Sakit | Jakarta | ✅ Ya | ❌ Tidak | 42 (normal) |
| Klinik Pratama | PRV-KP | Klinik | Jakarta | ✅ Ya | ❌ Tidak | 15 (normal) |
| Klinik Sehat Jaya | PRV-KSJ | Klinik | Bekasi | ✅ Ya | ⚠️ YA | 89 fisio (TINGGI!) |
| RS Watchlist | PRV-WL | Rumah Sakit | Tangerang | ✅ Ya | ⚠️ YA | 67 (3 fraud terkonfirmasi) |

### 8.3 Benchmark Biaya (Jakarta)

| Diagnosa | Biaya Rata-rata | Range Wajar |
|---|---|---|
| Flu / ISPA (rawat jalan) | Rp 400.000 | Rp 200.000 - 800.000 |
| Demam berdarah (rawat inap) | Rp 12.000.000 | Rp 8.000.000 - 18.000.000 |
| Pneumonia (rawat inap 5 hari) | Rp 12.500.000 | Rp 8.000.000 - 18.000.000 |
| Patah tulang (rawat inap + operasi) | Rp 40.000.000 | Rp 25.000.000 - 60.000.000 |
| Fisioterapi (per sesi) | Rp 300.000 | Rp 150.000 - 500.000 |
| MRI | Rp 4.000.000 | Rp 3.000.000 - 6.000.000 |
| Operasi kista (laparoskopi) | Rp 35.000.000 | Rp 25.000.000 - 50.000.000 |

### 8.4 Demo PDF Documents

File demo tersedia di `HorizonLife-Demo/public/demo-docs/`. Generator script: `scripts/generate-demo-pdfs.ts`.

```bash
# Generate ulang semua 8 PDF
pnpm tsx scripts/generate-demo-pdfs.ts
```

| File | Customer | Jenis | Fraud Signal |
|------|----------|-------|--------------|
| `kuitansi_budi.pdf` | Budi Santoso | Kuitansi RS Medika Jakarta | Tidak ada — semua cocok |
| `surat_dokter_budi.pdf` | Budi Santoso | Surat Dokter (S52.5, ORIF) | Tidak ada |
| `kuitansi_siti.pdf` | Siti Rahmawati | Kuitansi Klinik Sehat Jaya | Isi valid, tapi dari watchlist provider |
| `surat_dokter_siti.pdf` | Siti Rahmawati | Surat Dokter (M54.5, fisioterapi) | Akumulasi 70jt dicantumkan |
| `kuitansi_rudi.pdf` | Rudi Hartono | Kuitansi RS Watchlist Medika | ⚠️ Rp 28jt (klaim: 35jt) + tanggal 15 Okt (klaim: 8 Nov) |
| `surat_dokter_rudi.pdf` | Rudi Hartono | Surat Dokter (M54.5, Sp.An) | ⚠️ Jumlah sama 28jt + tanggal sama 15 Okt + Sp.An untuk nyeri punggung |
| `kuitansi_dewi.pdf` | Dewi Kusuma | Kuitansi RS Premier Bintaro | Rp 625jt valid, LF-06 dari rule engine |
| `surat_dokter_dewi.pdf` | Dewi Kusuma | Surat Keterangan Cacat Tetap Total | G82.5, polis baru Nov 2025 dicantumkan |

---

## 9. Integrasi Antar Sistem (Updated Fase 8)

### Arsitektur API

Setelah migrasi Fase 8, RantAI-Agents hanya menyediakan **Workflow API** — tidak ada Claims API lagi:

```
HorizonLife-Demo                          RantAI-Agents

Customer Portal:                          (semua direct ke own DB)
  /api/portal/claims ──────► Own DB
  /api/portal/claims/[id] ──► Own DB
  /api/portal/lookup ────────► Own DB

Staff Dashboard:
  /api/staff/claims ─────────► Own DB
  /api/staff/claims/[id] ────► Own DB
  /api/staff/claims/[id]/decide ► Own DB

  /api/staff/claims/[id]/analyze ──────►  Own DB (rule engine lokal)
                                          + POST /api/workflows/{id}/run (fraud detection)

  /api/staff/claims/[id]/investigate ──►  POST /api/workflows/{id}/run (investigation chatflow)

Workflow Discovery:
  ──────────────────────────────────────►  GET /api/workflows/discover?name=fraud&mode=STANDARD

Storage (shared):
  /api/portal/claims/upload ────────────► RustFS (horizonlife/claims/{id}/file)
  /api/staff/claims/[id]/documents ─────► RustFS (presigned URL / proxy)
```

### API Keys (di .env)

```bash
# RantAI-Agents .env
# (tidak perlu CLAIMS_SERVICE_API_KEY lagi)

# HorizonLife-Demo .env
RANTAI_API_URL="http://localhost:3000"
FRAUD_DETECTION_WORKFLOW_API_KEY="wf_fraud_detect_demo_key_2026"
FRAUD_INVESTIGATION_WORKFLOW_API_KEY="wf_fraud_investigate_demo_key_2026"

# S3 / RustFS (shared dengan RantAI-Agents — copy dari RantAI-Agents .env)
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_BUCKET="rantai-files"
S3_REGION="us-east-1"
```

### RantAI-Agents API Endpoints (yang dipakai HorizonLife)

| Method | Path | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/workflows/discover` | workflow x-api-key | Cari workflow by name/mode |
| `POST` | `/api/workflows/{id}/run` | workflow x-api-key | Execute workflow (STANDARD/CHATFLOW) |

> Hanya 2 endpoint. RantAI-Agents = pure workflow service.

### HorizonLife-Demo API Routes (Direct DB)

| Method | Path | Data Source | Auth |
|---|---|---|---|
| `GET` | `/api/portal/lookup` | Own DB | customerId |
| `POST` | `/api/portal/claims` | Own DB | customerId |
| `GET` | `/api/portal/claims` | Own DB | customerId |
| `GET` | `/api/portal/claims/[id]` | Own DB | - |
| `POST` | `/api/portal/claims/upload` | RustFS upload | - |
| `GET` | `/api/staff/claims` | Own DB | Staff cookie |
| `GET` | `/api/staff/claims/[id]` | Own DB | Staff cookie |
| `POST` | `/api/staff/claims/[id]/analyze` | Own DB + Workflow API | Staff cookie |
| `POST` | `/api/staff/claims/[id]/decide` | Own DB | Staff cookie |
| `GET` | `/api/staff/claims/[id]/documents/[index]` | RustFS (presigned URL) | Staff cookie |

---

## 10. Urutan Implementasi

### Fase 1: Database & Seed Data ✅ SELESAI
1. Model Prisma: Claim, InsuranceCustomer, InsurancePolicy, Provider
2. Seed: 4 customer + riwayat klaim + 5 provider
3. Knowledge base: 3 dokumen (policy-rules, fraud-patterns, medical-benchmark)

### Fase 2: API Klaim (RantAI-Agents) ✅ SELESAI
1. Public endpoints: submit, lookup, detail, list per customer
2. Dashboard endpoints: list all, analyze, decide, update

### Fase 3: Dashboard UI Klaim (RantAI-Agents) ✅ SELESAI → DIPINDAH ke HorizonLife
1. `/dashboard/claims` — daftar klaim
2. `/dashboard/claims/[id]` — detail + 3 tab (data, analisis, investigasi)
3. Hook: `use-claims`

> **Catatan**: UI sudah dipindah ke HorizonLife-Demo (`/staff/*`). Claims dihapus dari sidebar RantAI-Agents (Fase 7.4a).

### Fase 4: Workflow Fraud Detection ✅ SELESAI
1. Template: Fraud Detection (STANDARD) — 10 rules + 2 LLM + RAG
2. Template: Fraud Investigation (CHATFLOW) — 3 RAG + streaming
3. Rule engine: 10 aturan deterministik (termasuk history-based)
4. Scoring: weighted average (rule 40%, narrative 25%, pattern 35%)
5. PARALLEL/MERGE synchronization fix

### Fase 5: HorizonLife-Demo Portal ✅ SELESAI
1. Halaman pilih profil demo (`/demo`)
2. Dashboard customer (`/portal`)
3. Form submit klaim multi-step (`/portal/claims/new`)
4. Status klaim (`/portal/claims/[id]`)
5. API proxy ke RantAI-Agents

### Fase 6: Integrasi & Polish ✅ SELESAI
1. KB group ID fix + RAG config
2. Workflow seeded as ACTIVE
3. Fraud scoring fixes (dual rule engine, MERGE race condition, LLM scoring guidance)

---

### Fase 7: Migrasi Claims Dashboard ke HorizonLife ✅ SELESAI

**Tujuan**: Pindahkan claims management UI dari RantAI-Agents ke HorizonLife-Demo. RantAI-Agents hanya jadi backend API + workflow platform.

> **Arsitektur**: Proxy/BFF pattern — HorizonLife proxy ke RantAI-Agents via `x-api-key`. Claims data tetap di DB RantAI-Agents.
> Claims dihapus dari sidebar RantAI-Agents (`app-sidebar.tsx`, `icon-rail.tsx`).

#### 7.1 RantAI-Agents: Service API Key ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `lib/claims-auth.ts` | BARU | Validasi `x-api-key` dari env `CLAIMS_SERVICE_API_KEY` |
| `lib/fraud-analysis.ts` | BARU | Extract `runRuleEngine()` + `tryWorkflowAnalysis()` dari analyze route |
| `app/api/claims/[id]/analyze/route.ts` | BARU | Public analyze endpoint (API key protected) |
| `app/api/claims/[id]/decide/route.ts` | BARU | Public decide endpoint (API key protected) |
| `app/api/claims/submit/route.ts` | EDIT | GET: jika x-api-key + no customerId → list ALL claims |
| `app/api/claims/[id]/route.ts` | EDIT | GET enriched + PUT handler (API key) |
| `app/api/dashboard/claims/[id]/analyze/route.ts` | EDIT | Import dari shared `lib/fraud-analysis.ts` |
| `prisma/seed.ts` | EDIT | Set `apiEnabled: true` + `apiKey` pada fraud workflows |
| `.env` / `.env.example` | EDIT | Tambah `CLAIMS_SERVICE_API_KEY` |

#### 7.2 HorizonLife-Demo: Staff Auth ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `lib/staff-auth.ts` | BARU | Demo credentials + cookie session validation |
| `lib/staff-context.tsx` | BARU | React context provider (pattern: `portal-context.tsx`) |
| `app/api/staff/login/route.ts` | BARU | POST: validate + set cookie |
| `app/api/staff/session/route.ts` | BARU | GET: session / DELETE: logout |

#### 7.3 HorizonLife-Demo: Staff Proxy API ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `app/api/staff/claims/route.ts` | BARU | GET → list all claims |
| `app/api/staff/claims/[id]/route.ts` | BARU | GET → detail, PUT → update |
| `app/api/staff/claims/[id]/analyze/route.ts` | BARU | POST → trigger fraud analysis |
| `app/api/staff/claims/[id]/decide/route.ts` | BARU | POST → approve/reject/investigate |
| `app/api/staff/claims/[id]/investigate/route.ts` | BARU | POST → chatflow workflow (streaming) |

#### 7.4 HorizonLife-Demo: Staff Dashboard UI ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `lib/staff-claim-types.ts` | BARU | ClaimItem, FraudFlag, status config |
| `hooks/use-staff-claims.ts` | BARU | Zustand hook untuk claims CRUD |
| `app/staff/login/page.tsx` | BARU | Login form (email/password) |
| `app/staff/layout.tsx` | BARU | Layout + StaffProvider + auth guard |
| `app/staff/claims/page.tsx` | BARU | Claims list (search, filter, sort) |
| `app/staff/claims/[id]/page.tsx` | BARU | Detail klaim (3 tabs) |
| `components/staff/staff-header.tsx` | BARU | Dashboard header |
| `components/staff/claim-card.tsx` | BARU | Claim summary card |
| `components/staff/claim-detail.tsx` | BARU | Tab: Data Klaim |
| `components/staff/analysis-result.tsx` | BARU | Tab: Analisis + decision buttons |
| `components/staff/risk-score-bar.tsx` | BARU | Score visualization |
| `components/staff/claim-investigation.tsx` | BARU | Tab: Investigation chat (streaming) |
| `components/staff/markdown-content.tsx` | BARU | Render AI response |
| `middleware.ts` | EDIT | Protect `/staff/*` routes |
| `.env` / `.env.example` | EDIT | API keys |

---

### Fase 8: Arsitektur Migration — RantAI Jadi Pure Workflow Service ✅ SELESAI

**Tujuan**: Pindahkan semua data insurance ke HorizonLife-Demo. RantAI-Agents menjadi "tukang jasa" murni — hanya menyediakan workflow execution via API.

**Temuan kunci**:
- Workflow engine TIDAK baca DB insurance — semua data di-pass sebagai input variables
- Rule engine = pure function, 0 DB calls, bisa copy 1:1
- Investigation route sudah pakai HTTP workflow API — pattern ini tetap

**Keputusan: Merge Models (bukan model terpisah)**

HorizonLife sudah punya `Customer` + `Policy`. Daripada buat `InsuranceCustomer` + `InsurancePolicy` terpisah, field fraud detection di-merge ke model existing:

| Existing | + Field baru | Hasil |
|---|---|---|
| `Customer` (email, passwordHash, firstName, lastName) | + `idNumber` (NIK), `gender`, `dateOfBirth` | Satu model untuk portal + fraud |
| `Policy` (policyNumber, productType, premiumAmount, ...) | + `annualLimit`, `remainingLimit` | Satu model untuk portal + fraud |
| *(tidak ada)* | `Provider` | Model baru (RS/klinik) |
| *(tidak ada)* | `Claim` | Model baru (klaim + hasil analisis) |

#### 8.1–8.10 (lengkap, semua ✅)

Semua sub-langkah Fase 8 selesai. Lihat commit history atau versi sebelumnya dokumen ini untuk detail per langkah.

**Catatan penting**:
- Docker: HorizonLife PostgreSQL port **5433** (bukan 5432) — hindari konflik dengan RantAI
- `FORCE_RESEED=true bun run db:seed` — hapus semua data + re-seed ulang
- Setelah Fase 8, RantAI-Agents = platform generic (seperti Flowise/n8n) — nol kode insurance-specific

---

### Fase 9: OCR Document Verification ⚠️ HAMPIR SELESAI
**Effort: Sedang | Prioritas: P1**

**Tujuan**: Customer mengupload dokumen klaim (kuitansi, surat dokter). Dokumen disimpan di RustFS yang dishare dengan RantAI-Agents. OCR berjalan di dalam workflow RantAI — RantAI fetch dokumen dari RustFS sendiri via s3Key, extract teks, LLM verifikasi kesesuaian dengan data klaim. Hasil verifikasi menjadi Branch ke-4 di fraud detection workflow.

---

#### Keputusan Arsitektur Storage

> **Konteks**: HorizonLife adalah **full client** RantAI — menggunakan chatbot widget, live agent, workflow, dan shared infrastructure. Dalam konteks ini, berbagi RustFS **valid dan direkomendasikan**.

**Pertimbangan yang digunakan untuk keputusan ini:**

| Skenario | Keputusan Storage |
|----------|-------------------|
| HorizonLife hanya pakai workflow API (tidak ada integrasi lain) | Storage terpisah (S3 sendiri) |
| HorizonLife sebagai full client RantAI (chatbot, live agent, workflow) | **Shared RustFS dengan namespace prefix** ← kasus kita |
| RantAI sebagai SaaS multi-tenant (banyak client berbeda) | Storage terpisah per tenant, wajib |

**Kenapa base64-in-PostgreSQL TIDAK dipilih untuk production:**
- 33% size overhead dari encoding base64
- PostgreSQL bukan object store — `SELECT *` menarik seluruh bytes tiap query
- Backup size explode (50 klaim × 5 dokumen × 5MB = 1.25GB)
- Connection pool cepat habis dengan payload besar

**Solusi yang diimplementasikan:**
```
Upload  → file → RustFS bucket "rantai-files"
                 key: horizonlife/claims/{nanoid}/{filename}
         → simpan hanya s3Key di Claim.documents (PostgreSQL)

OCR     → RantAI tool menerima s3_key
         → downloadFile(s3_key) dari RustFS (in-process, tidak lewat HTTP)
         → processDocumentOCR(buffer) in-memory
         → return ocr_text

Viewer  → GET /api/staff/claims/[id]/documents/[index]
         → ambil s3Key dari DB
         → getPresignedUrl(s3Key) → redirect 302 ke S3
         → browser ambil langsung dari S3 (server tidak proxy bytes)
```

---

#### Arsitektur Lengkap

```
HorizonLife-Demo                         RantAI Agents + RustFS
────────────────                         ──────────────────────
Step 3 form klaim:
  user pilih file
  → POST /api/portal/claims/upload
    → uploadToS3(buffer, key, mimeType)
    → return { s3Key, filename, mimeType, type, size }
  → simpan ke Claim.documents:
    [{ s3Key, filename, mimeType, type, size }]  ← bukan base64!

POST /api/staff/claims/[id]/analyze
  ambil Claim.documents dari DB (cuma s3Key)
  kirim ke workflow input:
  { ...claim_data, documents: [{ s3Key, mimeType, filename }] }
         ↓
  ──────────────────────────────────────▶  Fraud Detection Workflow
                                              Branch 4: Document Verification
                                                → OCR Tool (s3_key input):
                                                  downloadFile(s3Key) ← fetch dari RustFS
                                                  → processDocumentOCR(buffer)
                                                  → return ocr_text
                                                → LLM: verifikasi konten vs klaim
                                                → return doc_score + doc_findings
                                         ◀──────────────────────────────────────
  simpan doc_score ke Claim.analysisResult

Staff lihat dokumen:
  GET /api/staff/claims/[id]/documents/[index]
  → ambil s3Key dari DB
  → getPresignedUrl(s3Key, 3600)
  → 302 redirect → browser ambil langsung dari S3
```

---

#### 9.1 RantAI: OCR Builtin Tool ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `lib/tools/builtin/ocr.ts` | BARU | Tool `ocr_document`: terima `s3_key` + `mime_type`, `downloadFile(s3_key)` dari `lib/s3/index.ts`, jalankan `processDocumentOCR()`, return `{ text, page_count, provider, model, processing_ms }` |
| `lib/tools/builtin/index.ts` | EDIT | Import + registrasi `ocr_document` di `BUILTIN_TOOLS` |
| `lib/tools/seed.ts` | EDIT | Tambah icon emoji untuk `ocr_document` (📷) |

**Interface tool:**

```typescript
// Input
{
  s3_key: string,           // S3 key di RustFS, contoh: "horizonlife/claims/{id}/kuitansi.pdf"
  mime_type: string,        // "application/pdf" | "image/jpeg" | "image/png" | "image/heic"
  document_type?: string,   // "printed_text" | "handwritten" | "table" (opsional)
  filename?: string,        // untuk context di output (opsional)
}

// Output
{
  text: string,             // teks hasil OCR (combined jika multi-page)
  page_count: number,
  provider: string,         // "ollama" | "openrouter"
  model: string,
  processing_ms: number,
  success: boolean,
  error?: string,
}
```

**Cara kerja internal `ocr.ts`:**
1. `downloadFile(s3_key)` dari `lib/s3/index.ts` → Buffer (fetch dari RustFS in-process)
2. `processDocumentOCR(buffer, mimeType, { outputFormat: "markdown" })` dari `lib/ocr`
3. Return combined text
4. Buffer di-GC setelah selesai — tidak ada data yang tersisa di memori

---

#### 9.2 RantAI: Workflow Fraud Detection — Branch 4 ✅

Modifikasi di `lib/templates/workflow-templates.ts`:

```
MANUAL_TRIGGER
  → PARALLEL:
      ├── Branch 1: Narrative Analysis (LLM)        [existing]
      ├── Branch 2: Rule Engine (LLM)                [existing]
      ├── Branch 3: Pattern Analysis (LLM)           [existing]
      └── Branch 4: Document Verification (BARU)
            → CONDITION: ada dokumen? (input.documents?.length > 0)
                YES → TOOL: ocr_document (s3_key dari input.documents[0].s3Key)
                      LLM: verifikasi dokumen vs klaim data
                      TRANSFORM: parse JSON output
                      → { doc_score, doc_findings, amount_match, provider_match, date_match }
                NO  → TRANSFORM: { doc_score: 50, has_documents: false }
  → MERGE (strategy: "all" — selalu 4 hasil)
  → LLM synthesize (dynamic weights)
  → SWITCH → AUTO_APPROVED / REVIEW / ESCALATED
```

**Bobot scoring:**
```
Tanpa dokumen:  40% rule + 25% narrative + 35% pattern
Dengan dokumen: 35% rule + 20% narrative + 30% pattern + 15% doc_score
```

---

#### 9.3 HorizonLife: S3 Utility + Upload Route ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `lib/s3.ts` | BARU | Minimal S3 client: `uploadToS3()`, `downloadFromS3()`, `getPresignedUrl()`, `claimDocKey()`. Env vars sama dengan RantAI-Agents (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, dll). Namespace key: `horizonlife/claims/{nanoid}/{filename}` |
| `app/api/portal/claims/upload/route.ts` | EDIT | POST: terima file (multipart) → `uploadToS3()` → return `{ s3Key, filename, mimeType, size, type }`. Tidak ada base64 — tidak ada konversi ke PostgreSQL |
| `components/portal/claim-form.tsx` | EDIT | `UploadedDocument.base64` → `s3Key`. Form state menyimpan s3Key bukan base64 |

**Format `Claim.documents` di HorizonLife DB (PostgreSQL JSON field):**
```json
[
  { "s3Key": "horizonlife/claims/abc123/kuitansi.pdf", "filename": "kuitansi.pdf", "mimeType": "application/pdf", "type": "receipt", "size": 142876 },
  { "s3Key": "horizonlife/claims/abc123/surat_dokter.jpg", "filename": "surat_dokter.jpg", "mimeType": "image/jpeg", "type": "doctor_letter", "size": 89432 }
]
```

**Tipe dokumen yang bisa diupload:**

| Tipe | Label | Keterangan |
|------|-------|------------|
| `receipt` | Kuitansi pembayaran | PDF atau foto |
| `doctor_letter` | Surat dokter / diagnosa | PDF atau foto |
| `medical_resume` | Resume medis | PDF |
| `prescription` | Resep obat | PDF atau foto |
| `other` | Dokumen lain | PDF atau foto |

---

#### 9.4 HorizonLife: Analyze + Fraud Score ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `app/api/staff/claims/[id]/analyze/route.ts` | EDIT | Ambil `claim.documents` (ada s3Key), kirim ke workflow input sebagai `documents: [{ s3Key, mimeType, filename, type }]`. OCR tool di RantAI fetch dari RustFS sendiri |
| `lib/fraud-analysis.ts` | EDIT | `DocVerificationResult` interface, `computeFraudScore()` terima `doc_score` opsional, dynamic weights (dengan/tanpa dokumen) |

---

#### 9.5 HorizonLife: Document Viewer + Staff UI ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `app/api/staff/claims/[id]/documents/[index]/route.ts` | BARU | GET: ambil s3Key dari DB → `getPresignedUrl(s3Key, 3600)` → 302 redirect ke S3 (inline view). Untuk `?download=true`: proxy bytes dari S3 agar bisa set `Content-Disposition: attachment` |
| `components/staff/analysis-result.tsx` | EDIT | Section "Verifikasi Dokumen": doc_score bar, doc_findings list, amount/provider/date match indicators dengan ikon FileCheck/FileX/FileQuestion |
| `components/staff/claim-detail.tsx` | EDIT | Tab "Data Klaim": daftar dokumen (filename, type, size) dengan tombol "Lihat" (redirect presigned URL) dan "Unduh" (proxy download) |

**Cara staff melihat dokumen:**

```tsx
{/* Inline view — browser buka dari S3 langsung */}
<a href={`/api/staff/claims/${id}/documents/0`} target="_blank">
  Lihat
</a>

{/* Download — proxy dengan Content-Disposition: attachment */}
<a href={`/api/staff/claims/${id}/documents/0?download=true`} download={doc.filename}>
  Unduh
</a>
```

---

#### 9.6 Demo PDF Generator ✅

| File | Aksi | Deskripsi |
|------|------|-----------|
| `scripts/generate-demo-pdfs.ts` | BARU | Generator 8 PDF demo menggunakan `pdf-lib`. Dokumen Indonesia yang realistis: header provider, data pasien, rincian biaya, tanda tangan |
| `public/demo-docs/` | BARU | Output 8 PDF — siap diupload saat demo |

```bash
# Regenerate PDF demo
pnpm tsx scripts/generate-demo-pdfs.ts
```

Inkonsistensi disengaja di dokumen Rudi (untuk demonstrasi deteksi OCR):
- **Jumlah**: Rp 28.000.000 di dokumen vs Rp 35.000.000 yang diklaim
- **Tanggal**: 15 Oktober 2025 di dokumen vs 8 November 2025 yang diklaim
- **Spesialisasi dokter**: Sp.An (anestesiologi) untuk kasus nyeri punggung

---

#### 9.7 Urutan Implementasi Fase 9

```
1.  ✅ RantAI: Buat lib/tools/builtin/ocr.ts (input: s3_key, downloadFile dari lib/s3)
2.  ✅ RantAI: Registrasi di index.ts + seed.ts (icon 📷)
       ↳ FIXED: ensureBuiltinTools() tadinya tidak dipanggil di prisma/seed.ts
                → ocr_document tidak ada di DB → workflow throw "tool not found"
3.  ⚠️ RantAI: Branch 4 ada di DB workflow, TAPI tidak ada di workflow-templates.ts
       ↳ Template source sudah tidak punya OCR branch (perlu ditambahkan kembali)
       ↳ Lihat §9.8 Bug #2 untuk fix
4.  ✅ HorizonLife: Install @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
5.  ✅ HorizonLife: Buat lib/s3.ts (uploadToS3, downloadFromS3, getPresignedUrl, claimDocKey)
6.  ✅ HorizonLife: Upload route → uploadToS3, return s3Key (bukan base64)
7.  ✅ HorizonLife: claim-form.tsx → UploadedDocument.s3Key (bukan base64)
8.  ✅ HorizonLife: Document viewer endpoint → presigned URL redirect
9.  ✅ HorizonLife: analyze route → kirim s3Key ke workflow (bukan base64)
10. ✅ HorizonLife: computeFraudScore() → dynamic weights dengan/tanpa doc_score
11. ✅ HorizonLife: UI staff → daftar dokumen + verifikasi OCR section
12. ✅ HorizonLife: Buat scripts/generate-demo-pdfs.ts + generate 8 PDF demo
13. ✅ Env vars: S3_* di HorizonLife-Demo .env.example
```

---

#### Catatan Fase 9

- **Setup wajib**: Copy nilai `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` dari RantAI-Agents `.env` ke HorizonLife-Demo `.env`
- **Jika tidak ada dokumen**: Branch 4 return `doc_score: 50` (netral) — tidak pengaruhi scoring
- **Jika OCR gagal** (Ollama tidak jalan): Tool return `success: false`, workflow lanjut dengan `doc_score: 50`
- **Format dokumen**: PDF, JPG, PNG, HEIC — semua didukung `processDocumentOCR()`
- **Ukuran file**: Batasi 5MB per file, max 5 file per klaim
- **Namespace S3**: `horizonlife/claims/{nanoid}/{filename}` — tidak konflik dengan data RantAI lainnya
- **Presigned URL**: expire 1 jam (3600 detik) — cukup untuk review staff normal

---

#### § 9.8 — Bug Yang Ditemukan (Blocking)

Dua bug ditemukan yang mencegah OCR node berjalan. Status DB sudah benar (tidak perlu diubah).

---

**Bug #1 — `getNestedFromInput` tidak handle array notation**

*File*: `lib/workflow/template-engine.ts`

*Gejala*: OCR node menerima `s3_key = undefined` meski DB sudah punya `{{ input.documents[0].s3Key }}`

*Penyebab*:
```typescript
// getNestedFromInput split path by "." → ["documents[0]", "s3Key"]
// Lalu lakukan: obj["documents[0]"] → undefined (literal key lookup, bukan array index)
function getNestedFromInput(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    current = (current as Record<string, unknown>)[key]  // ← BUG
  }
  return current
}
```

*Fix*:
```typescript
function getNestedFromInput(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    // Handle array notation: "documents[0]" → obj.documents[0]
    const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/)
    if (arrayMatch) {
      const [, arrKey, idx] = arrayMatch
      current = (current as Record<string, unknown>)[arrKey]
      if (!Array.isArray(current)) return undefined
      current = current[parseInt(idx, 10)]
    } else {
      current = (current as Record<string, unknown>)[key]
    }
  }
  return current
}
```

*Setelah fix ini*: `{{ input.documents[0].s3Key }}` akan resolve ke nilai S3 key yang benar. DB tidak perlu diubah.

---

**Bug #2 — OCR branch tidak ada di `workflow-templates.ts`**

*File*: `lib/templates/workflow-templates.ts`

*Gejala*: Ketika workflow di-reseed (`bun run db:seed`), OCR node hilang dari template. Namun karena DB sudah di-patch manual (lihat §9.7), workflow di DB saat ini sudah benar — bug ini hanya relevan jika DB di-reset ulang.

*Penyebab*: Saat refactor template, Branch 4 (Document Verification via OCR) tidak disertakan dalam source template.

*Fix*: Tambahkan kembali TOOL node untuk `ocr_document` ke Branch 4 di template "Health Insurance Fraud Detection" dengan inputMapping menggunakan `{{ }}`:
```typescript
{
  id: "ocr_document",
  type: "TOOL",
  data: {
    toolName: "ocr_document",
    label: "OCR Document",
    inputMapping: {
      s3_key: "{{ input.documents[0].s3Key }}",
      filename: "{{ input.documents[0].filename }}",
      mime_type: "{{ input.documents[0].mimeType }}"
    }
  },
  position: { x: 1200, y: 600 }
}
```

*Catatan*: `resolveObjectTemplates` hanya memproses string yang mengandung `{{ }}`. Tanpa tanda kurung kurawal ganda, string akan diteruskan sebagai literal ke S3 → `NoSuchKey` error.

---

**Status per komponen (setelah revert)**

| Komponen | Status | Action |
|----------|--------|--------|
| `lib/ocr/ocr-pipeline.ts` | ✅ Benar — jangan diubah | - |
| `lib/tools/builtin/ocr.ts` | ✅ Benar | - |
| DB: OCR node inputMapping | ✅ Sudah ada `{{ }}` (tidak di-revert) | - |
| `template-engine.ts` → `getNestedFromInput` | ❌ Array notation tidak di-handle | **Fix Bug #1** |
| `workflow-templates.ts` → Branch 4 | ❌ OCR node tidak ada di source | **Fix Bug #2** |
| `workflow_enhanced: false` | ⚠️ Bukan code bug — pastikan RantAI server running | Verifikasi runtime |

---

### Fase 10: Fitur Lanjutan (Opsional)
**Effort: bervariasi | Prioritas: P2-P3**

1. Dashboard statistik fraud (chart, trend, pie chart per risk level)
2. Webhook trigger (untuk integrasi dengan sistem RS)
3. Email notifikasi ke customer saat status berubah
4. Export laporan fraud ke PDF/Excel
5. Batch processing (analisis banyak klaim sekaligus)

---

## Catatan

- Detail teknis per node (system prompts, rule engine code, scoring formula) → lihat [FRAUD-DETECTION-WORKFLOW.md](FRAUD-DETECTION-WORKFLOW.md)
- Widget chat tetap ada di HorizonLife-Demo — untuk bantuan/tanya jawab, bukan untuk submit klaim
- Semua data demo bersifat fiktif, dirancang agar setiap skenario menghasilkan risk level yang berbeda
- Setelah Fase 8, RantAI-Agents = platform generic (seperti Flowise/n8n) — tidak ada kode insurance-specific
- Setelah Fase 9, HorizonLife = full client RantAI yang memanfaatkan shared RustFS, workflow API, dan akan menggunakan chatbot + live agent dari platform RantAI
