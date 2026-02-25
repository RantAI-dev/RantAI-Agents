/**
 * Seed 15 community workflow CatalogItem records.
 * Installing a workflow creates a real Workflow record in DRAFT status.
 *
 * Usage: npx tsx scripts/seed-workflows.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const isDryRun = process.argv.includes("--dry-run")

// ─── Node type constants (matches lib/workflow/types.ts NodeType enum) ─────
const NT = {
  TRIGGER_MANUAL: "trigger_manual",
  LLM: "llm",
  TRANSFORM: "transform",
  RAG_SEARCH: "rag_search",
  CONDITION: "condition",
  SWITCH: "switch",
  CODE: "code",
  PARALLEL: "parallel",
  MERGE: "merge",
  STREAM_OUTPUT: "stream_output",
  APPROVAL: "approval",
  OUTPUT_PARSER: "output_parser",
}

// ─── Helper to build WorkflowExportFormat v1 JSON ──────────────────────────
function wf(
  name: string,
  description: string,
  mode: "STANDARD" | "CHATFLOW",
  nodes: object[],
  edges: object[],
  inputs: object[],
  outputs: object[]
) {
  return {
    version: 1,
    name,
    description,
    mode,
    trigger: { type: "manual" },
    variables: { inputs, outputs },
    nodes,
    edges,
    metadata: {
      exportedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  }
}

// ─── Workflow 1: Email Triage & Auto-Reply ──────────────────────────────────
const emailTriageWf = wf(
  "Email Triage & Auto-Reply",
  "Classify incoming emails by urgency, route to appropriate handler, and draft auto-replies.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Receive Email", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-classify", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Classify Email", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Classify this email into one of: urgent, normal, low-priority, spam. Also extract: sender, subject summary, key action needed. Return JSON: { priority, sender, summary, action }", temperature: 0.2 } },
    { id: "parse-1", type: NT.OUTPUT_PARSER, position: { x: 300, y: 300 }, data: { label: "Parse Classification", nodeType: NT.OUTPUT_PARSER, format: "json" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 300, y: 450 }, data: { label: "Route by Priority", nodeType: NT.CONDITION, conditions: [{ id: "urgent", label: "Urgent", expression: "input.priority === 'urgent'" }, { id: "normal", label: "Normal", expression: "input.priority === 'normal'" }, { id: "low", label: "Low Priority", expression: "true" }] } },
    { id: "llm-urgent", type: NT.LLM, position: { x: 50, y: 600 }, data: { label: "Draft Urgent Reply", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Draft a brief, professional reply acknowledging this urgent email. Confirm receipt and state that someone will respond within 1 hour. Be concise.", temperature: 0.3 } },
    { id: "llm-normal", type: NT.LLM, position: { x: 300, y: 600 }, data: { label: "Draft Normal Reply", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Draft a professional auto-reply acknowledging receipt of this email. State that the team will review and respond within 24 hours.", temperature: 0.3 } },
    { id: "llm-low", type: NT.LLM, position: { x: 550, y: 600 }, data: { label: "Draft Low-Priority Reply", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Draft a brief auto-reply acknowledging this email. State it will be reviewed as time permits.", temperature: 0.3 } },
    { id: "transform-out", type: NT.TRANSFORM, position: { x: 300, y: 750 }, data: { label: "Format Output", nodeType: NT.TRANSFORM, expression: "return { classification: input.priority || 'unknown', draft_reply: input.text, processed_at: new Date().toISOString() };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-classify" },
    { id: "e2", source: "llm-classify", target: "parse-1" },
    { id: "e3", source: "parse-1", target: "switch-1" },
    { id: "e4", source: "switch-1", target: "llm-urgent", sourceHandle: "urgent" },
    { id: "e5", source: "switch-1", target: "llm-normal", sourceHandle: "normal" },
    { id: "e6", source: "switch-1", target: "llm-low", sourceHandle: "low" },
    { id: "e7", source: "llm-urgent", target: "transform-out" },
    { id: "e8", source: "llm-normal", target: "transform-out" },
    { id: "e9", source: "llm-low", target: "transform-out" },
  ],
  [{ name: "email_body", type: "string", description: "Raw email content", required: true }, { name: "sender", type: "string", description: "Sender email", required: false }],
  [{ name: "classification", type: "object", description: "Priority classification and auto-reply draft", required: true }]
)

// ─── Workflow 2: Content Review Pipeline ────────────────────────────────────
const contentReviewWf = wf(
  "Content Review Pipeline",
  "Review content for quality, compliance, and brand alignment before publishing.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Submit Content", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-review", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Review Content", nodeType: NT.LLM, model: "anthropic/claude-sonnet-4.5", systemPrompt: "Review this content for: grammar, clarity, brand tone, factual accuracy, and compliance. Return JSON: { score (1-100), issues: [{ type, severity, description, suggestion }], verdict: 'approve'|'revise'|'reject' }", temperature: 0.2 } },
    { id: "parse-1", type: NT.OUTPUT_PARSER, position: { x: 300, y: 300 }, data: { label: "Parse Review", nodeType: NT.OUTPUT_PARSER, format: "json" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 300, y: 450 }, data: { label: "Route by Verdict", nodeType: NT.CONDITION, conditions: [{ id: "approve", label: "Approved", expression: "input.verdict === 'approve'" }, { id: "revise", label: "Needs Revision", expression: "input.verdict === 'revise'" }, { id: "reject", label: "Rejected", expression: "true" }] } },
    { id: "transform-approve", type: NT.TRANSFORM, position: { x: 50, y: 600 }, data: { label: "Approve Output", nodeType: NT.TRANSFORM, expression: "return { status: 'approved', score: input.score, message: 'Content approved for publishing' };" } },
    { id: "llm-revise", type: NT.LLM, position: { x: 300, y: 600 }, data: { label: "Suggest Revisions", nodeType: NT.LLM, model: "anthropic/claude-sonnet-4.5", systemPrompt: "Based on the review issues, provide specific, actionable revision suggestions. Format as a numbered list.", temperature: 0.4 } },
    { id: "transform-reject", type: NT.TRANSFORM, position: { x: 550, y: 600 }, data: { label: "Reject Output", nodeType: NT.TRANSFORM, expression: "return { status: 'rejected', score: input.score, issues: input.issues, message: 'Content does not meet publishing standards' };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-review" },
    { id: "e2", source: "llm-review", target: "parse-1" },
    { id: "e3", source: "parse-1", target: "switch-1" },
    { id: "e4", source: "switch-1", target: "transform-approve", sourceHandle: "approve" },
    { id: "e5", source: "switch-1", target: "llm-revise", sourceHandle: "revise" },
    { id: "e6", source: "switch-1", target: "transform-reject", sourceHandle: "reject" },
  ],
  [{ name: "content", type: "string", description: "Content to review", required: true }, { name: "content_type", type: "string", description: "Type: blog, social, email, etc.", required: false }],
  [{ name: "review_result", type: "object", description: "Review verdict with score and feedback", required: true }]
)

// ─── Workflow 3: Lead Scoring ───────────────────────────────────────────────
const leadScoringWf = wf(
  "Lead Scoring Pipeline",
  "Score leads with parallel analysis: company fit, buying intent, and budget signals. Routes by score.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 350, y: 0 }, data: { label: "New Lead", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "parallel-1", type: NT.PARALLEL, position: { x: 350, y: 150 }, data: { label: "Parallel Analysis", nodeType: NT.PARALLEL } },
    { id: "llm-fit", type: NT.LLM, position: { x: 100, y: 300 }, data: { label: "Company Fit Score", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Analyze this lead's company fit. Consider: company size, industry, technology stack, growth stage. Return JSON: { fit_score: 0-100, reasoning: string }", temperature: 0.2 } },
    { id: "llm-intent", type: NT.LLM, position: { x: 350, y: 300 }, data: { label: "Buying Intent Score", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Analyze buying intent signals. Consider: inquiry specificity, urgency language, comparison mentions, timeline mentions. Return JSON: { intent_score: 0-100, signals: string[] }", temperature: 0.2 } },
    { id: "llm-budget", type: NT.LLM, position: { x: 600, y: 300 }, data: { label: "Budget Fit Score", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Analyze budget signals. Consider: company revenue indicators, pricing discussions, budget mentions, decision-maker involvement. Return JSON: { budget_score: 0-100, indicators: string[] }", temperature: 0.2 } },
    { id: "merge-1", type: NT.MERGE, position: { x: 350, y: 450 }, data: { label: "Merge Scores", nodeType: NT.MERGE } },
    { id: "code-score", type: NT.CODE, position: { x: 350, y: 600 }, data: { label: "Calculate Total Score", nodeType: NT.CODE, code: "const fit = input.branches?.[0]?.fit_score || 50;\nconst intent = input.branches?.[1]?.intent_score || 50;\nconst budget = input.branches?.[2]?.budget_score || 50;\nconst total = Math.round(fit * 0.3 + intent * 0.4 + budget * 0.3);\nconst tier = total >= 80 ? 'hot' : total >= 50 ? 'warm' : 'cold';\nreturn { total_score: total, tier, fit_score: fit, intent_score: intent, budget_score: budget };" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 350, y: 750 }, data: { label: "Route by Tier", nodeType: NT.CONDITION, conditions: [{ id: "hot", label: "Hot Lead", expression: "input.tier === 'hot'" }, { id: "warm", label: "Warm Lead", expression: "input.tier === 'warm'" }, { id: "cold", label: "Cold Lead", expression: "true" }] } },
    { id: "transform-hot", type: NT.TRANSFORM, position: { x: 100, y: 900 }, data: { label: "Hot Lead Action", nodeType: NT.TRANSFORM, expression: "return { ...input, action: 'Schedule demo within 24h', assigned_to: 'senior_ae' };" } },
    { id: "transform-warm", type: NT.TRANSFORM, position: { x: 350, y: 900 }, data: { label: "Warm Lead Action", nodeType: NT.TRANSFORM, expression: "return { ...input, action: 'Add to nurture sequence', assigned_to: 'sdr_team' };" } },
    { id: "transform-cold", type: NT.TRANSFORM, position: { x: 600, y: 900 }, data: { label: "Cold Lead Action", nodeType: NT.TRANSFORM, expression: "return { ...input, action: 'Add to marketing drip', assigned_to: 'marketing' };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "parallel-1" },
    { id: "e2", source: "parallel-1", target: "llm-fit" },
    { id: "e3", source: "parallel-1", target: "llm-intent" },
    { id: "e4", source: "parallel-1", target: "llm-budget" },
    { id: "e5", source: "llm-fit", target: "merge-1" },
    { id: "e6", source: "llm-intent", target: "merge-1" },
    { id: "e7", source: "llm-budget", target: "merge-1" },
    { id: "e8", source: "merge-1", target: "code-score" },
    { id: "e9", source: "code-score", target: "switch-1" },
    { id: "e10", source: "switch-1", target: "transform-hot", sourceHandle: "hot" },
    { id: "e11", source: "switch-1", target: "transform-warm", sourceHandle: "warm" },
    { id: "e12", source: "switch-1", target: "transform-cold", sourceHandle: "cold" },
  ],
  [{ name: "lead_info", type: "string", description: "Lead details: company, inquiry, contact info", required: true }],
  [{ name: "score_result", type: "object", description: "Lead score, tier, and recommended action", required: true }]
)

// ─── Workflow 4: Document Summarizer ────────────────────────────────────────
const docSummarizerWf = wf(
  "Document Summarizer",
  "Extract key points from documents and produce structured summaries.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Upload Document", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Extract Key Points", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Extract the key points from this document. Produce a structured summary with: 1) One-line TL;DR, 2) Key findings (bulleted), 3) Important data/numbers, 4) Action items or recommendations. Keep it concise.", temperature: 0.3 } },
    { id: "transform-1", type: NT.TRANSFORM, position: { x: 300, y: 300 }, data: { label: "Format Summary", nodeType: NT.TRANSFORM, expression: "return { summary: input.text, word_count: (input.text || '').split(/\\s+/).length, summarized_at: new Date().toISOString() };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-1" },
    { id: "e2", source: "llm-1", target: "transform-1" },
  ],
  [{ name: "document", type: "string", description: "Document text to summarize", required: true }],
  [{ name: "summary", type: "object", description: "Structured document summary", required: true }]
)

// ─── Workflow 5: Multi-Language Translator ──────────────────────────────────
const translatorWf = wf(
  "Multi-Language Translator",
  "Detect source language, translate text, and format the output with quality confidence.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Input Text", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-detect", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Detect Language", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Detect the language of this text. Return ONLY a JSON: { language: string, confidence: number (0-1), language_code: string (ISO 639-1) }", temperature: 0.1 } },
    { id: "llm-translate", type: NT.LLM, position: { x: 300, y: 300 }, data: { label: "Translate", nodeType: NT.LLM, model: "anthropic/claude-sonnet-4.5", systemPrompt: "Translate the following text to the target language specified. Preserve formatting, tone, and meaning. If idioms or cultural references don't translate directly, provide the closest equivalent with a note.", temperature: 0.3 } },
    { id: "transform-1", type: NT.TRANSFORM, position: { x: 300, y: 450 }, data: { label: "Format Output", nodeType: NT.TRANSFORM, expression: "return { original: input.original_text, translated: input.text, source_language: input.language || 'unknown', target_language: input.target_language || 'en', translated_at: new Date().toISOString() };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-detect" },
    { id: "e2", source: "llm-detect", target: "llm-translate" },
    { id: "e3", source: "llm-translate", target: "transform-1" },
  ],
  [{ name: "text", type: "string", description: "Text to translate", required: true }, { name: "target_language", type: "string", description: "Target language (e.g. 'English', 'Indonesian')", required: true }],
  [{ name: "translation", type: "object", description: "Translated text with metadata", required: true }]
)

// ─── Workflow 6: FAQ Chatbot ────────────────────────────────────────────────
const faqChatbotWf = wf(
  "FAQ Chatbot",
  "RAG-powered FAQ chatbot that searches knowledge base and streams answers.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "User Question", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "rag-1", type: NT.RAG_SEARCH, position: { x: 300, y: 150 }, data: { label: "Search FAQ", nodeType: NT.RAG_SEARCH, knowledgeBaseGroupIds: [], topK: 5, queryTemplate: "{{input.message}}" } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 300 }, data: { label: "Answer Question", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "You are a helpful FAQ assistant. Answer the user's question based on the provided FAQ context. Be concise and accurate. If the answer isn't in the context, say so and suggest contacting support.", temperature: 0.3 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 450 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "rag-1" },
    { id: "e2", source: "rag-1", target: "llm-1" },
    { id: "e3", source: "llm-1", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "User question", required: true }],
  [{ name: "response", type: "string", description: "FAQ answer", required: true }]
)

// ─── Workflow 7: Knowledge Q&A with Fallback ────────────────────────────────
const knowledgeQAWf = wf(
  "Knowledge Q&A with Fallback",
  "Search knowledge base first; if no relevant results found, answer from general knowledge with a disclaimer.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "User Question", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "rag-1", type: NT.RAG_SEARCH, position: { x: 300, y: 150 }, data: { label: "Search Knowledge Base", nodeType: NT.RAG_SEARCH, knowledgeBaseGroupIds: [], topK: 5, queryTemplate: "{{input.message}}" } },
    { id: "code-check", type: NT.CODE, position: { x: 300, y: 300 }, data: { label: "Check Results", nodeType: NT.CODE, code: "const results = input.results || input.context || [];\nconst hasResults = Array.isArray(results) && results.length > 0;\nreturn { has_results: hasResults, result_count: hasResults ? results.length : 0 };" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 300, y: 450 }, data: { label: "Has KB Results?", nodeType: NT.CONDITION, conditions: [{ id: "yes", label: "Has Results", expression: "input.has_results === true" }, { id: "no", label: "No Results", expression: "true" }] } },
    { id: "llm-kb", type: NT.LLM, position: { x: 100, y: 600 }, data: { label: "Answer from KB", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Answer the user's question based on the knowledge base context provided. Cite the source when possible. Be accurate and concise.", temperature: 0.3 } },
    { id: "llm-general", type: NT.LLM, position: { x: 500, y: 600 }, data: { label: "General Knowledge Answer", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "The knowledge base had no relevant results for this question. Answer from your general knowledge, but start with: 'I couldn't find this in the knowledge base, but based on general knowledge:' Be helpful but note this isn't from verified sources.", temperature: 0.5 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 750 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "rag-1" },
    { id: "e2", source: "rag-1", target: "code-check" },
    { id: "e3", source: "code-check", target: "switch-1" },
    { id: "e4", source: "switch-1", target: "llm-kb", sourceHandle: "yes" },
    { id: "e5", source: "switch-1", target: "llm-general", sourceHandle: "no" },
    { id: "e6", source: "llm-kb", target: "stream-1" },
    { id: "e7", source: "llm-general", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "User question", required: true }],
  [{ name: "response", type: "string", description: "Answer with source attribution", required: true }]
)

// ─── Workflow 8: Interview Screener ─────────────────────────────────────────
const interviewScreenerWf = wf(
  "Interview Screener Chatflow",
  "Interactive chatflow that asks screening questions, evaluates responses, and produces a candidate assessment.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Start Interview", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Interview Assistant", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "You are conducting a screening interview. Ask questions one at a time about: 1) relevant experience, 2) key skills, 3) availability, 4) salary expectations, 5) motivation. Be professional and friendly. After all questions are answered, provide a structured assessment with a recommendation: proceed/hold/pass.", temperature: 0.4 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 300 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-1" },
    { id: "e2", source: "llm-1", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "Candidate response", required: true }, { name: "job_title", type: "string", description: "Position being interviewed for", required: false }],
  [{ name: "response", type: "string", description: "Interview question or assessment", required: true }]
)

// ─── Workflow 9: Incident Response ──────────────────────────────────────────
const incidentResponseWf = wf(
  "Incident Response Classifier",
  "Classify IT incidents by severity, auto-generate ticket details, and route to appropriate team.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Report Incident", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-classify", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Classify Incident", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Classify this IT incident. Return JSON: { severity: 'P1'|'P2'|'P3'|'P4', category: string, affected_service: string, impact: string, summary: string, suggested_team: 'infrastructure'|'security'|'application'|'network'|'database' }", temperature: 0.1 } },
    { id: "parse-1", type: NT.OUTPUT_PARSER, position: { x: 300, y: 300 }, data: { label: "Parse Classification", nodeType: NT.OUTPUT_PARSER, format: "json" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 300, y: 450 }, data: { label: "Route by Severity", nodeType: NT.CONDITION, conditions: [{ id: "p1", label: "P1 - Critical", expression: "input.severity === 'P1'" }, { id: "p2", label: "P2 - High", expression: "input.severity === 'P2'" }, { id: "p3", label: "P3/P4 - Normal", expression: "true" }] } },
    { id: "code-p1", type: NT.CODE, position: { x: 50, y: 600 }, data: { label: "P1 Ticket", nodeType: NT.CODE, code: "return { ...input, ticket_type: 'CRITICAL', sla_hours: 1, auto_page: true, war_room: true };" } },
    { id: "code-p2", type: NT.CODE, position: { x: 300, y: 600 }, data: { label: "P2 Ticket", nodeType: NT.CODE, code: "return { ...input, ticket_type: 'HIGH', sla_hours: 4, auto_page: false, war_room: false };" } },
    { id: "code-p3", type: NT.CODE, position: { x: 550, y: 600 }, data: { label: "P3/P4 Ticket", nodeType: NT.CODE, code: "return { ...input, ticket_type: 'NORMAL', sla_hours: 24, auto_page: false, war_room: false };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-classify" },
    { id: "e2", source: "llm-classify", target: "parse-1" },
    { id: "e3", source: "parse-1", target: "switch-1" },
    { id: "e4", source: "switch-1", target: "code-p1", sourceHandle: "p1" },
    { id: "e5", source: "switch-1", target: "code-p2", sourceHandle: "p2" },
    { id: "e6", source: "switch-1", target: "code-p3", sourceHandle: "p3" },
  ],
  [{ name: "incident_report", type: "string", description: "Incident description", required: true }, { name: "reporter", type: "string", description: "Who reported the incident", required: false }],
  [{ name: "ticket", type: "object", description: "Incident ticket with classification and routing", required: true }]
)

// ─── Workflow 10: Product Recommendation ────────────────────────────────────
const productRecommendationWf = wf(
  "Product Recommendation Chatflow",
  "Conversational product recommendation engine using RAG to search product catalog.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Customer Message", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "rag-1", type: NT.RAG_SEARCH, position: { x: 300, y: 150 }, data: { label: "Search Products", nodeType: NT.RAG_SEARCH, knowledgeBaseGroupIds: [], topK: 5, queryTemplate: "{{input.message}}" } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 300 }, data: { label: "Recommend Products", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "You are a friendly product recommendation assistant. Based on the product catalog results and the customer's query, recommend the most relevant products. Explain why each product fits their needs. If asking about price, show comparisons. Ask follow-up questions to refine recommendations.", temperature: 0.5 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 450 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "rag-1" },
    { id: "e2", source: "rag-1", target: "llm-1" },
    { id: "e3", source: "llm-1", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "Customer query", required: true }],
  [{ name: "response", type: "string", description: "Product recommendations", required: true }]
)

// ─── Workflow 11: Compliance Document Check ─────────────────────────────────
const complianceCheckWf = wf(
  "Compliance Document Check",
  "Parallel compliance analysis: check document against policy KB and rule engine, then synthesize findings.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 350, y: 0 }, data: { label: "Submit Document", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "parallel-1", type: NT.PARALLEL, position: { x: 350, y: 150 }, data: { label: "Parallel Analysis", nodeType: NT.PARALLEL } },
    { id: "rag-policy", type: NT.RAG_SEARCH, position: { x: 100, y: 300 }, data: { label: "Search Policies", nodeType: NT.RAG_SEARCH, knowledgeBaseGroupIds: [], topK: 8, queryTemplate: "compliance requirements for: {{input.document_type}}" } },
    { id: "llm-rules", type: NT.LLM, position: { x: 600, y: 300 }, data: { label: "Rule Engine Check", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Check this document against standard compliance rules. For each rule, report: { rule, status: 'pass'|'fail'|'warn', details }. Rules to check: data privacy, retention policy, access controls, encryption requirements, audit trail, consent mechanisms.", temperature: 0.1 } },
    { id: "merge-1", type: NT.MERGE, position: { x: 350, y: 450 }, data: { label: "Merge Findings", nodeType: NT.MERGE } },
    { id: "llm-synthesize", type: NT.LLM, position: { x: 350, y: 600 }, data: { label: "Synthesize Report", nodeType: NT.LLM, model: "anthropic/claude-sonnet-4.5", systemPrompt: "Synthesize the policy search results and rule engine findings into a compliance report. Structure: 1) Overall compliance status (Compliant/Non-Compliant/Partially Compliant), 2) Key findings, 3) Violations (if any) with severity, 4) Recommendations.", temperature: 0.2 } },
    { id: "transform-out", type: NT.TRANSFORM, position: { x: 350, y: 750 }, data: { label: "Format Report", nodeType: NT.TRANSFORM, expression: "return { report: input.text, checked_at: new Date().toISOString() };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "parallel-1" },
    { id: "e2", source: "parallel-1", target: "rag-policy" },
    { id: "e3", source: "parallel-1", target: "llm-rules" },
    { id: "e4", source: "rag-policy", target: "merge-1" },
    { id: "e5", source: "llm-rules", target: "merge-1" },
    { id: "e6", source: "merge-1", target: "llm-synthesize" },
    { id: "e7", source: "llm-synthesize", target: "transform-out" },
  ],
  [{ name: "document", type: "string", description: "Document to check", required: true }, { name: "document_type", type: "string", description: "Type: contract, policy, procedure, etc.", required: false }],
  [{ name: "compliance_report", type: "object", description: "Compliance analysis report", required: true }]
)

// ─── Workflow 12: Appointment Scheduler ─────────────────────────────────────
const appointmentSchedulerWf = wf(
  "Appointment Scheduler Chatflow",
  "Conversational assistant that collects patient info and scheduling preferences to book appointments.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Patient Message", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Scheduling Assistant", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "You are a healthcare appointment scheduling assistant. Collect the following information through natural conversation:\n1. Patient name and date of birth\n2. Type of appointment (checkup, specialist, follow-up, urgent)\n3. Preferred doctor (if any)\n4. Preferred date/time range\n5. Insurance information\n\nBe patient, friendly, and confirm details before finalizing. When all info is collected, provide a summary for confirmation.", temperature: 0.4 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 300 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-1" },
    { id: "e2", source: "llm-1", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "Patient message", required: true }],
  [{ name: "response", type: "string", description: "Scheduling assistant response", required: true }]
)

// ─── Workflow 13: Bug Report Processor ──────────────────────────────────────
const bugReportWf = wf(
  "Bug Report Processor",
  "Parse bug reports, classify severity, extract repro steps, and route to the right team.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "New Bug Report", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-parse", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Parse Bug Report", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Parse this bug report and extract: { title: string, severity: 'critical'|'major'|'minor'|'trivial', component: string, repro_steps: string[], expected_behavior: string, actual_behavior: string, environment: string, assignee_team: 'frontend'|'backend'|'mobile'|'infrastructure'|'qa' }. Return as JSON.", temperature: 0.1 } },
    { id: "parse-1", type: NT.OUTPUT_PARSER, position: { x: 300, y: 300 }, data: { label: "Parse JSON", nodeType: NT.OUTPUT_PARSER, format: "json" } },
    { id: "switch-1", type: NT.CONDITION, position: { x: 300, y: 450 }, data: { label: "Route by Severity", nodeType: NT.CONDITION, conditions: [{ id: "critical", label: "Critical", expression: "input.severity === 'critical'" }, { id: "major", label: "Major", expression: "input.severity === 'major'" }, { id: "minor", label: "Minor/Trivial", expression: "true" }] } },
    { id: "transform-critical", type: NT.TRANSFORM, position: { x: 50, y: 600 }, data: { label: "Critical Bug", nodeType: NT.TRANSFORM, expression: "return { ...input, priority: 'P1', sla: '4 hours', auto_assign: true };" } },
    { id: "transform-major", type: NT.TRANSFORM, position: { x: 300, y: 600 }, data: { label: "Major Bug", nodeType: NT.TRANSFORM, expression: "return { ...input, priority: 'P2', sla: '24 hours', auto_assign: true };" } },
    { id: "transform-minor", type: NT.TRANSFORM, position: { x: 550, y: 600 }, data: { label: "Minor Bug", nodeType: NT.TRANSFORM, expression: "return { ...input, priority: 'P3', sla: '1 week', auto_assign: false };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-parse" },
    { id: "e2", source: "llm-parse", target: "parse-1" },
    { id: "e3", source: "parse-1", target: "switch-1" },
    { id: "e4", source: "switch-1", target: "transform-critical", sourceHandle: "critical" },
    { id: "e5", source: "switch-1", target: "transform-major", sourceHandle: "major" },
    { id: "e6", source: "switch-1", target: "transform-minor", sourceHandle: "minor" },
  ],
  [{ name: "bug_report", type: "string", description: "Raw bug report text", required: true }],
  [{ name: "processed_bug", type: "object", description: "Parsed and classified bug report", required: true }]
)

// ─── Workflow 14: Sales Objection Handler ───────────────────────────────────
const salesObjectionWf = wf(
  "Sales Objection Handler Chatflow",
  "RAG-powered sales assistant that searches the objection playbook to help reps handle customer pushback.",
  "CHATFLOW",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Sales Rep Input", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "rag-1", type: NT.RAG_SEARCH, position: { x: 300, y: 150 }, data: { label: "Search Playbook", nodeType: NT.RAG_SEARCH, knowledgeBaseGroupIds: [], topK: 5, queryTemplate: "objection handling: {{input.message}}" } },
    { id: "llm-1", type: NT.LLM, position: { x: 300, y: 300 }, data: { label: "Generate Response", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "You are a sales coaching assistant. Based on the sales playbook context, help the rep handle the customer's objection. Provide:\n1. Objection type (price, timing, competition, need, authority)\n2. Recommended response framework\n3. Two sample responses (assertive and consultative)\n4. Follow-up question to ask\nBe practical and concise.", temperature: 0.4 } },
    { id: "stream-1", type: NT.STREAM_OUTPUT, position: { x: 300, y: 450 }, data: { label: "Stream Response", nodeType: NT.STREAM_OUTPUT } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "rag-1" },
    { id: "e2", source: "rag-1", target: "llm-1" },
    { id: "e3", source: "llm-1", target: "stream-1" },
  ],
  [{ name: "message", type: "string", description: "Customer objection or sales scenario", required: true }],
  [{ name: "response", type: "string", description: "Objection handling strategy", required: true }]
)

// ─── Workflow 15: Data Extraction Pipeline ──────────────────────────────────
const dataExtractionWf = wf(
  "Data Extraction Pipeline",
  "Extract structured entities from unstructured text: names, dates, amounts, organizations, and custom fields.",
  "STANDARD",
  [
    { id: "trigger-1", type: NT.TRIGGER_MANUAL, position: { x: 300, y: 0 }, data: { label: "Input Text", nodeType: NT.TRIGGER_MANUAL, config: {} } },
    { id: "llm-extract", type: NT.LLM, position: { x: 300, y: 150 }, data: { label: "Extract Entities", nodeType: NT.LLM, model: "openai/gpt-5-mini", systemPrompt: "Extract all structured entities from this text. Return JSON: { people: [{ name, role, context }], organizations: [{ name, type }], dates: [{ value, context }], amounts: [{ value, currency, context }], locations: [{ name, type }], emails: string[], phone_numbers: string[], urls: string[], custom_entities: [{ type, value, context }] }. Only include entities that are actually present.", temperature: 0.1 } },
    { id: "parse-1", type: NT.OUTPUT_PARSER, position: { x: 300, y: 300 }, data: { label: "Parse Entities", nodeType: NT.OUTPUT_PARSER, format: "json" } },
    { id: "transform-1", type: NT.TRANSFORM, position: { x: 300, y: 450 }, data: { label: "Structure Output", nodeType: NT.TRANSFORM, expression: "const entities = input || {};\nconst total = Object.values(entities).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);\nreturn { entities: entities, total_entities: total, extracted_at: new Date().toISOString() };" } },
  ],
  [
    { id: "e1", source: "trigger-1", target: "llm-extract" },
    { id: "e2", source: "llm-extract", target: "parse-1" },
    { id: "e3", source: "parse-1", target: "transform-1" },
  ],
  [{ name: "text", type: "string", description: "Unstructured text to extract entities from", required: true }],
  [{ name: "extraction", type: "object", description: "Structured entities extracted from text", required: true }]
)

// ─── All Workflows ──────────────────────────────────────────────────────────

const COMMUNITY_WORKFLOWS = [
  { name: "community-wf-email-triage", displayName: "Email Triage & Auto-Reply", description: "Classify incoming emails by urgency, route to appropriate handler, and draft auto-replies.", category: "Productivity", icon: "📧", tags: ["email", "triage", "automation", "classification"], featured: true, template: emailTriageWf },
  { name: "community-wf-content-review", displayName: "Content Review Pipeline", description: "Review content for quality, compliance, and brand alignment before publishing.", category: "Content", icon: "✅", tags: ["content", "review", "quality", "publishing"], featured: false, template: contentReviewWf },
  { name: "community-wf-lead-scoring", displayName: "Lead Scoring Pipeline", description: "Parallel lead analysis: company fit, buying intent, and budget signals with score-based routing.", category: "Sales", icon: "🎯", tags: ["sales", "leads", "scoring", "parallel"], featured: true, template: leadScoringWf },
  { name: "community-wf-doc-summarizer", displayName: "Document Summarizer", description: "Extract key points from documents and produce structured summaries with action items.", category: "Productivity", icon: "📄", tags: ["document", "summary", "extraction"], featured: false, template: docSummarizerWf },
  { name: "community-wf-translator", displayName: "Multi-Language Translator", description: "Detect source language, translate text, and format output with quality confidence.", category: "Communication", icon: "🌐", tags: ["translation", "language", "multilingual"], featured: false, template: translatorWf },
  { name: "community-wf-faq-chatbot", displayName: "FAQ Chatbot", description: "RAG-powered FAQ chatbot that searches knowledge base and streams answers.", category: "Customer Support", icon: "💬", tags: ["faq", "chatbot", "rag", "support"], featured: true, template: faqChatbotWf },
  { name: "community-wf-knowledge-qa", displayName: "Knowledge Q&A with Fallback", description: "Search KB first, fall back to general knowledge with disclaimer if no results.", category: "Knowledge", icon: "📚", tags: ["knowledge", "qa", "rag", "fallback"], featured: false, template: knowledgeQAWf },
  { name: "community-wf-interview-screener", displayName: "Interview Screener Chatflow", description: "Interactive screening interview that collects responses and produces candidate assessment.", category: "HR", icon: "🎤", tags: ["hr", "interview", "screening", "hiring"], featured: false, template: interviewScreenerWf },
  { name: "community-wf-incident-response", displayName: "Incident Response Classifier", description: "Classify IT incidents by severity, generate ticket details, and route to appropriate team.", category: "IT", icon: "🚨", tags: ["incident", "it", "classification", "routing"], featured: false, template: incidentResponseWf },
  { name: "community-wf-product-recommendation", displayName: "Product Recommendation Chatflow", description: "Conversational product recommendation engine using RAG to search product catalog.", category: "E-commerce", icon: "🛍️", tags: ["product", "recommendation", "ecommerce", "rag"], featured: false, template: productRecommendationWf },
  { name: "community-wf-compliance-check", displayName: "Compliance Document Check", description: "Parallel compliance analysis against policy KB and rule engine with synthesized report.", category: "Compliance", icon: "📋", tags: ["compliance", "audit", "policy", "parallel"], featured: true, template: complianceCheckWf },
  { name: "community-wf-appointment-scheduler", displayName: "Appointment Scheduler Chatflow", description: "Conversational assistant that collects patient info and preferences to book appointments.", category: "Healthcare", icon: "📅", tags: ["healthcare", "scheduling", "appointment", "chatflow"], featured: false, template: appointmentSchedulerWf },
  { name: "community-wf-bug-report", displayName: "Bug Report Processor", description: "Parse bug reports, classify severity, extract repro steps, and route to the right team.", category: "Development", icon: "🐛", tags: ["bug", "development", "classification", "routing"], featured: false, template: bugReportWf },
  { name: "community-wf-sales-objection", displayName: "Sales Objection Handler Chatflow", description: "RAG-powered sales coaching that searches the playbook to handle customer objections.", category: "Sales", icon: "💼", tags: ["sales", "objection", "coaching", "rag"], featured: false, template: salesObjectionWf },
  { name: "community-wf-data-extraction", displayName: "Data Extraction Pipeline", description: "Extract structured entities (names, dates, amounts, orgs) from unstructured text.", category: "Data", icon: "🔬", tags: ["data", "extraction", "entities", "nlp"], featured: false, template: dataExtractionWf },
]

async function main() {
  console.log(
    isDryRun
      ? "[DRY RUN] Scanning community workflows..."
      : "Seeding community workflow catalog items..."
  )

  let count = 0

  for (const entry of COMMUNITY_WORKFLOWS) {
    if (isDryRun) {
      console.log(`  [workflow] ${entry.displayName} (${entry.name}) — ${entry.template.mode}`)
      console.log(`    Nodes: ${entry.template.nodes.length}, Edges: ${entry.template.edges.length}`)
      count++
      continue
    }

    await prisma.catalogItem.upsert({
      where: { name: entry.name },
      update: {
        displayName: entry.displayName,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        tags: entry.tags,
        featured: entry.featured,
        workflowTemplate: entry.template as object,
      },
      create: {
        name: entry.name,
        displayName: entry.displayName,
        description: entry.description,
        category: entry.category,
        type: "workflow",
        icon: entry.icon,
        tags: entry.tags,
        featured: entry.featured,
        workflowTemplate: entry.template as object,
      },
    })
    console.log(`  Seeded: ${entry.displayName}`)
    count++
  }

  console.log(
    `\n${isDryRun ? "[DRY RUN] Would seed" : "Seeded"}: ${count} community workflows`
  )
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
