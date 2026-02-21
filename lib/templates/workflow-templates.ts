import { NodeType } from "@/lib/workflow/types"
import type {
  WorkflowNodeData,
  TriggerNodeData,
  LlmNodeData,
  TransformNodeData,
  RagSearchNodeData,
  HumanInputNodeData,
  ParallelNodeData,
  MergeNodeData,
  SwitchNodeData,
  CodeNodeData,
  StreamOutputNodeData,
  OutputParserNodeData,
  TriggerConfig,
  WorkflowVariables,
} from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  mode?: "STANDARD" | "CHATFLOW"
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  trigger: TriggerConfig
  variables: WorkflowVariables
  tags: string[]
}

// ─── Template 1: Simple Chat Pipeline ─────────────────────
// Flow: Trigger → LLM → Transform

const simpleChatNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-1",
    type: NodeType.LLM,
    position: { x: 250, y: 150 },
    data: {
      label: "Chat LLM",
      description: "Process the user message with an LLM",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: "You are a helpful assistant. Answer the user's question concisely.",
      temperature: 0.7,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: NodeType.TRANSFORM,
    position: { x: 250, y: 300 },
    data: {
      label: "Format Response",
      description: "Transform the LLM output into the final response",
      nodeType: NodeType.TRANSFORM,
      expression: "return { response: input.text, timestamp: new Date().toISOString() };",
    } as TransformNodeData,
  },
]

const simpleChatEdges: Edge[] = [
  { id: "e-trigger-llm", source: "trigger-1", target: "llm-1" },
  { id: "e-llm-transform", source: "llm-1", target: "transform-1" },
]

// ─── Template 2: RAG Question Answering ───────────────────
// Flow: Trigger → RAG Search → LLM → Transform

const ragQANodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "rag-1",
    type: NodeType.RAG_SEARCH,
    position: { x: 250, y: 150 },
    data: {
      label: "Search Knowledge Base",
      description: "Retrieve relevant documents from the knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
      queryTemplate: "{{input.question}}",
    } as RagSearchNodeData,
  },
  {
    id: "llm-1",
    type: NodeType.LLM,
    position: { x: 250, y: 300 },
    data: {
      label: "Answer with Context",
      description: "Generate an answer using retrieved context",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt:
        "Answer the user's question based on the provided context. Cite sources when possible. If the context doesn't contain relevant information, say so.",
      temperature: 0.3,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: NodeType.TRANSFORM,
    position: { x: 250, y: 450 },
    data: {
      label: "Format Answer",
      description: "Structure the final answer with sources",
      nodeType: NodeType.TRANSFORM,
      expression:
        'return { answer: input.text, sources: input.context || [], answeredAt: new Date().toISOString() };',
    } as TransformNodeData,
  },
]

const ragQAEdges: Edge[] = [
  { id: "e-trigger-rag", source: "trigger-1", target: "rag-1" },
  { id: "e-rag-llm", source: "rag-1", target: "llm-1" },
  { id: "e-llm-transform", source: "llm-1", target: "transform-1" },
]

// ─── Template 3: Health Insurance Fraud Detection ────────
// Flow: Manual Trigger → Normalize → RAG (Policy Rules)
//       → Parallel(Narrative AI, Rule Engine, Pattern AI + RAG)
//       → Merge → Synthesize → Parse → Switch → Approve/Review/Escalate

const fraudDetectionNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-manual",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 400, y: 0 },
    data: {
      label: "Receive Claim",
      description: "Triggered from Claims dashboard when analyst clicks Analyze",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "transform-normalize",
    type: NodeType.TRANSFORM,
    position: { x: 400, y: 150 },
    data: {
      label: "Normalize Claim Data",
      description: "Structure incoming claim, customer, policy, and provider data",
      nodeType: NodeType.TRANSFORM,
      expression: `return {
  claim_number: input.claim_number || 'UNKNOWN',
  claim_type: input.claim_type || 'health',
  customer_name: input.customer_name || '',
  customer_gender: input.customer_gender || 'unknown',
  customer_id_number: input.customer_id_number || '',
  policy_number: input.policy_number || '',
  product_name: input.product_name || '',
  annual_limit: Number(input.annual_limit) || 0,
  remaining_limit: Number(input.remaining_limit) || 0,
  policy_start_date: input.policy_start_date || '',
  provider_name: input.provider_name || '',
  provider_city: input.provider_city || '',
  provider_on_watchlist: input.provider_on_watchlist || false,
  diagnosis_code: input.diagnosis_code || '',
  diagnosis_desc: input.diagnosis_desc || '',
  service_date: input.service_date || '',
  claim_date: input.claim_date || '',
  total_amount: Number(input.total_amount) || 0,
  procedures: input.procedures || [],
  claim_history: input.claim_history || [],
  history_count: (input.claim_history || []).length,
  receivedAt: new Date().toISOString()
};`,
    } as TransformNodeData,
  },
  {
    id: "parallel-split",
    type: NodeType.PARALLEL,
    position: { x: 400, y: 300 },
    data: {
      label: "Parallel Fraud Analysis",
      description: "Run narrative analysis, rule engine, and pattern matching simultaneously",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  // ── Branch 1: RAG Policy Rules → AI Narrative Analysis ──
  {
    id: "rag-policy-rules",
    type: NodeType.RAG_SEARCH,
    position: { x: 50, y: 450 },
    data: {
      label: "Lookup Policy Rules",
      description: "Search knowledge base for policy coverage rules, exclusions, and limits",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: ["horizon-life-kb"],
      topK: 5,
      queryTemplate: "{{input.product_name}} coverage rules exclusions limit for {{input.diagnosis_code}} {{input.diagnosis_desc}}",
    } as RagSearchNodeData,
  },
  {
    id: "llm-narrative",
    type: NodeType.LLM,
    position: { x: 50, y: 600 },
    data: {
      label: "Narrative Analysis",
      description: "AI analyzes claim data for inconsistencies and suspicious patterns",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah spesialis deteksi fraud asuransi kesehatan Indonesia. Analisis klaim secara OBJEKTIF dan PROPORSIONAL.

DATA KLAIM:
- Nomor: {{$variables.claim_number}}
- Tipe: {{$variables.claim_type}}
- Nasabah: {{$variables.customer_name}} ({{$variables.customer_gender}})
- Polis: {{$variables.policy_number}} — {{$variables.product_name}}
- Limit Tahunan: Rp {{$variables.annual_limit}} | Limit Tersisa: Rp {{$variables.remaining_limit}}
- Provider: {{$variables.provider_name}}, {{$variables.provider_city}} (Watchlist: {{$variables.provider_on_watchlist}})
- Diagnosis: {{$variables.diagnosis_code}} — {{$variables.diagnosis_desc}}
- Tanggal Layanan: {{$variables.service_date}}
- Total: Rp {{$variables.total_amount}}
- Jumlah Klaim Sebelumnya: {{$variables.history_count}}

RIWAYAT KLAIM SEBELUMNYA:
{{$variables.claim_history}}

KONTEKS ATURAN POLIS:
{{input.context}}

PANDUAN SCORING (PENTING — ikuti dengan ketat):
- 0-20: Klaim bersih, tidak ada temuan. Diagnosis wajar, biaya normal, riwayat bersih.
- 20-40: Ada anomali ringan (biaya sedikit di atas rata-rata, atau riwayat klaim agak sering tapi masih wajar).
- 40-60: Ada pola mencurigakan yang KONKRET: biaya jauh di atas benchmark, ATAU diagnosis berulang + provider sama, ATAU klaim mendekati limit. Perlu review manual.
- 60-80: Banyak indikator fraud kuat: provider watchlist + biaya tidak wajar, ATAU riwayat fraud score meningkat + pola berulang, ATAU klaim melebihi limit.
- 80-100: Fraud sangat jelas: bukti kuat multipel (watchlist + limit terlampaui + pola berulang + biaya sangat tidak wajar).

JANGAN beri skor >60 hanya karena biaya "tinggi" tanpa bukti fraud lain. Pertimbangkan konteks: rawat inap Rp 15-30 juta WAJAR untuk prosedur tertentu.

Respond ONLY with JSON:
{
  "narrative_score": <0-100>,
  "findings": [
    { "issue": "deskripsi temuan", "severity": "LOW|MEDIUM|HIGH|CRITICAL" }
  ],
  "summary": "Ringkasan 2-3 kalimat dalam bahasa Indonesia"
}`,
      temperature: 0.1,
    } as LlmNodeData,
  },
  // ── Branch 2: Rule Engine (Code) ──
  {
    id: "code-rules",
    type: NodeType.CODE,
    position: { x: 400, y: 450 },
    data: {
      label: "Rule Engine",
      description: "Apply business rules: duplicate check, limit validation, gender mismatch, frequency, watchlist",
      nodeType: NodeType.CODE,
      code: `var score = 0;
var flags = [];
var history = input.claim_history || [];

// R1: PROVIDER_WATCHLIST — provider ada di daftar hitam
if (input.provider_on_watchlist) {
  score += 30;
  flags.push({ rule: 'PROVIDER_WATCHLIST', severity: 'HIGH', message: 'Provider ' + input.provider_name + ' ada di watchlist fraud' });
}

// R2: LIMIT_EXCEEDED — klaim melebihi sisa limit polis
if (input.total_amount > input.remaining_limit) {
  score += 25;
  flags.push({ rule: 'LIMIT_EXCEEDED', severity: 'HIGH', message: 'Klaim Rp ' + input.total_amount.toLocaleString() + ' melebihi sisa limit Rp ' + input.remaining_limit.toLocaleString() });
}

// R3: CUMULATIVE_HIGH — total kumulatif riwayat + klaim ini > 60% annual limit
if (history.length > 0 && input.annual_limit) {
  var totalHistAmount = history.reduce(function(sum, h) { return sum + (h.total_amount || 0); }, 0);
  var cumulative = totalHistAmount + input.total_amount;
  var usageRatio = cumulative / input.annual_limit;
  if (usageRatio > 0.8) {
    score += 15;
    flags.push({ rule: 'CUMULATIVE_HIGH', severity: 'MEDIUM', message: 'Utilisasi polis ' + Math.round(usageRatio * 100) + '% (Rp ' + Math.round(cumulative/1000000) + ' jt dari ' + Math.round(input.annual_limit/1000000) + ' jt)' });
  } else if (usageRatio > 0.6) {
    score += 8;
    flags.push({ rule: 'CUMULATIVE_HIGH', severity: 'LOW', message: 'Utilisasi polis ' + Math.round(usageRatio * 100) + '% — perlu perhatian' });
  }
}

// R4: HF-04 — klaim duplikat (tanggal + provider sama)
var dupes = history.filter(function(h) {
  return h.service_date === input.service_date && h.provider_id === input.provider_id;
});
if (dupes.length > 0) {
  score += 30;
  flags.push({ rule: 'HF-04', severity: 'HIGH', message: 'Klaim duplikat: tanggal dan provider sama dengan klaim ' + dupes[0].claim_number });
}

// R5: HF-10 — gender mismatch dengan diagnosis
var femaleOnly = ['O80', 'O82', 'N83', 'C56', 'N80', 'N81'];
var maleOnly = ['N40', 'C61', 'N41', 'N42'];
var icd = input.diagnosis_code || '';
if (input.customer_gender === 'male' && femaleOnly.some(function(c) { return icd.startsWith(c); })) {
  score += 40;
  flags.push({ rule: 'HF-10', severity: 'CRITICAL', message: 'Diagnosis ' + icd + ' khusus perempuan pada pasien laki-laki' });
}
if (input.customer_gender === 'female' && maleOnly.some(function(c) { return icd.startsWith(c); })) {
  score += 40;
  flags.push({ rule: 'HF-10', severity: 'CRITICAL', message: 'Diagnosis ' + icd + ' khusus laki-laki pada pasien perempuan' });
}

// R6: REPEATED_DIAGNOSIS — diagnosis berulang >60% dari riwayat
if (history.length >= 3) {
  var sameDiag = history.filter(function(h) { return h.diagnosis_code === input.diagnosis_code; });
  var diagRatio = sameDiag.length / history.length;
  if (diagRatio > 0.8) {
    score += 15;
    flags.push({ rule: 'REPEATED_DIAGNOSIS', severity: 'MEDIUM', message: Math.round(diagRatio * 100) + '% riwayat klaim diagnosis sama (' + input.diagnosis_code + ') — indikasi churning' });
  } else if (diagRatio > 0.6) {
    score += 8;
    flags.push({ rule: 'REPEATED_DIAGNOSIS', severity: 'LOW', message: Math.round(diagRatio * 100) + '% riwayat klaim diagnosis sama (' + input.diagnosis_code + ')' });
  }
}

// R7: HF-06 — konsentrasi provider dalam riwayat >80%
if (history.length >= 3) {
  var providerCounts = {};
  history.forEach(function(h) {
    providerCounts[h.provider_name] = (providerCounts[h.provider_name] || 0) + 1;
  });
  var maxProvider = '';
  var maxCount = 0;
  Object.keys(providerCounts).forEach(function(p) {
    if (providerCounts[p] > maxCount) { maxCount = providerCounts[p]; maxProvider = p; }
  });
  var provRatio = maxCount / history.length;
  if (provRatio > 0.8) {
    score += 10;
    flags.push({ rule: 'HF-06', severity: 'MEDIUM', message: Math.round(provRatio * 100) + '% klaim ke provider ' + maxProvider + ' — potensi kolusi' });
  }
}

// R8: HF-07 — frekuensi klaim tinggi (30 hari & 180 hari)
var now = new Date(input.claim_date);
var d30 = new Date(now); d30.setDate(d30.getDate() - 30);
var d180 = new Date(now); d180.setDate(d180.getDate() - 180);
var recent30 = history.filter(function(h) { return new Date(h.claim_date) >= d30; });
var recent180 = history.filter(function(h) { return new Date(h.claim_date) >= d180; });
if (recent30.length > 10) {
  score += 20;
  flags.push({ rule: 'HF-07', severity: 'HIGH', message: recent30.length + ' klaim dalam 30 hari — sangat tidak wajar' });
} else if (recent30.length > 3) {
  score += 10;
  flags.push({ rule: 'HF-07', severity: 'MEDIUM', message: recent30.length + ' klaim dalam 30 hari' });
}
if (recent180.length > 4) {
  score += 10;
  flags.push({ rule: 'HF-07b', severity: 'MEDIUM', message: recent180.length + ' klaim dalam 6 bulan — frekuensi tinggi' });
}

// R9: HIGH_VALUE — klaim bernilai tinggi
var valThreshold = input.claim_type === 'health' ? 50000000 : 500000000;
if (input.total_amount > valThreshold) {
  score += 15;
  flags.push({ rule: 'HIGH_VALUE', severity: 'MEDIUM', message: 'Klaim bernilai tinggi: Rp ' + Math.round(input.total_amount/1000000) + ' juta' });
} else if (input.total_amount > valThreshold * 0.5) {
  score += 5;
  flags.push({ rule: 'HIGH_VALUE', severity: 'LOW', message: 'Klaim cukup besar: Rp ' + Math.round(input.total_amount/1000000) + ' juta' });
}

// R10: ESCALATION_TREND — riwayat skor fraud yang meningkat
// history sorted DESC (newest first); slice(0,3) = 3 terbaru, reverse = kronologis
var scoredHistory = history.filter(function(h) { return h.fraud_score !== undefined && h.fraud_score !== null; });
if (scoredHistory.length >= 3) {
  var recentScores = scoredHistory.slice(0, 3).reverse();
  var increasing = recentScores.every(function(h, i) {
    return i === 0 || h.fraud_score >= recentScores[i-1].fraud_score;
  });
  var avgScore = recentScores.reduce(function(s, h) { return s + h.fraud_score; }, 0) / recentScores.length;
  if (increasing && avgScore > 50) {
    score += 15;
    flags.push({ rule: 'ESCALATION_TREND', severity: 'HIGH', message: 'Tren skor fraud meningkat (rata-rata ' + Math.round(avgScore) + ')' });
  }
}

score = Math.min(score, 100);
var hasCritical = flags.some(function(f) { return f.severity === 'CRITICAL'; });
if (hasCritical && score < 80) score = 80;

return { rule_score: score, flags: flags, total_flags: flags.length, rules_evaluated: 10 };`,
      runtime: "javascript",
    } as CodeNodeData,
  },
  // ── Branch 3: Pattern Analysis with RAG ──
  {
    id: "rag-fraud-patterns",
    type: NodeType.RAG_SEARCH,
    position: { x: 750, y: 450 },
    data: {
      label: "Lookup Fraud Patterns",
      description: "Search knowledge base for known fraud patterns and medical cost benchmarks",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: ["horizon-life-kb"],
      topK: 5,
      queryTemplate: "fraud patterns for {{input.diagnosis_desc}} {{input.provider_city}} health insurance claim",
    } as RagSearchNodeData,
  },
  {
    id: "llm-patterns",
    type: NodeType.LLM,
    position: { x: 750, y: 600 },
    data: {
      label: "Pattern Analysis",
      description: "Compare claim against known fraud patterns and cost benchmarks from knowledge base",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah sistem pendeteksi pola fraud asuransi kesehatan Indonesia. Bandingkan klaim dengan pola fraud dan benchmark biaya secara OBJEKTIF.

DATA KLAIM:
- Nomor: {{$variables.claim_number}}
- Nasabah: {{$variables.customer_name}} ({{$variables.customer_gender}})
- Provider: {{$variables.provider_name}}, {{$variables.provider_city}} (Watchlist: {{$variables.provider_on_watchlist}})
- Diagnosis: {{$variables.diagnosis_code}} — {{$variables.diagnosis_desc}}
- Total: Rp {{$variables.total_amount}}
- Limit Tahunan: Rp {{$variables.annual_limit}} | Limit Tersisa: Rp {{$variables.remaining_limit}}
- Jumlah Klaim Sebelumnya: {{$variables.history_count}}

RIWAYAT KLAIM SEBELUMNYA:
{{$variables.claim_history}}

KONTEKS POLA FRAUD & BENCHMARK:
{{input.context}}

Analisis:
1. Apakah biaya klaim wajar dibanding benchmark untuk diagnosis dan kota tersebut?
2. Apakah ada pola yang cocok dengan modus fraud yang diketahui (HF-01 s/d HF-10)?
3. Apakah riwayat klaim menunjukkan pola mencurigakan?
4. Apakah ada indikasi kolusi dengan provider?

PANDUAN SCORING (PENTING — ikuti dengan ketat):
- 0-20: Tidak ada pola fraud. Biaya wajar sesuai benchmark. Riwayat bersih.
- 20-40: Ada 1 pola minor (biaya sedikit di atas benchmark, atau diagnosis umum yang sering diklaim).
- 40-60: Ada 1-2 pola fraud teridentifikasi KONKRET. Biaya di atas benchmark tapi bukan ekstrem. Riwayat menunjukkan tren mencurigakan.
- 60-80: Ada 2-3 pola fraud kuat. Provider watchlist + biaya tidak wajar, ATAU pola berulang dengan bukti kuat dari riwayat.
- 80-100: Banyak pola fraud sekaligus dengan bukti kuat (watchlist + biaya sangat tidak wajar + riwayat fraud + kolusi provider).

JANGAN beri skor >60 hanya karena biaya "tinggi". Pertimbangkan: prosedur medis memang mahal. Skor tinggi harus didukung BUKTI KONKRET dari pola dan riwayat.

Respond ONLY with JSON:
{
  "pattern_score": <0-100>,
  "matched_patterns": ["kode pola yang cocok, misal HF-01, HF-03"],
  "cost_comparison": "wajar|tinggi|sangat_tinggi",
  "summary": "Ringkasan temuan pola dalam bahasa Indonesia",
  "recommended_checks": ["langkah verifikasi yang disarankan"]
}`,
      temperature: 0.1,
    } as LlmNodeData,
  },
  // ── Merge + Synthesize ──
  {
    id: "merge-results",
    type: NodeType.MERGE,
    position: { x: 400, y: 750 },
    data: {
      label: "Merge Analysis Results",
      description: "Combine results from all three parallel fraud analysis branches",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "llm-synthesize",
    type: NodeType.LLM,
    position: { x: 400, y: 900 },
    data: {
      label: "Synthesize Assessment",
      description: "Produce final weighted risk score and recommendation",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah analis fraud senior asuransi yang menghasilkan penilaian akhir.

Kamu menerima hasil gabungan dari 3 metode analisis:
1. Narrative Analysis (25% bobot) - analisis AI terhadap data klaim
2. Rule Engine (40% bobot) - aturan bisnis dan red flags
3. Pattern Analysis (35% bobot) - pencocokan pola fraud dan benchmark biaya

Hitung skor risiko keseluruhan berdasarkan bobot di atas.

Respond ONLY with valid JSON:
{
  "overall_risk_score": <0-100>,
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "confidence": <0-100>,
  "summary": "Ringkasan 2-3 kalimat dalam bahasa Indonesia",
  "key_findings": ["5 temuan utama dalam bahasa Indonesia"],
  "recommendation": "AUTO_APPROVE" | "REVIEW" | "ESCALATE"
}

Threshold risk level: LOW < 30, MEDIUM 30-69, HIGH >= 70`,
      temperature: 0.2,
    } as LlmNodeData,
  },
  {
    id: "transform-parse",
    type: NodeType.TRANSFORM,
    position: { x: 400, y: 1050 },
    data: {
      label: "Parse Assessment",
      description: "Parse LLM JSON response into structured object",
      nodeType: NodeType.TRANSFORM,
      expression: `try {
  var text = input.text || '';
  var jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
  var parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
  return {
    risk_level: (parsed.risk_level || 'MEDIUM').toUpperCase(),
    overall_risk_score: parsed.overall_risk_score || 50,
    confidence: parsed.confidence || 50,
    summary: parsed.summary || '',
    key_findings: parsed.key_findings || [],
    recommendation: parsed.recommendation || 'REVIEW'
  };
} catch(e) {
  return { risk_level: 'MEDIUM', overall_risk_score: 50, confidence: 30, summary: text || 'Parse error', key_findings: [], recommendation: 'REVIEW' };
}`,
    } as TransformNodeData,
  },
  // ── Risk routing ──
  {
    id: "switch-risk",
    type: NodeType.SWITCH,
    position: { x: 400, y: 1200 },
    data: {
      label: "Route by Risk Level",
      description: "Route claim based on fraud risk level",
      nodeType: NodeType.SWITCH,
      switchOn: "input.risk_level",
      cases: [
        { id: "low", value: "LOW", label: "Low Risk → Auto Approve" },
        { id: "medium", value: "MEDIUM", label: "Medium → Review" },
        { id: "high", value: "HIGH", label: "High → Escalate" },
      ],
    } as SwitchNodeData,
  },
  {
    id: "transform-approve",
    type: NodeType.TRANSFORM,
    position: { x: 80, y: 1350 },
    data: {
      label: "Auto-Approve",
      description: "Auto-approve low risk claims",
      nodeType: NodeType.TRANSFORM,
      expression: `return {
  decision: 'AUTO_APPROVED',
  decidedBy: 'SYSTEM',
  status: 'AUTO_APPROVED',
  risk_level: input.risk_level,
  risk_score: input.overall_risk_score,
  summary: input.summary,
  key_findings: input.key_findings,
  decidedAt: new Date().toISOString()
};`,
    } as TransformNodeData,
  },
  {
    id: "approval-analyst",
    type: NodeType.APPROVAL,
    position: { x: 400, y: 1350 },
    data: {
      label: "Analyst Review",
      description: "Route to analyst for manual review of medium-risk claim",
      nodeType: NodeType.APPROVAL,
      prompt: "Klaim ini terdeteksi MEDIUM RISK oleh sistem fraud detection. Silakan review temuan analisis dan approve/reject klaim.",
    } as HumanInputNodeData,
  },
  {
    id: "handoff-escalate",
    type: NodeType.HANDOFF,
    position: { x: 720, y: 1350 },
    data: {
      label: "Escalate to SIU",
      description: "Escalate high-risk claim to Special Investigations Unit",
      nodeType: NodeType.HANDOFF,
      prompt: "KLAIM HIGH RISK terdeteksi. Klaim ini memiliki multiple indikator fraud dan memerlukan investigasi mendalam oleh SIU. Klaim DIBLOKIR menunggu investigasi.",
    } as HumanInputNodeData,
  },
]

const fraudDetectionEdges: Edge[] = [
  { id: "e-trigger-normalize",    source: "trigger-manual",       target: "transform-normalize" },
  { id: "e-normalize-parallel",   source: "transform-normalize",  target: "parallel-split" },
  // Branch 1: RAG policy rules → LLM narrative
  { id: "e-parallel-rag-policy",  source: "parallel-split",       target: "rag-policy-rules" },
  { id: "e-rag-policy-narrative", source: "rag-policy-rules",     target: "llm-narrative" },
  // Branch 2: Code rules (gets claim data directly)
  { id: "e-parallel-rules",      source: "parallel-split",       target: "code-rules" },
  // Branch 3: RAG fraud patterns → LLM patterns
  { id: "e-parallel-rag-fraud",   source: "parallel-split",       target: "rag-fraud-patterns" },
  { id: "e-rag-fraud-patterns",   source: "rag-fraud-patterns",   target: "llm-patterns" },
  { id: "e-narrative-merge",    source: "llm-narrative",        target: "merge-results" },
  { id: "e-rules-merge",        source: "code-rules",           target: "merge-results" },
  { id: "e-patterns-merge",     source: "llm-patterns",         target: "merge-results" },
  { id: "e-merge-synthesize",   source: "merge-results",        target: "llm-synthesize" },
  { id: "e-synthesize-parse",   source: "llm-synthesize",       target: "transform-parse" },
  { id: "e-parse-switch",       source: "transform-parse",      target: "switch-risk" },
  { id: "e-switch-approve",     source: "switch-risk", sourceHandle: "low",    target: "transform-approve" },
  { id: "e-switch-review",      source: "switch-risk", sourceHandle: "medium", target: "approval-analyst" },
  { id: "e-switch-escalate",    source: "switch-risk", sourceHandle: "high",   target: "handoff-escalate" },
]

// ─── Template 4: Customer Service Chatflow ────────────────
// Flow: Trigger → LLM (classify) → Output Parser → Switch
//       ├─ product  → RAG Products   → Stream (Product Advisor)
//       ├─ claim    → RAG Claims     → Stream (Claim Info)
//       ├─ complaint→ Handoff (Agent)
//       └─ default  → (no Stream Output — falls back to normal agent)

const customerServiceNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 350, y: 0 },
    data: {
      label: "Chat Message",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: NodeType.LLM,
    position: { x: 350, y: 150 },
    data: {
      label: "Classify Intent",
      description: "Classify the customer message into product inquiry, claim question, or complaint",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `You are an intent classifier for an insurance company customer service chatbot.

Classify the customer's message into one of these categories:
- "product": Questions about insurance products, coverage, premiums, benefits, how to buy
- "claim": Questions about claims, claim status, claim process, required documents
- "complaint": Complaints, dissatisfaction, escalation requests, demands to speak with human
- "general": Greetings, company info, office locations, working hours, other

Respond with JSON only: { "intent": "product" | "claim" | "complaint" | "general" }`,
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "parser-intent",
    type: NodeType.OUTPUT_PARSER,
    position: { x: 350, y: 300 },
    data: {
      label: "Parse Intent",
      description: "Parse LLM classification JSON into structured data",
      nodeType: NodeType.OUTPUT_PARSER,
      strict: false,
    } as OutputParserNodeData,
  },
  {
    id: "switch-intent",
    type: NodeType.SWITCH,
    position: { x: 350, y: 450 },
    data: {
      label: "Route by Intent",
      description: "Route to the appropriate handler based on customer intent",
      nodeType: NodeType.SWITCH,
      switchOn: "input.intent",
      cases: [
        { id: "product", value: "product", label: "Product" },
        { id: "claim", value: "claim", label: "Claim" },
        { id: "complaint", value: "complaint", label: "Complaint" },
      ],
      defaultCase: "general",
    } as SwitchNodeData,
  },
  // ── Product branch: RAG → Stream ──
  {
    id: "rag-products",
    type: NodeType.RAG_SEARCH,
    position: { x: 50, y: 600 },
    data: {
      label: "Search Products KB",
      description: "Search insurance products knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "stream-product",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 50, y: 750 },
    data: {
      label: "Product Advisor",
      description: "Answer product questions with KB context",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah customer service virtual perusahaan asuransi. Jawab pertanyaan nasabah tentang produk asuransi berdasarkan konteks yang diberikan.

Panduan:
- Jelaskan fitur dan manfaat produk dengan bahasa yang mudah dipahami
- Sebutkan persyaratan dan ketentuan penting
- Jika ditanya harga/premi, berikan kisaran jika ada di konteks, atau arahkan ke agent untuk penawaran personal
- Selalu jawab dalam bahasa yang sama dengan pertanyaan nasabah
- Jika informasi tidak ada di konteks, katakan "Untuk informasi lebih detail, silakan hubungi call center kami."`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
  // ── Claim branch: RAG → Stream ──
  {
    id: "rag-claims",
    type: NodeType.RAG_SEARCH,
    position: { x: 300, y: 600 },
    data: {
      label: "Search Claims KB",
      description: "Search claims procedures knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "stream-claim",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 300, y: 750 },
    data: {
      label: "Claim Info",
      description: "Answer claim-related questions with KB context",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah customer service virtual perusahaan asuransi yang membantu nasabah terkait klaim.

Panduan:
- Jelaskan proses klaim langkah demi langkah
- Sebutkan dokumen yang diperlukan untuk setiap jenis klaim
- Berikan estimasi waktu proses jika ada di konteks
- Untuk cek status klaim, minta nomor klaim dan arahkan ke sistem tracking
- Selalu jawab dalam bahasa yang sama dengan pertanyaan nasabah`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
  // ── Complaint branch: Handoff ──
  {
    id: "handoff-complaint",
    type: NodeType.HANDOFF,
    position: { x: 550, y: 600 },
    data: {
      label: "Escalate to Agent",
      description: "Transfer complaint to human customer service agent",
      nodeType: NodeType.HANDOFF,
      prompt: "Nasabah mengajukan keluhan dan membutuhkan penanganan langsung dari agent. Silakan review percakapan sebelumnya.",
    } as HumanInputNodeData,
  },
  // ── Default branch: no Stream Output → fallback to normal agent ──
]

const customerServiceEdges: Edge[] = [
  { id: "e-trigger-classify",   source: "trigger-1",     target: "llm-classify" },
  { id: "e-classify-parser",    source: "llm-classify",  target: "parser-intent" },
  { id: "e-parser-switch",      source: "parser-intent",  target: "switch-intent" },
  { id: "e-switch-product",     source: "switch-intent", sourceHandle: "product",   target: "rag-products" },
  { id: "e-rag-product-stream", source: "rag-products",  target: "stream-product" },
  { id: "e-switch-claim",       source: "switch-intent", sourceHandle: "claim",     target: "rag-claims" },
  { id: "e-rag-claim-stream",   source: "rag-claims",    target: "stream-claim" },
  { id: "e-switch-complaint",   source: "switch-intent", sourceHandle: "complaint", target: "handoff-complaint" },
  // Default branch: no edge — chatflow falls back to normal agent processing
]

// ─── Template 5: Agent Policy Assistant ───────────────────
// Flow: Trigger → Parallel(RAG Policy, RAG Underwriting) → Merge → Stream

const agentPolicyNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 300, y: 0 },
    data: {
      label: "Agent Question",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "parallel-search",
    type: NodeType.PARALLEL,
    position: { x: 300, y: 150 },
    data: {
      label: "Parallel KB Search",
      description: "Search policy and underwriting knowledge bases simultaneously",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  {
    id: "rag-policy",
    type: NodeType.RAG_SEARCH,
    position: { x: 100, y: 300 },
    data: {
      label: "Search Policy KB",
      description: "Search policy terms, coverage details, exclusions",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "rag-underwriting",
    type: NodeType.RAG_SEARCH,
    position: { x: 500, y: 300 },
    data: {
      label: "Search Underwriting KB",
      description: "Search underwriting guidelines, risk criteria, approval rules",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "merge-results",
    type: NodeType.MERGE,
    position: { x: 300, y: 450 },
    data: {
      label: "Merge Results",
      description: "Combine results from both knowledge bases",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "stream-answer",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 300, y: 600 },
    data: {
      label: "Policy Advisor",
      description: "Answer agent's question using combined KB context",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah asisten internal untuk agent asuransi. Tugasmu membantu agent mencari informasi polis, coverage, dan aturan underwriting.

Panduan:
- Jawab berdasarkan konteks dari knowledge base yang diberikan
- Gunakan format struktural: tabel, bullet points, heading jika perlu
- Jika ada ketentuan underwriting yang relevan, selalu sertakan
- Sebutkan sumber/dokumen referensi jika tersedia di konteks
- Jika informasi tidak ditemukan, katakan secara eksplisit dan sarankan untuk cek manual
- Gunakan bahasa yang profesional dan to-the-point
- Jawab dalam bahasa yang sama dengan pertanyaan`,
      temperature: 0.3,
    } as StreamOutputNodeData,
  },
]

const agentPolicyEdges: Edge[] = [
  { id: "e-trigger-parallel",     source: "trigger-1",       target: "parallel-search" },
  { id: "e-parallel-policy",      source: "parallel-search", target: "rag-policy" },
  { id: "e-parallel-underwriting", source: "parallel-search", target: "rag-underwriting" },
  { id: "e-policy-merge",         source: "rag-policy",      target: "merge-results" },
  { id: "e-underwriting-merge",   source: "rag-underwriting", target: "merge-results" },
  { id: "e-merge-stream",         source: "merge-results",   target: "stream-answer" },
]

// ─── Template 6: Claim Filing Guide ──────────────────────
// Flow: Trigger → LLM (classify) → Output Parser → Switch
//       ├─ inquiry     → RAG Procedures → Stream (Explain Process)
//       ├─ file_new    → RAG Documents  → Stream (Guide Filing)
//       ├─ check_status→ Stream (Claim Status)
//       └─ general     → RAG Claims     → Stream (General Help)

const claimFilingNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 350, y: 0 },
    data: {
      label: "Chat Message",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: NodeType.LLM,
    position: { x: 350, y: 150 },
    data: {
      label: "Classify Need",
      description: "Determine if customer wants to inquire about, file, or track a claim",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `You are a claim intent classifier for an insurance company.

Classify the customer's message into one of these categories:
- "inquiry": Asking about claim process, requirements, eligibility, timelines
- "file_new": Wants to file/submit a new claim, reporting an incident
- "check_status": Wants to check existing claim status, tracking
- "general": Other claim-related questions

Respond with JSON only: { "need": "inquiry" | "file_new" | "check_status" | "general" }`,
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "parser-need",
    type: NodeType.OUTPUT_PARSER,
    position: { x: 350, y: 300 },
    data: {
      label: "Parse Need",
      description: "Parse LLM classification JSON into structured data",
      nodeType: NodeType.OUTPUT_PARSER,
      strict: false,
    } as OutputParserNodeData,
  },
  {
    id: "switch-need",
    type: NodeType.SWITCH,
    position: { x: 350, y: 450 },
    data: {
      label: "Route by Need",
      description: "Route to the appropriate claim handler",
      nodeType: NodeType.SWITCH,
      switchOn: "input.need",
      cases: [
        { id: "inquiry", value: "inquiry", label: "Inquiry" },
        { id: "file_new", value: "file_new", label: "File New" },
        { id: "check_status", value: "check_status", label: "Check Status" },
      ],
      defaultCase: "general",
    } as SwitchNodeData,
  },
  // ── Inquiry branch: RAG → Stream ──
  {
    id: "rag-procedures",
    type: NodeType.RAG_SEARCH,
    position: { x: 50, y: 600 },
    data: {
      label: "Search Procedures",
      description: "Search claim procedures and eligibility requirements",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "stream-inquiry",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 50, y: 750 },
    data: {
      label: "Explain Process",
      description: "Explain claim process and requirements",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah pemandu klaim asuransi. Jelaskan proses klaim berdasarkan konteks yang diberikan.

Panduan:
- Jelaskan langkah-langkah proses klaim secara berurutan
- Sebutkan dokumen yang diperlukan
- Berikan estimasi waktu proses jika ada
- Jelaskan syarat dan ketentuan yang berlaku
- Gunakan bahasa yang mudah dipahami nasabah awam
- Jawab dalam bahasa yang sama dengan pertanyaan nasabah`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
  // ── File new branch: RAG → Stream ──
  {
    id: "rag-documents",
    type: NodeType.RAG_SEARCH,
    position: { x: 300, y: 600 },
    data: {
      label: "Search Documents KB",
      description: "Search required documents and filing forms",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "stream-filing",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 300, y: 750 },
    data: {
      label: "Guide Filing",
      description: "Guide customer through claim filing step by step",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah pemandu pengajuan klaim asuransi. Bantu nasabah mengajukan klaim baru langkah demi langkah.

Panduan:
- Tanyakan informasi satu per satu, jangan sekaligus
- Urutan: (1) Nomor polis, (2) Jenis insiden, (3) Tanggal kejadian, (4) Kronologi singkat, (5) Dokumen pendukung
- Jelaskan dokumen apa saja yang perlu disiapkan berdasarkan jenis klaim
- Berikan instruksi cara mengunggah atau mengirim dokumen
- Jika nasabah sudah memberikan info, langsung lanjut ke step berikutnya
- Jawab dalam bahasa yang sama dengan pertanyaan nasabah`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
  // ── Check status branch: Stream (no RAG) ──
  {
    id: "stream-status",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 550, y: 600 },
    data: {
      label: "Claim Status",
      description: "Help customer check their claim status",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah asisten tracking klaim asuransi. Bantu nasabah mengecek status klaim mereka.

Panduan:
- Minta nomor klaim jika belum diberikan
- Jelaskan bahwa status klaim bisa dicek via: (1) Portal nasabah online, (2) Call center, (3) Email ke claims@company.com
- Jelaskan tahapan proses klaim: Diterima → Verifikasi → Penilaian → Persetujuan → Pembayaran
- Berikan estimasi waktu untuk setiap tahapan
- Jawab dalam bahasa yang sama dengan pertanyaan nasabah`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
  // ── Default branch: RAG → Stream ──
  {
    id: "rag-general-claims",
    type: NodeType.RAG_SEARCH,
    position: { x: 800, y: 600 },
    data: {
      label: "Search Claims KB",
      description: "Search general claims knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "stream-general-claim",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 800, y: 750 },
    data: {
      label: "General Claim Help",
      description: "Handle general claim questions",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah asisten klaim asuransi. Jawab pertanyaan umum nasabah terkait klaim berdasarkan konteks yang diberikan.

Panduan:
- Jawab dengan jelas dan ringkas
- Arahkan nasabah ke proses yang tepat jika diperlukan
- Jawab dalam bahasa yang sama dengan pertanyaan nasabah`,
      temperature: 0.5,
    } as StreamOutputNodeData,
  },
]

const claimFilingEdges: Edge[] = [
  { id: "e-trigger-classify",      source: "trigger-1",        target: "llm-classify" },
  { id: "e-classify-parser",       source: "llm-classify",     target: "parser-need" },
  { id: "e-parser-switch",         source: "parser-need",      target: "switch-need" },
  { id: "e-switch-inquiry",        source: "switch-need", sourceHandle: "inquiry",      target: "rag-procedures" },
  { id: "e-rag-procedures-stream", source: "rag-procedures",   target: "stream-inquiry" },
  { id: "e-switch-file",           source: "switch-need", sourceHandle: "file_new",     target: "rag-documents" },
  { id: "e-rag-documents-stream",  source: "rag-documents",    target: "stream-filing" },
  { id: "e-switch-status",         source: "switch-need", sourceHandle: "check_status", target: "stream-status" },
  { id: "e-switch-general",        source: "switch-need", sourceHandle: "default",      target: "rag-general-claims" },
  { id: "e-rag-general-stream",    source: "rag-general-claims", target: "stream-general-claim" },
]

// ─── Template 7: Fraud Investigation Chatflow ────────────
// Flow: Trigger → Parallel(RAG Policy, RAG Fraud, RAG Benchmark) → Merge → Stream

const fraudInvestigationNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 350, y: 0 },
    data: {
      label: "Investigator Question",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "parallel-search",
    type: NodeType.PARALLEL,
    position: { x: 350, y: 150 },
    data: {
      label: "Parallel KB Search",
      description: "Search policy rules, fraud patterns, and medical benchmarks simultaneously",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  {
    id: "rag-policy",
    type: NodeType.RAG_SEARCH,
    position: { x: 50, y: 300 },
    data: {
      label: "Policy Rules KB",
      description: "Search policy coverage, exclusions, and limits",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: ["horizon-life-kb"],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "rag-fraud",
    type: NodeType.RAG_SEARCH,
    position: { x: 350, y: 300 },
    data: {
      label: "Fraud Patterns KB",
      description: "Search known fraud patterns and indicators",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: ["horizon-life-kb"],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "rag-benchmark",
    type: NodeType.RAG_SEARCH,
    position: { x: 650, y: 300 },
    data: {
      label: "Medical Benchmark KB",
      description: "Search medical cost benchmarks per diagnosis per city",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: ["horizon-life-kb"],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "merge-results",
    type: NodeType.MERGE,
    position: { x: 350, y: 450 },
    data: {
      label: "Merge KB Results",
      description: "Combine results from all three knowledge bases",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "stream-answer",
    type: NodeType.STREAM_OUTPUT,
    position: { x: 350, y: 600 },
    data: {
      label: "Investigation Assistant",
      description: "Answer investigator questions using combined KB context and claim data",
      nodeType: NodeType.STREAM_OUTPUT,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `Kamu adalah rekan kerja senior di tim investigasi fraud asuransi kesehatan. Kamu berpengalaman dan bisa menjelaskan hal teknis dengan bahasa sehari-hari yang mudah dipahami.

KONTEKS KLAIM YANG SEDANG DIINVESTIGASI:
{{system_context}}

GAYA KOMUNIKASI:
- Jawab seperti ngobrol dengan rekan kerja, bukan menulis laporan formal
- Langsung ke poin penting, tidak perlu numbering panjang atau tabel kecuali diminta
- Boleh kasih opini profesional ("menurut saya...", "ini wajar karena...", "yang perlu diwaspadai...")
- Gunakan angka dan fakta dari knowledge base tapi sampaikan secara natural dalam kalimat
- Jangan pakai heading/subheading berlebihan — cukup paragraf pendek yang mengalir
- Kalau ada yang mencurigakan, jelaskan kenapa dengan bahasa yang jelas
- Kalau klaim wajar, bilang langsung tanpa bertele-tele
- Bahasa Indonesia santai tapi tetap profesional (bukan bahasa gaul)

KEMAMPUANMU:
- Cek apakah klaim sesuai aturan polis (coverage, exclusion, waiting period)
- Identifikasi pola fraud dari knowledge base
- Bandingkan biaya klaim dengan benchmark medis
- Analisis riwayat klaim untuk pola mencurigakan
- Kasih rekomendasi langkah selanjutnya

CONTOH TONE YANG BENAR:
"Skor 13 untuk klaim ini sudah tepat. Rp 600.000 untuk flu rawat jalan di RS Mitra Keluarga itu wajar — benchmark-nya Rp 200.000-800.000 untuk area Jabodetabek. Tidak ada red flag dari sisi biaya maupun frekuensi."

CONTOH TONE YANG SALAH:
"## Analisis Klaim\\n### 1. Evaluasi Biaya\\n| Parameter | Nilai |\\n..."`,
      temperature: 0.3,
    } as StreamOutputNodeData,
  },
]

const fraudInvestigationEdges: Edge[] = [
  { id: "e-trigger-parallel",   source: "trigger-1",       target: "parallel-search" },
  { id: "e-parallel-policy",    source: "parallel-search",  target: "rag-policy" },
  { id: "e-parallel-fraud",     source: "parallel-search",  target: "rag-fraud" },
  { id: "e-parallel-benchmark", source: "parallel-search",  target: "rag-benchmark" },
  { id: "e-policy-merge",       source: "rag-policy",       target: "merge-results" },
  { id: "e-fraud-merge",        source: "rag-fraud",        target: "merge-results" },
  { id: "e-benchmark-merge",    source: "rag-benchmark",    target: "merge-results" },
  { id: "e-merge-stream",       source: "merge-results",    target: "stream-answer" },
]

// ─── Exports ──────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "wf-simple-chat",
    name: "Simple Chat Pipeline",
    description: "Basic linear pipeline: trigger → LLM → transform. The simplest workflow to understand the basics.",
    icon: "💬",
    nodes: simpleChatNodes,
    edges: simpleChatEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "message", type: "string", description: "User message", required: true }],
      outputs: [{ name: "response", type: "string", description: "Assistant response", required: true }],
    },
    tags: ["Starter", "Chat"],
  },
  {
    id: "wf-rag-qa",
    name: "RAG Question Answering",
    description: "Search a knowledge base, pass context to an LLM, and return a sourced answer.",
    icon: "📚",
    nodes: ragQANodes,
    edges: ragQAEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "question", type: "string", description: "User question", required: true }],
      outputs: [{ name: "answer", type: "string", description: "Answer with sources", required: true }],
    },
    tags: ["RAG", "Knowledge"],
  },
  {
    id: "wf-customer-service",
    name: "Customer Service Chatflow",
    description: "Intent classification → routing: product FAQ, claim info, or auto-escalate complaints to human agent. For widget/customer-facing.",
    icon: "🎧",
    mode: "CHATFLOW",
    nodes: customerServiceNodes,
    edges: customerServiceEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "message", type: "string", description: "Customer message", required: true }],
      outputs: [{ name: "response", type: "string", description: "CS response", required: true }],
    },
    tags: ["Insurance", "Chatflow", "Widget"],
  },
  {
    id: "wf-agent-policy",
    name: "Agent Policy Assistant",
    description: "Parallel search across policy + underwriting KBs, merge results, and answer with combined context. For internal agents.",
    icon: "🔎",
    mode: "CHATFLOW",
    nodes: agentPolicyNodes,
    edges: agentPolicyEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "question", type: "string", description: "Agent question", required: true }],
      outputs: [{ name: "answer", type: "string", description: "Policy information", required: true }],
    },
    tags: ["Insurance", "Chatflow", "Internal"],
  },
  {
    id: "wf-claim-filing",
    name: "Claim Filing Guide",
    description: "Classify claim intent → route: process inquiry, guided filing, or status tracking. Each path uses dedicated KB and prompts. For widget/customer-facing.",
    icon: "📋",
    mode: "CHATFLOW",
    nodes: claimFilingNodes,
    edges: claimFilingEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "message", type: "string", description: "Customer message", required: true }],
      outputs: [{ name: "response", type: "string", description: "Claim guidance", required: true }],
    },
    tags: ["Insurance", "Chatflow", "Widget"],
  },
  {
    id: "wf-fraud-detection",
    name: "Health Insurance Fraud Detection",
    description: "Parallel AI fraud analysis for health insurance claims: narrative analysis, rule engine (8 rules), and pattern matching with RAG. Routes by risk level (auto-approve / review / escalate).",
    icon: "🔍",
    nodes: fraudDetectionNodes,
    edges: fraudDetectionEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "claim_number", type: "string", description: "Claim number", required: true },
        { name: "claim_type", type: "string", description: "health or life", required: true },
        { name: "customer_name", type: "string", description: "Customer name", required: true },
        { name: "customer_gender", type: "string", description: "male or female", required: true },
        { name: "diagnosis_code", type: "string", description: "ICD-10 diagnosis code", required: false },
        { name: "diagnosis_desc", type: "string", description: "Diagnosis description", required: true },
        { name: "total_amount", type: "number", description: "Total claim amount in IDR", required: true },
        { name: "remaining_limit", type: "number", description: "Remaining policy limit", required: true },
        { name: "provider_on_watchlist", type: "boolean", description: "Whether provider is on watchlist", required: true },
        { name: "claim_history", type: "array", description: "Array of previous claims", required: false },
      ],
      outputs: [{ name: "decision", type: "object", description: "Fraud assessment with risk score, findings, and routing decision", required: true }],
    },
    tags: ["Insurance", "Fraud", "Parallel", "Human-in-Loop", "RAG"],
  },
  {
    id: "wf-fraud-investigation",
    name: "Fraud Investigation Chatflow",
    description: "Interactive chatflow for fraud investigators. Search claim history, policy rules, fraud patterns, and medical benchmarks to assist investigation. For internal investigator use.",
    icon: "🕵️",
    mode: "CHATFLOW",
    nodes: fraudInvestigationNodes,
    edges: fraudInvestigationEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "message", type: "string", description: "Investigator question", required: true }],
      outputs: [{ name: "response", type: "string", description: "Investigation findings", required: true }],
    },
    tags: ["Insurance", "Fraud", "Chatflow", "Internal", "RAG"],
  },
]
