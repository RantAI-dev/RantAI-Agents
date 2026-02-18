# Fraud Detection Workflow — Asuransi Kesehatan & Jiwa

> Dokumen implementasi untuk membangun workflow deteksi fraud klaim asuransi kesehatan dan asuransi jiwa menggunakan workflow engine RantAI-Agents.

---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Jenis-Jenis Fraud Asuransi](#2-jenis-jenis-fraud-asuransi)
3. [Arsitektur Workflow](#3-arsitektur-workflow)
4. [Detail Implementasi Per Node](#4-detail-implementasi-per-node)
5. [Skema Data Klaim](#5-skema-data-klaim)
6. [Knowledge Base yang Dibutuhkan](#6-knowledge-base-yang-dibutuhkan)
7. [Scoring & Logika Keputusan](#7-scoring--logika-keputusan)
8. [Skenario Pengujian](#8-skenario-pengujian)
9. [Referensi & Catatan Teknis](#9-referensi--catatan-teknis)

---

## 1. Ringkasan Proyek

### Tujuan
Membangun workflow otomatis untuk mendeteksi potensi fraud pada klaim asuransi kesehatan dan asuransi jiwa, menggunakan kombinasi:
- **Rule-based checking** (aturan bisnis)
- **AI/LLM analysis** (analisis naratif & pola)
- **RAG search** (cross-reference knowledge base)
- **Human-in-the-loop** (persetujuan investigator)

### Node yang Digunakan (Sudah Tersedia)
| Node Type | Fungsi dalam Workflow |
|---|---|
| `WEBHOOK` / `MANUAL_TRIGGER` | Intake klaim masuk |
| `LLM` | Ekstraksi dokumen, analisis naratif |
| `AGENT` | AI agent dengan tools untuk investigasi |
| `CODE` | Rule engine, scoring formula |
| `RAG_SEARCH` | Query knowledge base (polis, riwayat klaim, daftar fraud) |
| `CONDITION` / `SWITCH` | Routing berdasarkan risk score |
| `PARALLEL` | Jalankan analisis secara bersamaan |
| `MERGE` | Gabungkan hasil analisis |
| `TRANSFORM` | Hitung skor risiko gabungan |
| `HUMAN_INPUT` / `APPROVAL` | Review oleh investigator |
| `HTTP_REQUEST` | Panggil API eksternal (verifikasi provider, dll) |
| `DATABASE` | Simpan hasil audit |

### Mode Workflow
- **STANDARD** — untuk batch processing klaim
- **CHATFLOW** — untuk investigator yang ingin "chat" dengan sistem tentang klaim yang di-flag

---

## 2. Jenis-Jenis Fraud Asuransi

### 2.1 Fraud Asuransi Kesehatan

| Kode | Jenis Fraud | Deskripsi | Contoh |
|---|---|---|---|
| `HF-01` | **Phantom Billing** | Tagihan untuk layanan yang tidak pernah diberikan | Klaim fisioterapi 10 sesi, pasien hanya datang 2x |
| `HF-02` | **Upcoding** | Menagih prosedur lebih mahal dari yang dilakukan | Klaim operasi besar, padahal hanya tindakan minor |
| `HF-03` | **Unbundling** | Memecah tagihan yang seharusnya satu paket | Tagihan lab terpisah-pisah padahal satu panel pemeriksaan |
| `HF-04` | **Double Billing** | Klaim duplikat untuk layanan yang sama | Submit klaim yang sama ke 2 polis berbeda |
| `HF-05` | **Identity Fraud** | Menggunakan polis orang lain | Anak menggunakan kartu asuransi orang tua untuk rawat inap |
| `HF-06` | **Provider Collusion** | Kerja sama dokter-pasien untuk klaim palsu | Dokter mengeluarkan surat rujukan palsu |
| `HF-07` | **Excessive Visits** | Frekuensi kunjungan tidak wajar | 15x kunjungan dokter dalam 1 bulan ke provider berbeda |
| `HF-08` | **Fake Receipts** | Kuitansi/struk palsu atau dimanipulasi | Edit nominal pada kuitansi apotek |
| `HF-09` | **Unnecessary Procedures** | Prosedur medis yang tidak diperlukan | Operasi tanpa indikasi medis yang jelas |
| `HF-10` | **Age/Gender Mismatch** | Prosedur tidak sesuai demografi | Klaim pemeriksaan prostat untuk pasien perempuan |

### 2.2 Fraud Asuransi Jiwa

| Kode | Jenis Fraud | Deskripsi | Contoh |
|---|---|---|---|
| `LF-01` | **Staged Death** | Memalsukan kematian untuk klaim | Sertifikat kematian palsu |
| `LF-02` | **Pre-existing Condition** | Menyembunyikan kondisi kesehatan saat pendaftaran | Tidak melaporkan riwayat jantung |
| `LF-03` | **Application Fraud** | Memalsukan data di formulir pendaftaran | Umur, pekerjaan, atau riwayat medis palsu |
| `LF-04` | **Beneficiary Fraud** | Manipulasi penerima manfaat | Mengubah beneficiary sebelum kematian mencurigakan |
| `LF-05` | **Churning** | Agen menjual polis baru terus-menerus | Ganti polis setiap 6 bulan untuk komisi baru |
| `LF-06` | **Murder for Profit** | Pembunuhan untuk klaim asuransi | Polis baru + kematian dalam periode singkat |
| `LF-07` | **Suicide Misrepresentation** | Menyamarkan bunuh diri sebagai kecelakaan | Klaim accidental death padahal bunuh diri |

---

## 3. Arsitektur Workflow

### 3.1 Flow Diagram (High-Level)

```
┌─────────────────┐
│  WEBHOOK/MANUAL  │  ← Klaim masuk (JSON + dokumen)
│    TRIGGER       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   LLM: Ekstraksi │  ← Parse dokumen medis, kuitansi
│   Dokumen        │     ke structured data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RAG: Validasi   │  ← Cek polis, coverage, limit
│  Polis           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│              PARALLEL                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ CODE:    │ │ LLM:     │ │ RAG+LLM:     │ │
│  │ Rule     │ │ Narrative│ │ Pattern      │ │
│  │ Engine   │ │ Analysis │ │ Analysis     │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
└───────┼─────────────┼──────────────┼─────────┘
        │             │              │
        ▼             ▼              ▼
┌─────────────────┐
│     MERGE        │  ← Gabungkan semua hasil
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TRANSFORM:      │  ← Hitung risk score gabungan
│  Risk Scoring    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     SWITCH       │  ← Routing berdasarkan score
│  (risk level)    │
└──┬──────┬──────┬┘
   │      │      │
   ▼      ▼      ▼
 LOW    MEDIUM   HIGH
 Auto   Review   Eskalasi
 Approve Queue   + Freeze
   │      │      │
   │      ▼      │
   │  APPROVAL   │
   │  (Human)    │
   │      │      │
   ▼      ▼      ▼
┌─────────────────┐
│  HTTP_REQUEST:   │  ← Update sistem klaim
│  Update & Notify │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  DATABASE:       │  ← Simpan audit log
│  Audit Log       │
└─────────────────┘
```

### 3.2 Chatflow Mode (untuk Investigator)

```
MANUAL_TRIGGER
  → AGENT (dengan tools: RAG search, claim history, provider lookup)
  → STREAM_OUTPUT (investigator bisa tanya jawab tentang klaim)
```

---

## 4. Detail Implementasi Per Node

### 4.1 Node 1: Claim Intake (Webhook Trigger)

**Type:** `WEBHOOK`
**Deskripsi:** Menerima data klaim dalam format JSON

**Input yang diharapkan:**
```json
{
  "claim_id": "CLM-2026-001234",
  "claim_type": "health",           // "health" | "life"
  "policy_number": "POL-HK-00567",
  "claimant": {
    "name": "Budi Santoso",
    "id_number": "3201234567890001",
    "date_of_birth": "1985-03-15",
    "gender": "male",
    "phone": "081234567890"
  },
  "provider": {
    "name": "RS Medika Jakarta",
    "provider_id": "PRV-001",
    "type": "hospital",
    "city": "Jakarta"
  },
  "diagnosis": {
    "icd_code": "J18.9",
    "description": "Pneumonia, unspecified organism"
  },
  "procedures": [
    {
      "code": "PROC-001",
      "description": "Rawat inap 5 hari",
      "amount": 15000000
    },
    {
      "code": "PROC-002",
      "description": "Obat-obatan",
      "amount": 3500000
    }
  ],
  "total_amount": 18500000,
  "claim_date": "2026-02-15",
  "service_date": "2026-02-10",
  "documents": [
    {
      "type": "medical_report",
      "url": "https://storage/docs/medical-report-001.pdf"
    },
    {
      "type": "receipt",
      "url": "https://storage/docs/receipt-001.pdf"
    }
  ]
}
```

**Output:** Meneruskan data klaim ke node berikutnya.

---

### 4.2 Node 2: Document Extraction (LLM)

**Type:** `LLM`
**Model:** `google/gemini-2.0-flash` (atau model dengan kemampuan vision)
**Temperature:** `0.1` (konsisten, deterministik)

**System Prompt:**
```
Kamu adalah asisten ekstraksi dokumen medis asuransi. Tugasmu mengekstrak informasi dari dokumen klaim asuransi ke format terstruktur.

Dari dokumen yang diberikan, ekstrak:
1. Tanggal layanan
2. Nama provider/rumah sakit
3. Nama pasien
4. Diagnosis (kode ICD jika ada)
5. Daftar prosedur/tindakan dengan biaya
6. Total biaya
7. Nama dan tanda tangan dokter
8. Nomor rekam medis
9. Hal-hal mencurigakan (inkonsistensi tanggal, tulisan berbeda, tanda manipulasi)

Output dalam format JSON yang terstruktur.
Jika ada inkonsistensi antara dokumen dan data klaim, TANDAI dengan flag "inconsistency_found": true.
```

**Output:** JSON terstruktur dari dokumen + flag inkonsistensi

---

### 4.3 Node 3: Policy Validation (RAG Search)

**Type:** `RAG_SEARCH`
**Knowledge Base:** `kb-policy-rules` (lihat Bagian 6)

**Query Template:**
```
Cari informasi polis {{policy_number}}:
- Apakah polis aktif?
- Apa coverage yang termasuk?
- Berapa limit tahunan?
- Apakah diagnosis {{diagnosis.icd_code}} termasuk dalam coverage?
- Apakah provider {{provider.name}} termasuk dalam jaringan?
- Apakah ada waiting period yang masih berlaku?
- Berapa sisa limit yang tersedia?
```

**Output:** Detail polis, status coverage, sisa limit

---

### 4.4 Node 4: PARALLEL — Tiga Jalur Analisis

**Type:** `PARALLEL`
**Strategy:** Jalankan ketiga branch secara bersamaan

#### Branch A: Rule Engine (CODE Node)

**Type:** `CODE`
**Bahasa:** JavaScript

```javascript
// === RULE ENGINE: Deteksi Fraud Berbasis Aturan ===

const claim = $input.claim;
const extracted = $input.extracted_document;
const policy = $input.policy_validation;
const flags = [];
let ruleScore = 0;

// --- RULE 1: Duplikasi Klaim ---
// Cek apakah ada klaim dengan tanggal layanan & provider yang sama
// (data riwayat dari input sebelumnya)
if ($input.claim_history) {
  const duplicates = $input.claim_history.filter(h =>
    h.service_date === claim.service_date &&
    h.provider_id === claim.provider.provider_id &&
    h.claim_id !== claim.claim_id
  );
  if (duplicates.length > 0) {
    flags.push({
      rule: "HF-04",
      severity: "HIGH",
      message: `Ditemukan ${duplicates.length} klaim duplikat pada tanggal dan provider yang sama`,
      details: duplicates.map(d => d.claim_id)
    });
    ruleScore += 40;
  }
}

// --- RULE 2: Melebihi Limit Polis ---
if (claim.total_amount > policy.remaining_limit) {
  flags.push({
    rule: "LIMIT_EXCEEDED",
    severity: "MEDIUM",
    message: `Klaim Rp${claim.total_amount.toLocaleString()} melebihi sisa limit Rp${policy.remaining_limit.toLocaleString()}`,
  });
  ruleScore += 20;
}

// --- RULE 3: Age/Gender Mismatch ---
const genderSpecificCodes = {
  female_only: ["O80", "O82", "N83", "C56"],  // obstetri, ginekologi
  male_only: ["N40", "C61", "N41"]             // prostat
};
const icd = claim.diagnosis.icd_code;
if (claim.claimant.gender === "male" && genderSpecificCodes.female_only.some(c => icd.startsWith(c))) {
  flags.push({ rule: "HF-10", severity: "HIGH", message: "Diagnosis khusus perempuan pada pasien laki-laki" });
  ruleScore += 50;
}
if (claim.claimant.gender === "female" && genderSpecificCodes.male_only.some(c => icd.startsWith(c))) {
  flags.push({ rule: "HF-10", severity: "HIGH", message: "Diagnosis khusus laki-laki pada pasien perempuan" });
  ruleScore += 50;
}

// --- RULE 4: Frekuensi Kunjungan Tidak Wajar ---
if ($input.claim_history) {
  const lastMonth = $input.claim_history.filter(h => {
    const diff = (new Date(claim.claim_date) - new Date(h.claim_date)) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  });
  if (lastMonth.length > 10) {
    flags.push({
      rule: "HF-07",
      severity: "HIGH",
      message: `${lastMonth.length} klaim dalam 30 hari terakhir (threshold: 10)`,
    });
    ruleScore += 35;
  } else if (lastMonth.length > 5) {
    flags.push({
      rule: "HF-07",
      severity: "MEDIUM",
      message: `${lastMonth.length} klaim dalam 30 hari terakhir (threshold: 5)`,
    });
    ruleScore += 15;
  }
}

// --- RULE 5: Inkonsistensi Dokumen ---
if (extracted.inconsistency_found) {
  flags.push({
    rule: "DOC_INCONSISTENCY",
    severity: "HIGH",
    message: "Ditemukan inkonsistensi antara dokumen dan data klaim",
    details: extracted.inconsistencies
  });
  ruleScore += 30;
}

// --- RULE 6: Klaim Besar (Threshold) ---
const THRESHOLD_HEALTH = 50000000; // Rp 50 juta
const THRESHOLD_LIFE = 500000000;  // Rp 500 juta
const threshold = claim.claim_type === "health" ? THRESHOLD_HEALTH : THRESHOLD_LIFE;
if (claim.total_amount > threshold) {
  flags.push({
    rule: "HIGH_VALUE",
    severity: "MEDIUM",
    message: `Klaim bernilai tinggi: Rp${claim.total_amount.toLocaleString()} (threshold: Rp${threshold.toLocaleString()})`,
  });
  ruleScore += 15;
}

// --- RULE 7: Polis Baru + Klaim Besar (Life Insurance) ---
if (claim.claim_type === "life" && policy.policy_age_months < 24 && claim.total_amount > THRESHOLD_LIFE) {
  flags.push({
    rule: "LF-06",
    severity: "CRITICAL",
    message: `Polis baru (${policy.policy_age_months} bulan) dengan klaim besar — indikasi fraud potensial`,
  });
  ruleScore += 50;
}

// --- RULE 8: Provider di Watchlist ---
if (policy.provider_watchlist === true) {
  flags.push({
    rule: "PROVIDER_WATCHLIST",
    severity: "HIGH",
    message: `Provider ${claim.provider.name} ada di watchlist fraud`,
  });
  ruleScore += 40;
}

// Cap score di 100
ruleScore = Math.min(ruleScore, 100);

return {
  source: "rule_engine",
  score: ruleScore,
  flags: flags,
  total_flags: flags.length,
  highest_severity: flags.length > 0
    ? (flags.some(f => f.severity === "CRITICAL") ? "CRITICAL"
      : flags.some(f => f.severity === "HIGH") ? "HIGH"
      : flags.some(f => f.severity === "MEDIUM") ? "MEDIUM" : "LOW")
    : "NONE"
};
```

#### Branch B: Narrative Analysis (LLM Node)

**Type:** `LLM`
**Model:** `openai/gpt-4o` atau `anthropic/claude-sonnet-4-5-20250929`
**Temperature:** `0.2`

**System Prompt:**
```
Kamu adalah analis fraud asuransi senior dengan pengalaman 20 tahun di industri asuransi Indonesia.

Tugasmu menganalisis KONSISTENSI NARATIF dari dokumen klaim asuransi. Perhatikan:

1. **Konsistensi Medis**: Apakah diagnosis sesuai dengan prosedur? Apakah durasi rawat inap wajar untuk diagnosis tersebut?
2. **Konsistensi Temporal**: Apakah timeline masuk akal? (tanggal layanan, tanggal klaim, durasi perawatan)
3. **Konsistensi Biaya**: Apakah biaya wajar untuk prosedur tersebut di kota/provider yang bersangkutan?
4. **Kualitas Dokumen**: Apakah laporan medis terlihat profesional dan lengkap? Ada tanda-tanda manipulasi?
5. **Red Flags Spesifik**:
   - Diagnosis umum tapi biaya sangat tinggi
   - Banyak prosedur untuk diagnosis sederhana
   - Bahasa medis yang tidak konsisten
   - Pola yang terlalu "sempurna" (semua angka bulat, dll)

Output dalam format JSON:
{
  "narrative_score": 0-100,  // 0 = bersih, 100 = sangat mencurigakan
  "findings": [
    {
      "category": "medical|temporal|financial|document",
      "severity": "LOW|MEDIUM|HIGH",
      "finding": "deskripsi temuan",
      "evidence": "bukti dari dokumen"
    }
  ],
  "summary": "ringkasan analisis dalam 2-3 kalimat"
}
```

**User Prompt:**
```
Analisis klaim berikut:

Data Klaim: {{JSON.stringify(claim)}}
Hasil Ekstraksi Dokumen: {{JSON.stringify(extracted_document)}}
Info Polis: {{JSON.stringify(policy_validation)}}

Berikan analisis naratif dan skor risiko.
```

#### Branch C: Pattern Analysis (RAG + LLM)

**Type:** `AGENT` (dengan tool RAG_SEARCH)
**Knowledge Base:** `kb-fraud-patterns` + `kb-claim-history`

**System Prompt:**
```
Kamu adalah analis pola fraud asuransi. Tugasmu mencari POLA MENCURIGAKAN dengan membandingkan klaim saat ini terhadap:

1. **Riwayat klaim peserta**: Apakah ada pola berulang? Apakah frekuensi klaim meningkat tiba-tiba?
2. **Pola provider**: Apakah provider ini sering terlibat dalam klaim mencurigakan?
3. **Pola regional**: Apakah ada cluster klaim dari area/provider yang sama?
4. **Pola fraud yang diketahui**: Cocokkan dengan pola fraud yang sudah terdokumentasi.
5. **Anomali statistik**: Apakah jumlah klaim ini jauh di atas rata-rata untuk diagnosis serupa?

Gunakan tools yang tersedia untuk mencari di knowledge base:
- Cari riwayat klaim peserta ini
- Cari riwayat klaim di provider ini
- Cari pola fraud yang mirip

Output dalam format JSON:
{
  "pattern_score": 0-100,
  "patterns_found": [
    {
      "pattern_type": "claimant_history|provider_pattern|regional_cluster|known_fraud|statistical_anomaly",
      "severity": "LOW|MEDIUM|HIGH",
      "description": "deskripsi pola",
      "matching_cases": ["CLM-xxx", "CLM-yyy"]
    }
  ],
  "summary": "ringkasan analisis pola"
}
```

---

### 4.5 Node 5: Merge Results

**Type:** `MERGE`
**Strategy:** `ALL` (tunggu semua branch selesai)

**Output:** Gabungan dari ketiga branch:
```json
{
  "rule_engine": { "score": 40, "flags": [...] },
  "narrative_analysis": { "narrative_score": 25, "findings": [...] },
  "pattern_analysis": { "pattern_score": 60, "patterns_found": [...] }
}
```

---

### 4.6 Node 6: Risk Scoring (Transform)

**Type:** `TRANSFORM`

**Logika Scoring:**
```javascript
// Bobot masing-masing analisis
const WEIGHTS = {
  rule_engine: 0.40,      // 40% — aturan bisnis paling objektif
  narrative: 0.25,         // 25% — analisis AI
  pattern: 0.35            // 35% — pola historis sangat penting
};

const ruleScore = $input.rule_engine.score;
const narrativeScore = $input.narrative_analysis.narrative_score;
const patternScore = $input.pattern_analysis.pattern_score;

// Skor gabungan (weighted average)
const compositeScore = Math.round(
  ruleScore * WEIGHTS.rule_engine +
  narrativeScore * WEIGHTS.narrative +
  patternScore * WEIGHTS.pattern
);

// Override: jika ada flag CRITICAL, minimum score = 80
const hasCritical = $input.rule_engine.flags.some(f => f.severity === "CRITICAL");
const finalScore = hasCritical ? Math.max(compositeScore, 80) : compositeScore;

// Tentukan risk level
let riskLevel;
if (finalScore < 30) riskLevel = "LOW";
else if (finalScore < 70) riskLevel = "MEDIUM";
else riskLevel = "HIGH";

return {
  claim_id: $input.claim.claim_id,
  composite_score: finalScore,
  risk_level: riskLevel,
  breakdown: {
    rule_engine: { score: ruleScore, weight: WEIGHTS.rule_engine, weighted: Math.round(ruleScore * WEIGHTS.rule_engine) },
    narrative: { score: narrativeScore, weight: WEIGHTS.narrative, weighted: Math.round(narrativeScore * WEIGHTS.narrative) },
    pattern: { score: patternScore, weight: WEIGHTS.pattern, weighted: Math.round(patternScore * WEIGHTS.pattern) },
  },
  all_flags: [
    ...$input.rule_engine.flags,
    ...$input.narrative_analysis.findings,
    ...$input.pattern_analysis.patterns_found
  ],
  recommendation: riskLevel === "LOW"
    ? "AUTO_APPROVE"
    : riskLevel === "MEDIUM"
    ? "MANUAL_REVIEW"
    : "ESCALATE_AND_FREEZE"
};
```

---

### 4.7 Node 7: Risk Routing (Switch)

**Type:** `SWITCH`
**Variable:** `$input.risk_level`

| Kondisi | Output Handle | Aksi |
|---|---|---|
| `risk_level === "LOW"` | `low_risk` | Langsung ke auto-approve |
| `risk_level === "MEDIUM"` | `medium_risk` | Ke antrian review manual |
| `risk_level === "HIGH"` | `high_risk` | Eskalasi + freeze klaim |

---

### 4.8 Node 8a: Auto-Approve (HTTP Request)

**Type:** `HTTP_REQUEST`
**Endpoint:** `POST /api/claims/{{claim_id}}/approve`

```json
{
  "status": "APPROVED",
  "approved_by": "SYSTEM_AUTO",
  "fraud_score": "{{composite_score}}",
  "notes": "Klaim disetujui otomatis — risiko rendah (score: {{composite_score}})"
}
```

### 4.8b: Manual Review (Approval Node)

**Type:** `APPROVAL`

**Prompt untuk Investigator:**
```
## Klaim Memerlukan Review Manual

**Klaim ID:** {{claim_id}}
**Peserta:** {{claimant.name}}
**Provider:** {{provider.name}}
**Jumlah:** Rp {{total_amount}}
**Risk Score:** {{composite_score}} (MEDIUM)

### Temuan:
{{#each all_flags}}
- [{{severity}}] {{message}}
{{/each}}

### Breakdown Skor:
- Rule Engine: {{breakdown.rule_engine.score}}/100
- Analisis Naratif: {{breakdown.narrative.score}}/100
- Analisis Pola: {{breakdown.pattern.score}}/100

### Keputusan:
- ✅ APPROVE — Setujui klaim
- ❌ REJECT — Tolak klaim
- 🔍 INVESTIGATE — Perlu investigasi lebih lanjut
```

### 4.8c: Escalation (HTTP Request + Human Input)

**Type:** `HTTP_REQUEST` → `HUMAN_INPUT`

**Step 1 — Freeze Klaim:**
```json
POST /api/claims/{{claim_id}}/freeze
{
  "status": "FROZEN",
  "reason": "High fraud risk detected (score: {{composite_score}})",
  "frozen_by": "SYSTEM_AUTO"
}
```

**Step 2 — Notifikasi Tim Fraud:**
```json
POST /api/notifications/fraud-team
{
  "priority": "URGENT",
  "claim_id": "{{claim_id}}",
  "score": "{{composite_score}}",
  "flags": "{{all_flags}}",
  "message": "Klaim {{claim_id}} memerlukan investigasi fraud segera"
}
```

---

### 4.9 Node 9: Audit Log (Database)

**Type:** `DATABASE`

**Simpan ke tabel audit:**
```json
{
  "claim_id": "{{claim_id}}",
  "workflow_run_id": "{{run_id}}",
  "risk_score": "{{composite_score}}",
  "risk_level": "{{risk_level}}",
  "decision": "{{final_decision}}",   // APPROVED | REJECTED | INVESTIGATING
  "decided_by": "{{decided_by}}",     // SYSTEM_AUTO | investigator_id
  "flags_count": "{{all_flags.length}}",
  "flags_detail": "{{JSON.stringify(all_flags)}}",
  "processing_time_ms": "{{processing_time}}",
  "created_at": "{{new Date().toISOString()}}"
}
```

---

## 5. Skema Data Klaim

### 5.1 Prisma Model (Opsional — jika ingin simpan di DB)

```prisma
model Claim {
  id            String   @id @default(cuid())
  claimNumber   String   @unique
  claimType     String   // "health" | "life"
  policyNumber  String
  status        String   @default("PENDING") // PENDING | PROCESSING | APPROVED | REJECTED | FROZEN | INVESTIGATING

  // Peserta
  claimantName  String
  claimantIdNumber String
  claimantDob   DateTime
  claimantGender String

  // Provider
  providerName  String
  providerId    String
  providerType  String
  providerCity  String

  // Klaim
  diagnosisCode String
  diagnosisDesc String
  totalAmount   Decimal
  claimDate     DateTime
  serviceDate   DateTime

  // Fraud Detection
  fraudScore    Int?
  riskLevel     String?  // LOW | MEDIUM | HIGH
  fraudFlags    Json?    // array of flag objects
  decision      String?  // AUTO_APPROVED | MANUAL_APPROVED | REJECTED | INVESTIGATING
  decidedBy     String?
  decidedAt     DateTime?

  // Audit
  workflowRunId String?
  processingTimeMs Int?

  organizationId String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model FraudAuditLog {
  id            String   @id @default(cuid())
  claimId       String
  workflowRunId String
  riskScore     Int
  riskLevel     String
  decision      String
  decidedBy     String
  flagsCount    Int
  flagsDetail   Json
  ruleBreakdown Json     // { rule_engine, narrative, pattern scores }
  processingTimeMs Int

  organizationId String
  createdAt     DateTime @default(now())
}
```

---

## 6. Knowledge Base yang Dibutuhkan

### 6.1 KB: Aturan Polis (`kb-policy-rules`)

**Isi:** Upload dokumen-dokumen berikut ke knowledge base:
- Tabel produk asuransi (coverage, limit, premi, exclusion)
- Daftar provider jaringan
- Aturan waiting period per produk
- Tabel ICD-10 yang di-cover per produk
- Daftar prosedur dan range biaya wajar per kota

**Format:** PDF atau Markdown per produk asuransi

**Contoh dokumen:**
```markdown
# Produk: Asuransi Kesehatan Premium

## Coverage
- Rawat Inap: Rp 500.000.000/tahun
- Rawat Jalan: Rp 50.000.000/tahun
- Gigi: Rp 10.000.000/tahun
- Melahirkan: Rp 30.000.000 (setelah 12 bulan)

## Exclusion
- Pre-existing condition (12 bulan pertama)
- Operasi kosmetik
- Pengobatan alternatif
- Kacamata/lensa kontak

## Waiting Period
- Penyakit umum: 30 hari
- Penyakit khusus: 12 bulan
- Melahirkan: 12 bulan
```

### 6.2 KB: Pola Fraud (`kb-fraud-patterns`)

**Isi:** Database pola fraud yang sudah diketahui

**Contoh dokumen:**
```markdown
# Pola Fraud: Phantom Billing Fisioterapi

## Deskripsi
Provider fisioterapi menagih sesi yang tidak pernah dilakukan.
Biasanya 10-20 sesi per bulan per pasien.

## Indikator
- Jumlah sesi > 12 per bulan
- Semua sesi pada hari kerja berturut-turut
- Pasien tinggal jauh dari lokasi provider (>50km)
- Tidak ada diagnosis ortopedi/neurologi yang mendukung

## Kasus Sebelumnya
- CLM-2025-00456: RS Fisio Jaya, 45 klaim phantom dalam 3 bulan
- CLM-2025-00789: Klinik Sehat Bersama, pola serupa

## Risk Weight: HIGH
```

### 6.3 KB: Riwayat Klaim (`kb-claim-history`)

**Isi:** Data historis klaim (di-update berkala)
- Riwayat klaim per peserta
- Riwayat klaim per provider
- Statistik rata-rata klaim per diagnosis per kota

> **Catatan:** KB ini bisa diganti dengan query langsung ke database menggunakan node `DATABASE` jika data terlalu besar untuk RAG.

---

## 7. Scoring & Logika Keputusan

### 7.1 Tabel Bobot

| Sumber | Bobot | Alasan |
|---|---|---|
| Rule Engine | 40% | Aturan bisnis objektif, paling reliable |
| Pattern Analysis | 35% | Pola historis sangat prediktif |
| Narrative Analysis | 25% | AI analysis, membantu tapi butuh validasi |

### 7.2 Threshold Keputusan

| Score Range | Risk Level | Aksi | SLA |
|---|---|---|---|
| 0 - 29 | LOW | Auto-approve | Instan |
| 30 - 69 | MEDIUM | Manual review oleh analis | 1 hari kerja |
| 70 - 100 | HIGH | Eskalasi ke tim fraud, klaim di-freeze | Segera |

### 7.3 Override Rules

| Kondisi | Override |
|---|---|
| Flag dengan severity `CRITICAL` | Minimum score = 80 (otomatis HIGH) |
| Provider ada di watchlist | Minimum score = 50 (otomatis MEDIUM+) |
| Klaim > Rp 100 juta (health) | Wajib manual review meskipun score LOW |
| Polis < 6 bulan + klaim > Rp 50 juta | Minimum score = 60 |

---

## 8. Skenario Pengujian

### Test Case 1: Klaim Bersih (Expected: LOW risk, auto-approve)

```json
{
  "claim_id": "TEST-001",
  "claim_type": "health",
  "policy_number": "POL-HK-ACTIVE",
  "claimant": { "name": "Andi Wijaya", "gender": "male", "date_of_birth": "1990-01-01" },
  "provider": { "name": "RS Mitra Keluarga", "provider_id": "PRV-MK", "type": "hospital", "city": "Jakarta" },
  "diagnosis": { "icd_code": "J06.9", "description": "Infeksi saluran napas atas" },
  "procedures": [
    { "description": "Konsultasi dokter", "amount": 350000 },
    { "description": "Obat-obatan", "amount": 250000 }
  ],
  "total_amount": 600000,
  "claim_date": "2026-02-15",
  "service_date": "2026-02-14"
}
```
**Expected Result:** Score < 30, auto-approve

---

### Test Case 2: Klaim Mencurigakan (Expected: MEDIUM risk, manual review)

```json
{
  "claim_id": "TEST-002",
  "claim_type": "health",
  "policy_number": "POL-HK-NEW",
  "claimant": { "name": "Siti Rahmawati", "gender": "female", "date_of_birth": "1988-06-20" },
  "provider": { "name": "Klinik Sehat Jaya", "provider_id": "PRV-KSJ", "type": "clinic", "city": "Bekasi" },
  "diagnosis": { "icd_code": "M54.5", "description": "Nyeri punggung bawah" },
  "procedures": [
    { "description": "Fisioterapi 15 sesi", "amount": 22500000 },
    { "description": "MRI lumbal", "amount": 8000000 },
    { "description": "Obat-obatan", "amount": 5000000 }
  ],
  "total_amount": 35500000,
  "claim_date": "2026-02-15",
  "service_date": "2026-01-15"
}
```
**Expected Result:** Score 30-69, flags: biaya tinggi untuk nyeri punggung, 15 sesi fisioterapi, polis relatif baru

---

### Test Case 3: Klaim Fraud (Expected: HIGH risk, eskalasi)

```json
{
  "claim_id": "TEST-003",
  "claim_type": "health",
  "policy_number": "POL-HK-SUSPECT",
  "claimant": { "name": "Rudi Hartono", "gender": "male", "date_of_birth": "1975-12-10" },
  "provider": { "name": "RS Watchlist", "provider_id": "PRV-WL", "type": "hospital", "city": "Tangerang" },
  "diagnosis": { "icd_code": "N83.2", "description": "Kista ovarium" },
  "procedures": [
    { "description": "Operasi laparoskopi", "amount": 45000000 },
    { "description": "Rawat inap 7 hari", "amount": 35000000 },
    { "description": "Obat-obatan", "amount": 15000000 }
  ],
  "total_amount": 95000000,
  "claim_date": "2026-02-15",
  "service_date": "2026-02-01"
}
```
**Expected Result:** Score > 70, flags: gender mismatch (kista ovarium pada laki-laki), provider di watchlist, klaim bernilai tinggi

---

### Test Case 4: Fraud Asuransi Jiwa (Expected: HIGH risk)

```json
{
  "claim_id": "TEST-004",
  "claim_type": "life",
  "policy_number": "POL-AJ-NEW3M",
  "claimant": { "name": "Dewi Kusuma (ahli waris)", "gender": "female" },
  "insured": { "name": "Hendra Kusuma", "date_of_death": "2026-01-20" },
  "policy_age_months": 3,
  "total_amount": 2000000000,
  "claim_date": "2026-02-01",
  "cause_of_death": "Kecelakaan lalu lintas",
  "documents": [
    { "type": "death_certificate", "url": "..." },
    { "type": "police_report", "url": "..." }
  ]
}
```
**Expected Result:** Score > 80 (CRITICAL), flags: polis baru (3 bulan) + klaim Rp 2M, perlu investigasi mendalam

---

## 9. Referensi & Catatan Teknis

### 9.1 File Penting di Codebase

| File | Fungsi |
|---|---|
| `lib/workflow/types.ts` | Definisi node types dan schema |
| `lib/workflow/compiler.ts` | Kompilasi graph workflow |
| `lib/workflow/chatflow.ts` | Eksekusi chatflow mode |
| `app/api/dashboard/workflows/` | API routes workflow |
| `app/dashboard/workflows/` | UI workflow builder |
| `app/dashboard/workflows/_components/templates/` | Template workflow |

### 9.2 Template yang Sudah Ada

Template "Insurance Fraud Detection" sudah ada di sistem. Gunakan sebagai starting point dan enhance sesuai spesifikasi di dokumen ini.

### 9.3 Urutan Implementasi

| Fase | Deskripsi | Prioritas |
|---|---|---|
| **Fase 1** | Buat/enhance workflow dari template yang sudah ada | P0 |
| **Fase 2** | Buat 3 knowledge base (policy rules, fraud patterns, claim history) | P0 |
| **Fase 3** | Implementasi rule engine di CODE node | P0 |
| **Fase 4** | Tulis system prompts untuk LLM & Agent nodes | P1 |
| **Fase 5** | Setup risk scoring & routing logic | P1 |
| **Fase 6** | Buat test cases dan jalankan pengujian | P1 |
| **Fase 7** | Buat chatflow mode untuk investigator | P2 |
| **Fase 8** | Integrasi dengan sistem klaim eksternal (API) | P2 |
| **Fase 9** | Dashboard statistik fraud (chart, trend, dll) | P3 |

### 9.4 Referensi Industri

- [Accenture: Agentic AI Transforming Health Insurance Claims](https://insuranceblog.accenture.com/agentic-ai-transforming-claims-health-insurance)
- [Allianz Project Nemo: 7 AI Agents for Claims](https://www.allianz.com/en/mediacenter/news/articles/251103-when-the-storm-clears-so-should-the-claim-queue.html)
- [SciNSoft: 6 Guardrails for Insurance Fraud AI Agents](https://www.scnsoft.com/insurance/ai-agents-for-insurance-fraud-detection)
- [BMC: Healthcare Insurance Fraud Detection Using Data Mining](https://bmcmedinformdecismak.biomedcentral.com/articles/10.1186/s12911-024-02512-4)
- [n8n: Insurance Process Automation](https://katprotech.com/services/insurance-n8n-automation/)
- [n8n: Healthcare Claims Extraction Template](https://n8n.io/workflows/7849-extract-and-process-healthcare-claims-with-vlm-run-google-drive-and-sheets/)

---

> **Catatan:** Dokumen ini adalah blueprint implementasi. Semua node types yang dibutuhkan sudah tersedia di workflow engine. Tidak perlu membuat node type baru — cukup compose workflow dari node yang ada dan isi dengan konfigurasi yang tepat.
