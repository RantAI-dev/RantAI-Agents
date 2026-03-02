# Workflow Engine — SOTA AI Workflow Plan

## Vision
Be the best **AI-native workflow engine** — competing with Dify and Flowise, not n8n or Zapier. The moat: **agents and workflows compose seamlessly, and humans stay in control.**

---

## Current State

| Category | Description | Status |
|----------|-------------|--------|
| **TASK** | Attachable to agents as callable jobs | ✅ Schema + UI |
| **CHATFLOW** | Multi-turn conversation with memory | ✅ Schema + UI |
| **AUTOMATION** | Standalone pipeline triggered manually/API | ✅ Schema + UI |

**Keep 3 categories.** Scheduled, event-driven, etc. are trigger types on AUTOMATION — not separate categories.

### Engine Capabilities (28 Node Types, 8 Categories)

The workflow engine is **already more comprehensive than Dify**:

| Category | Nodes | Status |
|----------|-------|--------|
| **Triggers** | `TRIGGER_MANUAL`, `TRIGGER_WEBHOOK`, `TRIGGER_SCHEDULE`, `TRIGGER_EVENT` | ✅ Implemented |
| **AI** | `AGENT` (with full tool/skill/KB resolution), `LLM` | ✅ Implemented |
| **Tools** | `TOOL`, `MCP_TOOL`, `CODE` (vm.runInNewContext, 5s timeout), `HTTP` | ✅ Implemented |
| **Flow Control** | `CONDITION`, `SWITCH`, `LOOP` (foreach/dowhile/dountil), `PARALLEL`, `MERGE`, `ERROR_HANDLER` (retry + fallback), `SUB_WORKFLOW` | ✅ Implemented |
| **Human** | `HUMAN_INPUT`, `APPROVAL`, `HANDOFF` — with suspend/resume engine + API endpoint | ✅ Implemented |
| **Data** | `TRANSFORM`, `FILTER`, `AGGREGATE`, `OUTPUT_PARSER` | ✅ Implemented |
| **Integration** | `RAG_SEARCH`, `DATABASE`, `STORAGE` | ✅ Implemented |
| **Output** | `STREAM_OUTPUT` (Socket.io chunked streaming) | ✅ Implemented |

### What We Already Beat Competitors On
- Agent builder with full tool/skill/KB/MCP wiring — more complete than Dify or Flowise
- Agent node in workflows resolves tools + skills automatically (Dify/Flowise don't do this cleanly)
- Bidirectional agent↔workflow binding via AssistantWorkflow junction table
- Error handler with retry + fallback branches (Dify has no equivalent)
- Parallel + Merge fan-out/fan-in (Dify has basic parallel)
- Stream output node with Socket.io (Dify has no streaming output node)

---

## Competitive Analysis (AI Workflow Only)

| Feature | RantAI | Dify | Flowise |
|---------|--------|------|---------|
| Task Pipeline | ✅ | ✅ | ✅ |
| Chatflow | ✅ | ✅ | ✅ |
| Automation | ✅ | ✅ | ❌ |
| Agent Node (with tools) | ✅ | ✅ | ✅ |
| Multi-Agent Orchestration | Partial | ❌ | ✅ (Agentflow V2) |
| Sub-Workflow | ✅ | ✅ | ❌ |
| HITL / Approval | ✅ | ✅ (basic) | ❌ |
| Iteration / Loop | ✅ | ✅ | ❌ |
| Webhook Trigger | ✅ | ✅ | ❌ |
| Parallel + Merge | ✅ | ✅ | ❌ |
| Error Handler (retry) | ✅ | ❌ | ❌ |
| Code Execution | ✅ | ✅ | ❌ |
| Streaming Output | ✅ | ❌ | ❌ |
| **Workflow-as-Tool** | ✅ | ✅ | ❌ |
| Scheduled / Cron | ✅ | ✅ | ❌ |
| Batch Processing | ❌ | ✅ | ❌ |

**Key takeaway:** RantAI matches or beats Dify on every feature except batch processing (which builds on top of the existing LOOP node). Flowise is far behind.

---

## Implementation Status

### Completed ✅

All major features are implemented:

1. **Sub-Workflow** — `SUB_WORKFLOW` node type (`lib/workflow/nodes/sub-workflow.ts`), calls `workflowEngine.execute()` inline
2. **HITL / Approval** — `HUMAN_INPUT`, `APPROVAL`, `HANDOFF` nodes (`lib/workflow/nodes/human.ts`) with `SuspendError` engine support + `/api/dashboard/workflows/[id]/runs/[runId]/resume` endpoint
3. **Iteration / Loop** — `LOOP` node (`lib/workflow/nodes/loop.ts`) with foreach/dowhile/dountil modes, configurable concurrency, max iterations guard
4. **Webhook Trigger** — Full endpoint at `app/api/workflows/webhook/[path]/route.ts` with HMAC-SHA256 verification, IP allowlisting
5. **Error Handler** — `ERROR_HANDLER` node with retry count + delay + fallback branch
6. **Parallel + Merge** — `PARALLEL` node fans out, `MERGE` node collects with all/any/first strategies
7. **Code Sandbox** — `CODE` node runs in Node.js `vm.runInNewContext` with 5s timeout
8. **Streaming Output** — `STREAM_OUTPUT` node with Socket.io chunked streaming
9. **Workflow-as-Tool** — `resolveToolsForAssistant()` in `lib/tools/registry.ts` resolves `AssistantWorkflow` bindings into callable AI SDK tools, enabling agents to invoke TASK workflows during chat
10. **Scheduled / Cron** — `TRIGGER_SCHEDULE` node + `/api/cron/workflows` endpoint with full cron expression parser (wildcards, steps, ranges, comma-separated), called every minute by external cron service

### Remaining

| Feature | Priority | Notes |
|---------|----------|-------|
| Batch Processing | Low | CSV upload → parallel execution. Builds on existing LOOP node. |
| Multi-Agent Patterns | Low | Supervisor/swarm nodes. Builds on SUB_WORKFLOW + AGENT nodes. |

---

## What We're NOT Building (and why)

| Feature | Why Not |
|---------|---------|
| Durable execution | That's Temporal's entire product. Integrate Temporal if ever needed, don't rebuild it. |
| State machine / cycles | Makes visual editor exponentially harder. LangGraph does this because they're code-first. |
| Goal-oriented / autonomous | Research-grade AI, not a shippable product feature. AutoGPT hype died for a reason. |
| RPA / Desktop | Completely different product category. |

---

## Research Sources

Platforms analyzed during research: Dify, Flowise, n8n, LangGraph, CrewAI, Temporal, Apache Airflow, Power Automate, Zapier/Make, ComfyUI, AutoGPT/BabyAGI.

Full industry analysis (16 workflow types, comparison matrix) preserved in git history of this file.
