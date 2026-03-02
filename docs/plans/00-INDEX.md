# RantAI Digital Employee Platform — Planning Documents

## Document Index

### Foundation (Build First)
| # | Document | Scope | Priority |
|---|----------|-------|----------|
| 01 | [Workflow Composition Model](./01-WORKFLOW-COMPOSITION.md) | Connect workflows to agents as attachable "jobs" | P0 — Prerequisite for everything |
| 02 | [Knowledge Base Relations](./02-KNOWLEDGE-BASE-RELATIONS.md) | Fix KB→Agent binding to proper junction table | P0 — Data integrity |
| 03 | [Agent Node Full Execution](./03-AGENT-NODE-EXECUTION.md) | Agent nodes in workflows run with full capabilities | P0 — Agents must work in workflows |
| 04 | [Trigger Infrastructure](./04-TRIGGER-INFRASTRUCTURE.md) | Cron scheduler + event bus for workflow triggers | P1 — Required for autonomous execution |

### Digital Employee Platform (Build After Foundation)
| # | Document | Scope | Priority |
|---|----------|-------|----------|
| 05 | [Digital Employee Data Model](./05-DIGITAL-EMPLOYEE-MODEL.md) | Employee Package schema, lifecycle, deployment config | P1 |
| 06 | [Runtime Layer — Agentic OS](./06-RUNTIME-AGENTIC-OS.md) | Firecracker + Alpine + ZeroClaw + agent runtime | P1 |
| 07 | [Interaction Layer — Gateway](./07-INTERACTION-GATEWAY.md) | Human-in-the-loop via WhatsApp/Telegram/Discord/Slack | P2 |
| 08 | [Management Layer — HR Dashboard](./08-MANAGEMENT-DASHBOARD.md) | Employee directory, onboarding, supervisor Kanban | P2 |
| 09 | [Multi-Employee Coordination](./09-MULTI-EMPLOYEE-COORDINATION.md) | Employee pipelines, team workflows, shared context | P3 |
| 10 | [Implementation Roadmap](./10-IMPLEMENTATION-ROADMAP.md) | Phased delivery plan with milestones | — |

## Reading Order

1. Start with **01-03** (Foundation) — these are bugs/gaps in the current platform that block everything
2. Read **04** (Triggers) — the bridge between "manual platform" and "autonomous execution"
3. Read **05-06** together — the Digital Employee model and its runtime
4. Read **07-08** — the human interaction and management layers
5. **09** is future (Phase 4+)
6. **10** ties it all together into a delivery plan

## Key Principle

> The existing platform (chat, agent builder, workflows, KB, tools, MCP) stays fully intact.
> Digital Employee is an **additive consumer layer** — it reads from existing components, bundles them into deployable packages, and runs them in isolated environments.
> No existing user workflow breaks. No existing data model changes meaning. New tables and fields are added; nothing is removed.
