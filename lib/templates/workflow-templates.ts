import { NodeType } from "@/lib/workflow/types"
import type {
  WorkflowNodeData,
  TriggerNodeData,
  LlmNodeData,
  TransformNodeData,
  RagSearchNodeData,
  ConditionNodeData,
  HumanInputNodeData,
  ParallelNodeData,
  MergeNodeData,
  HttpNodeData,
  SwitchNodeData,
  ToolNodeData,
  CodeNodeData,
  TriggerConfig,
  WorkflowVariables,
} from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  trigger: TriggerConfig
  variables: WorkflowVariables
  tags: string[]
}

// ─── Template 1: Simple Chat Pipeline ─────────────────────

const simpleChatNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-1",
    type: "workflowNode",
    position: { x: 250, y: 150 },
    data: {
      label: "Chat LLM",
      description: "Process the user message with an LLM",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt: "You are a helpful assistant. Answer the user's question concisely.",
      temperature: 0.7,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: "workflowNode",
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

const ragQANodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "rag-1",
    type: "workflowNode",
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
    type: "workflowNode",
    position: { x: 250, y: 300 },
    data: {
      label: "Answer with Context",
      description: "Generate an answer using retrieved context",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        "Answer the user's question based on the provided context. Cite sources when possible. If the context doesn't contain relevant information, say so.",
      temperature: 0.3,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: "workflowNode",
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

// ─── Template 3: Content Moderation ───────────────────────

const moderationNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: "workflowNode",
    position: { x: 250, y: 150 },
    data: {
      label: "Classify Content",
      description: "Classify whether content is safe or needs review",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        'Classify the following content as either "safe" or "needs_review". Respond with a JSON object: { "classification": "safe" | "needs_review", "reason": "brief explanation" }',
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "condition-1",
    type: "workflowNode",
    position: { x: 250, y: 300 },
    data: {
      label: "Is Safe?",
      description: "Branch based on classification result",
      nodeType: NodeType.CONDITION,
      conditions: [
        { id: "if", label: "Safe", expression: 'input.classification === "safe"' },
        { id: "else", label: "Needs Review", expression: "true" },
      ],
    } as ConditionNodeData,
  },
  {
    id: "transform-approve",
    type: "workflowNode",
    position: { x: 80, y: 460 },
    data: {
      label: "Auto-Approve",
      description: "Content is safe, auto-approve it",
      nodeType: NodeType.TRANSFORM,
      expression: 'return { status: "approved", reviewedBy: "auto", ...input };',
    } as TransformNodeData,
  },
  {
    id: "human-review",
    type: "workflowNode",
    position: { x: 420, y: 460 },
    data: {
      label: "Human Review",
      description: "Send to a human moderator for review",
      nodeType: NodeType.HUMAN_INPUT,
      prompt: "This content was flagged for review. Please approve or reject it.",
    } as HumanInputNodeData,
  },
]

const moderationEdges: Edge[] = [
  { id: "e-trigger-classify", source: "trigger-1", target: "llm-classify" },
  { id: "e-classify-condition", source: "llm-classify", target: "condition-1" },
  {
    id: "e-condition-approve",
    source: "condition-1",
    sourceHandle: "if",
    target: "transform-approve",
  },
  {
    id: "e-condition-review",
    source: "condition-1",
    sourceHandle: "else",
    target: "human-review",
  },
]

// ─── Template 4: Parallel Data Enrichment ─────────────────

const parallelNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 300, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "parallel-1",
    type: "workflowNode",
    position: { x: 300, y: 130 },
    data: {
      label: "Parallel Split",
      description: "Run multiple enrichment tasks in parallel",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  {
    id: "tool-search",
    type: "workflowNode",
    position: { x: 60, y: 270 },
    data: {
      label: "Web Search",
      description: "Search the web for recent information",
      nodeType: NodeType.TOOL,
      toolId: "",
      toolName: "web_search",
      inputMapping: { query: "{{input.query}}" },
    } as ToolNodeData,
  },
  {
    id: "rag-1",
    type: "workflowNode",
    position: { x: 300, y: 270 },
    data: {
      label: "Knowledge Base",
      description: "Search internal knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "http-1",
    type: "workflowNode",
    position: { x: 540, y: 270 },
    data: {
      label: "External API",
      description: "Fetch data from an external API",
      nodeType: NodeType.HTTP,
      url: "https://api.example.com/data",
      method: "GET",
    } as HttpNodeData,
  },
  {
    id: "merge-1",
    type: "workflowNode",
    position: { x: 300, y: 420 },
    data: {
      label: "Merge Results",
      description: "Combine all enrichment results",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "llm-synthesize",
    type: "workflowNode",
    position: { x: 300, y: 560 },
    data: {
      label: "Synthesize",
      description: "Use LLM to synthesize all gathered data into a coherent response",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        "Synthesize the following data from multiple sources into a comprehensive, well-structured response. Highlight key findings and note any conflicting information.",
      temperature: 0.5,
    } as LlmNodeData,
  },
]

const parallelEdges: Edge[] = [
  { id: "e-trigger-parallel", source: "trigger-1", target: "parallel-1" },
  { id: "e-parallel-search", source: "parallel-1", target: "tool-search" },
  { id: "e-parallel-rag", source: "parallel-1", target: "rag-1" },
  { id: "e-parallel-http", source: "parallel-1", target: "http-1" },
  { id: "e-search-merge", source: "tool-search", target: "merge-1" },
  { id: "e-rag-merge", source: "rag-1", target: "merge-1" },
  { id: "e-http-merge", source: "http-1", target: "merge-1" },
  { id: "e-merge-llm", source: "merge-1", target: "llm-synthesize" },
]

// ─── Template 5: Customer Ticket Router ───────────────────

const ticketRouterNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-webhook",
    type: "workflowNode",
    position: { x: 300, y: 0 },
    data: {
      label: "Webhook Trigger",
      description: "Receive incoming support tickets via webhook",
      nodeType: NodeType.TRIGGER_WEBHOOK,
      config: { webhookPath: "/tickets" },
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: "workflowNode",
    position: { x: 300, y: 150 },
    data: {
      label: "Classify Ticket",
      description: "Use LLM to classify the ticket category",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        'Classify this support ticket into one of these categories: "technical", "billing", "general". Respond with JSON: { "category": "...", "priority": "low"|"medium"|"high", "summary": "..." }',
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "switch-1",
    type: "workflowNode",
    position: { x: 300, y: 310 },
    data: {
      label: "Route by Category",
      description: "Route to the appropriate handler based on category",
      nodeType: NodeType.SWITCH,
      switchOn: "input.category",
      cases: [
        { id: "technical", value: "technical", label: "Technical" },
        { id: "billing", value: "billing", label: "Billing" },
        { id: "general", value: "general", label: "General" },
      ],
    } as SwitchNodeData,
  },
  {
    id: "tool-technical",
    type: "workflowNode",
    position: { x: 60, y: 480 },
    data: {
      label: "Technical Agent",
      description: "Handle with knowledge base search for technical issues",
      nodeType: NodeType.TOOL,
      toolId: "",
      toolName: "knowledge_search",
      inputMapping: { query: "{{input.summary}}" },
    } as ToolNodeData,
  },
  {
    id: "transform-billing",
    type: "workflowNode",
    position: { x: 300, y: 480 },
    data: {
      label: "Billing Lookup",
      description: "Look up billing information and prepare response",
      nodeType: NodeType.TRANSFORM,
      expression:
        'return { action: "billing_lookup", customerId: input.customerId, issue: input.summary };',
    } as TransformNodeData,
  },
  {
    id: "handoff-1",
    type: "workflowNode",
    position: { x: 540, y: 480 },
    data: {
      label: "Human Handoff",
      description: "Escalate general inquiries to a human agent",
      nodeType: NodeType.HANDOFF,
      prompt: "General support ticket requiring human attention.",
    } as HumanInputNodeData,
  },
]

const ticketRouterEdges: Edge[] = [
  { id: "e-trigger-classify", source: "trigger-webhook", target: "llm-classify" },
  { id: "e-classify-switch", source: "llm-classify", target: "switch-1" },
  {
    id: "e-switch-technical",
    source: "switch-1",
    sourceHandle: "technical",
    target: "tool-technical",
  },
  {
    id: "e-switch-billing",
    source: "switch-1",
    sourceHandle: "billing",
    target: "transform-billing",
  },
  {
    id: "e-switch-general",
    source: "switch-1",
    sourceHandle: "general",
    target: "handoff-1",
  },
]

// ─── Template 6: Insurance Fraud Detection ───────────────

const fraudDetectionNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-webhook",
    type: "workflowNode",
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
    type: "workflowNode",
    position: { x: 400, y: 140 },
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
    type: "workflowNode",
    position: { x: 400, y: 280 },
    data: {
      label: "Parallel Fraud Analysis",
      description: "Run narrative analysis, rule-based scoring, and pattern matching simultaneously",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  {
    id: "llm-narrative",
    type: "workflowNode",
    position: { x: 80, y: 420 },
    data: {
      label: "Narrative Analysis",
      description: "Analyze the claim description for inconsistencies and suspicious language",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
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
    type: "workflowNode",
    position: { x: 400, y: 420 },
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
    type: "workflowNode",
    position: { x: 720, y: 420 },
    data: {
      label: "Pattern Matching",
      description: "Match claim data against known fraud patterns and indicators",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
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
  {
    id: "merge-results",
    type: "workflowNode",
    position: { x: 400, y: 580 },
    data: {
      label: "Merge Analysis Results",
      description: "Combine results from all three parallel fraud analysis branches",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "llm-synthesize",
    type: "workflowNode",
    position: { x: 400, y: 720 },
    data: {
      label: "Synthesize Assessment",
      description: "Combine all fraud signals into a final risk assessment with overall score",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
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
    type: "workflowNode",
    position: { x: 400, y: 870 },
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
  {
    id: "switch-risk",
    type: "workflowNode",
    position: { x: 400, y: 1010 },
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
    type: "workflowNode",
    position: { x: 80, y: 1170 },
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
    type: "workflowNode",
    position: { x: 400, y: 1170 },
    data: {
      label: "Analyst Review",
      description: "Route to fraud analyst for manual review of medium-risk claims",
      nodeType: NodeType.APPROVAL,
      prompt: "This claim has been flagged as MEDIUM RISK by automated fraud detection. Please review the analysis findings and approve or reject the claim.",
    } as HumanInputNodeData,
  },
  {
    id: "handoff-escalate",
    type: "workflowNode",
    position: { x: 720, y: 1170 },
    data: {
      label: "Escalate to SIU",
      description: "Escalate high-risk claims to the Special Investigations Unit",
      nodeType: NodeType.HANDOFF,
      prompt: "HIGH RISK claim detected. This claim has been flagged with multiple fraud indicators and requires immediate investigation by the Special Investigations Unit (SIU). Claim is BLOCKED pending investigation.",
    } as HumanInputNodeData,
  },
]

const fraudDetectionEdges: Edge[] = [
  // Main flow
  { id: "e-trigger-normalize", source: "trigger-webhook", target: "transform-normalize" },
  { id: "e-normalize-parallel", source: "transform-normalize", target: "parallel-split" },
  // Parallel fan-out
  { id: "e-parallel-narrative", source: "parallel-split", target: "llm-narrative" },
  { id: "e-parallel-rules", source: "parallel-split", target: "code-rules" },
  { id: "e-parallel-patterns", source: "parallel-split", target: "llm-patterns" },
  // Parallel fan-in
  { id: "e-narrative-merge", source: "llm-narrative", target: "merge-results" },
  { id: "e-rules-merge", source: "code-rules", target: "merge-results" },
  { id: "e-patterns-merge", source: "llm-patterns", target: "merge-results" },
  // Synthesis
  { id: "e-merge-synthesize", source: "merge-results", target: "llm-synthesize" },
  { id: "e-synthesize-parse", source: "llm-synthesize", target: "transform-parse" },
  { id: "e-parse-switch", source: "transform-parse", target: "switch-risk" },
  // Risk level routing
  { id: "e-switch-approve", source: "switch-risk", sourceHandle: "low", target: "transform-approve" },
  { id: "e-switch-review", source: "switch-risk", sourceHandle: "medium", target: "approval-analyst" },
  { id: "e-switch-escalate", source: "switch-risk", sourceHandle: "high", target: "handoff-escalate" },
]

// ─── Exports ──────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "wf-simple-chat",
    name: "Simple Chat Pipeline",
    description:
      "Basic linear pipeline: trigger → LLM → transform. The simplest workflow to understand the basics.",
    icon: "💬",
    nodes: simpleChatNodes,
    edges: simpleChatEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "message", type: "string", description: "User message", required: true },
      ],
      outputs: [
        { name: "response", type: "string", description: "Assistant response", required: true },
      ],
    },
    tags: ["Starter", "Chat"],
  },
  {
    id: "wf-rag-qa",
    name: "RAG Question Answering",
    description:
      "Search a knowledge base, pass context to an LLM, and return a sourced answer.",
    icon: "📖",
    nodes: ragQANodes,
    edges: ragQAEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "question", type: "string", description: "User question", required: true },
      ],
      outputs: [
        { name: "answer", type: "string", description: "Answer with sources", required: true },
      ],
    },
    tags: ["RAG", "Knowledge"],
  },
  {
    id: "wf-content-moderation",
    name: "Content Moderation",
    description:
      "Classify content safety with an LLM, auto-approve safe content, and route flagged content to human review.",
    icon: "🛡️",
    nodes: moderationNodes,
    edges: moderationEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "content", type: "string", description: "Content to moderate", required: true },
      ],
      outputs: [
        { name: "status", type: "string", description: "Moderation result", required: true },
      ],
    },
    tags: ["Moderation", "Human-in-Loop"],
  },
  {
    id: "wf-parallel-enrichment",
    name: "Parallel Data Enrichment",
    description:
      "Run web search, knowledge base retrieval, and API calls in parallel, then merge and synthesize results.",
    icon: "⚡",
    nodes: parallelNodes,
    edges: parallelEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "query", type: "string", description: "Research query", required: true },
      ],
      outputs: [
        { name: "synthesis", type: "string", description: "Synthesized results", required: true },
      ],
    },
    tags: ["Parallel", "Research"],
  },
  {
    id: "wf-ticket-router",
    name: "Customer Ticket Router",
    description:
      "Receive tickets via webhook, classify with LLM, and route to technical, billing, or human agents.",
    icon: "🎫",
    nodes: ticketRouterNodes,
    edges: ticketRouterEdges,
    trigger: { type: "webhook", webhookPath: "/tickets" },
    variables: {
      inputs: [
        { name: "ticket", type: "object", description: "Incoming ticket data", required: true },
      ],
      outputs: [
        { name: "result", type: "object", description: "Routing result", required: true },
      ],
    },
    tags: ["Webhook", "Routing"],
  },
  {
    id: "wf-fraud-detection",
    name: "Insurance Fraud Detection",
    description:
      "Receive claims via webhook, run parallel AI + rule-based fraud analysis, and route by risk level with human-in-the-loop review.",
    icon: "🔍",
    nodes: fraudDetectionNodes,
    edges: fraudDetectionEdges,
    trigger: { type: "webhook", webhookPath: "/fraud-detection" },
    variables: {
      inputs: [
        { name: "claim", type: "object", description: "Insurance claim data with policy, incident, and financial details", required: true },
      ],
      outputs: [
        { name: "decision", type: "object", description: "Fraud assessment decision with risk score and routing outcome", required: true },
      ],
    },
    tags: ["Insurance", "Fraud", "Parallel", "Human-in-Loop"],
  },
]
