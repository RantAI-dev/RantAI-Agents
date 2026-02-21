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
│                               │          │                               │
│  Own DB (PostgreSQL):         │          │  ❌ TIDAK ada data insurance    │
│  • Customer (merged +NIK,    │          │  ❌ TIDAK ada claims API        │
│    gender, DOB)               │          │  ❌ TIDAK ada rule engine       │
│  • Policy (merged +limit)    │          │                               │
│  • Provider (baru)           │          │  ✅ Pure workflow service       │
│  • Claim (baru)              │          │  ✅ Generic, reusable          │
│  • Rule engine (local)        │          │                               │
│                               │          │                               │
│  Stack: Next.js 16            │          │                               │
│  UI: shadcn/ui, Tailwind v4   │          │                               │
└──────────────────────────────┘          └──────────────────────────────┘
```

> **Catatan arsitektur (Updated Fase 8 — Merge)**:
> - Model `Customer` dan `Policy` yang sudah ada di HorizonLife **di-extend** dengan field fraud detection (NIK, gender, DOB, annualLimit, remainingLimit). Bukan model terpisah.
> - Model baru: `Provider` (RS/klinik) dan `Claim` (klaim + hasil analisis).
> - Rule engine (8 rules deterministik) jalan **lokal** di HorizonLife — pure function, 0 DB dependency ke RantAI.
> - RantAI-Agents = **"tukang jasa" murni** — hanya menyediakan workflow execution via API.
> - HorizonLife hanya butuh 2 workflow API call: fraud detection (STANDARD) + investigation (CHATFLOW).
> - Tidak ada Claims API, tidak ada data insurance di RantAI-Agents.

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

### Act 2: Klaim Masuk ke Dashboard CS (RantAI-Agents)

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
  ⬜ Scoring
  ⬜ Keputusan
```

### Act 4: Hasil Analisis + Keputusan CS

```
Risk Score: 67/100 ⚠️ MEDIUM

Breakdown:
  Rule Engine:     55/100  ██████
  AI Narrative:    45/100  █████
  Pattern Match:   85/100  █████████

Temuan:
  • [HIGH] Provider ini punya 12 klaim serupa dalam 3 bulan
  • [MEDIUM] Biaya 40% di atas rata-rata Jakarta
  • [LOW] Klaim 5 hari setelah layanan

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

**Tab 1 — Data Klaim**: Info peserta, polis, provider, diagnosis, prosedur + biaya, dokumen, riwayat klaim

**Tab 2 — Hasil Analisis**: Risk score bar, breakdown 3 komponen (Rule Engine 40%, AI Narrative 25%, Pattern 35%), fraud flags, tombol Approve/Reject/Investigasi

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
      └── AGENT: Analisis pola (RAG + history)
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

Klaim demo yang akan di-submit:
  Diagnosa: N83.2 Kista ovarium ← GENDER MISMATCH (laki-laki!)
  Provider: RS Watchlist
  Total: Rp 95.000.000
  → Ini pasti HIGH risk
```

#### Dewi Kusuma — Klaim Asuransi Jiwa 💀
```
Polis: POL-AJ-00123
Produk: Asuransi Jiwa
Mulai: 1 November 2025 (3 bulan aktif!)
Uang pertanggungan: Rp 2.000.000.000
Tertanggung: Hendra Kusuma (suami, meninggal)
Gender: Perempuan (ahli waris)

Riwayat: Tidak ada klaim sebelumnya
Klaim demo: Kematian karena kecelakaan
Expected score: > 80 (CRITICAL — polis baru 3 bulan + klaim 2M)
Red flags: polis sangat baru, nilai sangat besar, perlu investigasi mendalam
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
```

### API Keys (di .env)

```bash
# RantAI-Agents .env
# (tidak perlu CLAIMS_SERVICE_API_KEY lagi)
# Workflow API keys di-set di seed atau via UI

# HorizonLife-Demo .env
RANTAI_API_URL="http://localhost:3000"
FRAUD_DETECTION_WORKFLOW_API_KEY="wf_fraud_detect_demo_key_2026"
FRAUD_INVESTIGATION_WORKFLOW_API_KEY="wf_fraud_investigate_demo_key_2026"
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
| `GET` | `/api/staff/claims` | Own DB | Staff cookie |
| `GET` | `/api/staff/claims/[id]` | Own DB | Staff cookie |
| `POST` | `/api/staff/claims/[id]/analyze` | Own DB + Workflow API | Staff cookie |
| `POST` | `/api/staff/claims/[id]/decide` | Own DB | Staff cookie |
| `POST` | `/api/staff/claims/[id]/investigate` | Workflow API (streaming) | Staff cookie |

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
> Claims dihapus dari sidebar RantAI-Agents (`app-sidebar.tsx` + `icon-rail.tsx`).

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

#### 7.5 Urutan Implementasi Fase 7

1. ✅ RantAI: `lib/claims-auth.ts` + env vars
2. ✅ RantAI: Extract `lib/fraud-analysis.ts` dari analyze route
3. ✅ RantAI: Enhance public claims API (analyze, decide, list-all, enriched-get)
4. ✅ RantAI: Seed workflow API keys
5. ✅ HorizonLife: Staff auth (lib + API routes)
6. ✅ HorizonLife: Staff proxy routes (6 files)
7. ✅ HorizonLife: Hook + types
8. ✅ HorizonLife: Login page + staff layout
9. ✅ HorizonLife: Claims list page
10. ✅ HorizonLife: Claim detail page (3 tabs)
11. ✅ HorizonLife: Middleware
12. ✅ RantAI: Hapus Claims dari sidebar (`app-sidebar.tsx`, `icon-rail.tsx`)

---

### Fase 8: Arsitektur Migration — RantAI Jadi Pure Workflow Service ✅ COMPLETED

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

#### 8.1 HorizonLife: Merge Schema + Tambah Models ✅

| File | Aksi |
|------|------|
| `prisma/schema.prisma` | EDIT — Extend `Customer` (+`idNumber?`, `gender?`, `dateOfBirth?`, relasi `claims`), extend `Policy` (+`annualLimit?`, `remainingLimit?`, relasi `claims`), tambah model `Provider` + `Claim` |

#### 8.2 HorizonLife: Seed Data (Merge) ✅

| File | Aksi |
|------|------|
| `prisma/seed-insurance.ts` | BARU — Upsert existing customers (+NIK, gender, DOB), upsert policies (+limits), create 5 providers, create 17 claims |
| `package.json` | EDIT — Tambah script `db:seed-insurance` |

#### 8.3 HorizonLife: Prisma Client Singleton ✅

| File | Aksi |
|------|------|
| `lib/prisma.ts` | BARU — Singleton pattern untuk API routes |

#### 8.4 HorizonLife: Fraud Analysis Module (Local) ✅

| File | Aksi |
|------|------|
| `lib/fraud-analysis.ts` | BARU — Copy `runRuleEngine` + `computeFraudScore` (1:1, adjust `customer.name` → `firstName+lastName`), ubah `tryWorkflowAnalysis` → HTTP call ke workflow API |

#### 8.5 RantAI: Generic Workflow Discovery Endpoint ✅

| File | Aksi |
|------|------|
| `app/api/workflows/discover/route.ts` | BARU — `GET /api/workflows/discover?name=X&mode=X` (generic, API key auth) |

#### 8.6 HorizonLife: Rewrite Staff API Routes (Direct DB) ✅

| File | Aksi |
|------|------|
| `lib/staff-claim-types.ts` | EDIT — Update types to match merged Customer/Policy |
| `app/api/staff/claims/route.ts` | EDIT — Proxy → direct `prisma.claim.findMany()` |
| `app/api/staff/claims/[id]/route.ts` | EDIT — Proxy → direct query + claimHistory |
| `app/api/staff/claims/[id]/analyze/route.ts` | EDIT — Proxy → local rule engine + workflow HTTP |
| `app/api/staff/claims/[id]/decide/route.ts` | EDIT — Proxy → direct `prisma.claim.update()` |
| `app/api/staff/claims/[id]/investigate/route.ts` | EDIT — Discovery via `/api/workflows/discover` |

#### 8.7 HorizonLife: Rewrite Portal API Routes (Direct DB) ✅

| File | Aksi |
|------|------|
| `app/api/portal/lookup/route.ts` | EDIT — Proxy → direct DB (`prisma.customer.findFirst({ where: { idNumber } })`) |
| `app/api/portal/claims/route.ts` | EDIT — Proxy → direct DB |
| `app/api/portal/claims/[id]/route.ts` | EDIT — Proxy → direct DB |

#### 8.8 RantAI: Cleanup ✅

| File | Aksi |
|------|------|
| `app/api/claims/` | HAPUS — Seluruh folder |
| `app/api/dashboard/claims/` | HAPUS — Seluruh folder |
| `app/dashboard/claims/` | HAPUS — Seluruh folder |
| `lib/fraud-analysis.ts` | HAPUS |
| `lib/claims-auth.ts` | HAPUS |
| `lib/customer-context.ts` | HAPUS |
| `hooks/use-claims.ts` | HAPUS |
| `prisma/schema.prisma` | EDIT — Hapus 4 insurance models (InsuranceCustomer, InsurancePolicy, Provider, Claim) |
| `prisma/seed.ts` | EDIT — Hapus `seedInsuranceData()` |

> `lib/templates/workflow-templates.ts` — Fraud workflow templates **tetap ada** (template generic)

#### 8.9 HorizonLife: Cleanup Env Vars ✅

Hapus `CLAIMS_SERVICE_API_KEY`. Tetap: `RANTAI_API_URL`, `FRAUD_DETECTION_WORKFLOW_API_KEY`, `FRAUD_INVESTIGATION_WORKFLOW_API_KEY`.

#### 8.10 Update Dokumen ✅

Update file ini (`FRAUD-DETECTION-IMPLEMENTATION-PLAN.md`) agar mencerminkan arsitektur baru + merge models.

#### Catatan Implementasi

- **Docker**: HorizonLife PostgreSQL menggunakan port **5433** (bukan 5432) agar tidak konflik dengan RantAI PostgreSQL
- **Seed**: `seedInsuranceData()` ditambahkan ke `prisma/seed.ts` existing (bukan file terpisah), dipanggil di akhir `main()`
- **Budi Santoso**: Customer portal (email: `customer@example.com`) di-merge dengan data fraud (NIK, gender, DOB). Polis POL-HK-00567 ditambahkan sebagai polis terpisah dari polis portal existing
- **3 Customer baru**: Siti, Rudi, Dewi dibuat sebagai customer baru dengan `passwordHash` (bisa login portal)
- **Investigate route**: Tetap streaming via HTTP ke RantAI workflow API, hanya ganti discovery endpoint dari `/api/claims/workflows` ke `/api/workflows/discover`

---

### Fase 9: Fitur Lanjutan (Opsional)
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
