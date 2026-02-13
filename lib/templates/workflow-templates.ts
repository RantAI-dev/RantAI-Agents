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

// ─── Template 3: Insurance Fraud Detection ───────────────
// Flow: Webhook → Normalize → Parallel(Narrative, Rules, Patterns) → Merge → Synthesize → Parse → Switch → Approve/Review/Escalate

const fraudDetectionNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-webhook",
    type: NodeType.TRIGGER_WEBHOOK,
    position: { x: 400, y: 0 },
    data: {
      label: "Receive Claim",
      description: "Receive insurance claim data via webhook from claims system",
      nodeType: NodeType.TRIGGER_WEBHOOK,
      config: { webhookPath: "/fraud-detection" },
    } as TriggerNodeData,
  },
  {
    id: "transform-normalize",
    type: NodeType.TRANSFORM,
    position: { x: 400, y: 150 },
    data: {
      label: "Normalize Claim Data",
      description: "Structure and validate incoming claim fields",
      nodeType: NodeType.TRANSFORM,
      expression: `return {
  policy_number: input.policy_number || 'UNKNOWN',
  months_as_customer: Number(input.months_as_customer) || 0,
  age: Number(input.age) || 0,
  insured_sex: input.insured_sex || 'unknown',
  insured_occupation: input.insured_occupation || 'unknown',
  incident_type: input.incident_type || 'unknown',
  incident_severity: input.incident_severity || 'unknown',
  incident_date: input.incident_date || new Date().toISOString(),
  incident_city: input.incident_city || 'unknown',
  total_claim_amount: Number(input.total_claim_amount) || 0,
  injury_claim: Number(input.injury_claim) || 0,
  property_claim: Number(input.property_claim) || 0,
  vehicle_claim: Number(input.vehicle_claim) || 0,
  authorities_contacted: input.authorities_contacted || 'None',
  police_report_available: input.police_report_available || 'NO',
  number_of_vehicles_involved: Number(input.number_of_vehicles_involved) || 1,
  witnesses: Number(input.witnesses) || 0,
  claim_description: input.claim_description || '',
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
      description: "Run narrative analysis, rule-based scoring, and pattern matching simultaneously",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  // ── 3 parallel branches ──
  {
    id: "llm-narrative",
    type: NodeType.LLM,
    position: { x: 80, y: 450 },
    data: {
      label: "Narrative Analysis",
      description: "Analyze the claim description for inconsistencies and suspicious language",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `You are an insurance fraud detection specialist analyzing claim narratives.

Analyze the following insurance claim for:
1. Internal inconsistencies in the story
2. Suspicious or vague language patterns
3. Implausible details or timelines
4. Emotional manipulation or excessive detail in unusual areas
5. Missing critical details that a genuine claimant would include

Respond with JSON:
{
  "narrative_risk_score": <0-100>,
  "inconsistencies": ["list of found inconsistencies"],
  "suspicious_patterns": ["list of suspicious language patterns"],
  "assessment": "brief narrative assessment"
}`,
      temperature: 0.1,
    } as LlmNodeData,
  },
  {
    id: "code-rules",
    type: NodeType.CODE,
    position: { x: 400, y: 450 },
    data: {
      label: "Rule-Based Scoring",
      description: "Compute fraud risk score using predefined business rules and red flags",
      nodeType: NodeType.CODE,
      code: `var score = 0;
var flags = [];

// High claim amount
if (input.total_claim_amount > 50000) { score += 15; flags.push('High claim amount (>$50K)'); }
if (input.total_claim_amount > 100000) { score += 10; flags.push('Very high claim amount (>$100K)'); }

// Missing police report for major incidents
if (input.police_report_available === 'NO' && input.incident_severity !== 'Minor Damage') {
  score += 20; flags.push('No police report for non-minor incident');
}

// New customer filing large claim
if (input.months_as_customer < 6) { score += 15; flags.push('Customer tenure < 6 months'); }
if (input.months_as_customer < 12 && input.total_claim_amount > 30000) {
  score += 10; flags.push('New customer with large claim');
}

// No witnesses
if (input.witnesses === 0) { score += 10; flags.push('No witnesses reported'); }

// Single vehicle incident with high claim
if (input.number_of_vehicles_involved === 1 && input.total_claim_amount > 40000) {
  score += 10; flags.push('Single vehicle, high claim');
}

// Injury claim without police report
if (input.injury_claim > 0 && input.police_report_available === 'NO') {
  score += 15; flags.push('Injury claim without police report');
}

// Claim components don't add up
var componentSum = (input.injury_claim || 0) + (input.property_claim || 0) + (input.vehicle_claim || 0);
if (Math.abs(componentSum - input.total_claim_amount) > 1000) {
  score += 15; flags.push('Claim components do not sum to total');
}

score = Math.min(score, 100);
return { rule_score: score, red_flags: flags, rules_evaluated: 9 };`,
      runtime: "javascript",
    } as CodeNodeData,
  },
  {
    id: "llm-patterns",
    type: NodeType.LLM,
    position: { x: 720, y: 450 },
    data: {
      label: "Pattern Matching",
      description: "Match claim data against known fraud patterns and indicators",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `You are an insurance fraud pattern detection system. Compare the following claim data against these known fraud patterns:

KNOWN FRAUD PATTERNS:
- Staged accidents: multiple claims in short period, specific body shops, round-number claims
- Phantom injuries: injury claims without medical records, delayed injury reporting
- Premium fraud: address manipulation, misrepresented vehicle usage
- Inflated claims: repair estimates significantly above market rate
- Organized rings: multiple related claimants, same providers, coordinated timelines

Analyze the structured claim data and respond with JSON:
{
  "pattern_risk_score": <0-100>,
  "matched_patterns": ["list of matched fraud patterns"],
  "pattern_details": "explanation of pattern matches",
  "recommended_checks": ["list of additional verification steps"]
}`,
      temperature: 0.1,
    } as LlmNodeData,
  },
  // ── Merge + final assessment ──
  {
    id: "merge-results",
    type: NodeType.MERGE,
    position: { x: 400, y: 600 },
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
    position: { x: 400, y: 750 },
    data: {
      label: "Synthesize Assessment",
      description: "Combine all fraud signals into a final risk assessment with overall score",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: `You are a senior insurance fraud analyst producing a final assessment.

You will receive the combined results of three fraud analysis methods:
1. Narrative analysis (checked claim description for inconsistencies)
2. Rule-based scoring (applied business rules and red flags)
3. Pattern matching (compared against known fraud patterns)

Produce a final fraud risk assessment. Calculate a weighted overall risk score:
- Narrative analysis: 30% weight
- Rule-based scoring: 40% weight
- Pattern matching: 30% weight

Respond with JSON only:
{
  "overall_risk_score": <0-100>,
  "risk_level": "low" | "medium" | "high",
  "confidence": <0-100>,
  "summary": "2-3 sentence summary",
  "key_findings": ["top 3-5 findings"],
  "recommendation": "approve" | "review" | "escalate"
}

Risk level thresholds: low < 30, medium 30-65, high > 65`,
      temperature: 0.2,
    } as LlmNodeData,
  },
  {
    id: "transform-parse",
    type: NodeType.TRANSFORM,
    position: { x: 400, y: 900 },
    data: {
      label: "Parse Assessment",
      description: "Parse the LLM JSON response into a structured object",
      nodeType: NodeType.TRANSFORM,
      expression: `try {
  var parsed = typeof input.text === 'string' ? JSON.parse(input.text) : input;
  return parsed;
} catch(e) {
  return { risk_level: 'medium', overall_risk_score: 50, summary: input.text || 'Parse error', recommendation: 'review' };
}`,
    } as TransformNodeData,
  },
  // ── Risk routing ──
  {
    id: "switch-risk",
    type: NodeType.SWITCH,
    position: { x: 400, y: 1050 },
    data: {
      label: "Route by Risk Level",
      description: "Route the claim based on assessed fraud risk level",
      nodeType: NodeType.SWITCH,
      switchOn: "input.risk_level",
      cases: [
        { id: "low", value: "low", label: "Low Risk" },
        { id: "medium", value: "medium", label: "Medium Risk" },
        { id: "high", value: "high", label: "High Risk" },
      ],
    } as SwitchNodeData,
  },
  {
    id: "transform-approve",
    type: NodeType.TRANSFORM,
    position: { x: 80, y: 1200 },
    data: {
      label: "Auto-Approve",
      description: "Automatically approve low-risk claims for standard processing",
      nodeType: NodeType.TRANSFORM,
      expression: `return {
  decision: 'approved',
  decidedBy: 'auto',
  risk_level: input.risk_level,
  risk_score: input.overall_risk_score,
  summary: input.summary,
  decidedAt: new Date().toISOString()
};`,
    } as TransformNodeData,
  },
  {
    id: "approval-analyst",
    type: NodeType.APPROVAL,
    position: { x: 400, y: 1200 },
    data: {
      label: "Analyst Review",
      description: "Route to fraud analyst for manual review of medium-risk claims",
      nodeType: NodeType.APPROVAL,
      prompt: "This claim has been flagged as MEDIUM RISK by automated fraud detection. Please review the analysis findings and approve or reject the claim.",
    } as HumanInputNodeData,
  },
  {
    id: "handoff-escalate",
    type: NodeType.HANDOFF,
    position: { x: 720, y: 1200 },
    data: {
      label: "Escalate to SIU",
      description: "Escalate high-risk claims to the Special Investigations Unit",
      nodeType: NodeType.HANDOFF,
      prompt: "HIGH RISK claim detected. This claim has been flagged with multiple fraud indicators and requires immediate investigation by the Special Investigations Unit (SIU). Claim is BLOCKED pending investigation.",
    } as HumanInputNodeData,
  },
]

const fraudDetectionEdges: Edge[] = [
  { id: "e-trigger-normalize",  source: "trigger-webhook",   target: "transform-normalize" },
  { id: "e-normalize-parallel", source: "transform-normalize", target: "parallel-split" },
  { id: "e-parallel-narrative", source: "parallel-split",     target: "llm-narrative" },
  { id: "e-parallel-rules",    source: "parallel-split",     target: "code-rules" },
  { id: "e-parallel-patterns",  source: "parallel-split",     target: "llm-patterns" },
  { id: "e-narrative-merge",   source: "llm-narrative",      target: "merge-results" },
  { id: "e-rules-merge",       source: "code-rules",         target: "merge-results" },
  { id: "e-patterns-merge",    source: "llm-patterns",       target: "merge-results" },
  { id: "e-merge-synthesize",  source: "merge-results",      target: "llm-synthesize" },
  { id: "e-synthesize-parse",  source: "llm-synthesize",     target: "transform-parse" },
  { id: "e-parse-switch",      source: "transform-parse",    target: "switch-risk" },
  { id: "e-switch-approve",    source: "switch-risk", sourceHandle: "low",    target: "transform-approve" },
  { id: "e-switch-review",     source: "switch-risk", sourceHandle: "medium", target: "approval-analyst" },
  { id: "e-switch-escalate",   source: "switch-risk", sourceHandle: "high",   target: "handoff-escalate" },
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
    name: "Insurance Fraud Detection",
    description: "Receive claims via webhook, run parallel AI + rule-based fraud analysis, and route by risk level with human-in-the-loop review.",
    icon: "🔍",
    nodes: fraudDetectionNodes,
    edges: fraudDetectionEdges,
    trigger: { type: "webhook", webhookPath: "/fraud-detection" },
    variables: {
      inputs: [{ name: "claim", type: "object", description: "Insurance claim data with policy, incident, and financial details", required: true }],
      outputs: [{ name: "decision", type: "object", description: "Fraud assessment decision with risk score and routing outcome", required: true }],
    },
    tags: ["Insurance", "Fraud", "Parallel", "Human-in-Loop"],
  },
]
