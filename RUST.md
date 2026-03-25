# Rust Backend Migration Feasibility Report
## RantAI Agents
## Executive Summary
Migrating the backend to Rust is feasible, but a full rewrite is high-risk and high-effort due to deep coupling with Next.js route handlers, NextAuth session flows, Prisma-based data access, and AI streaming logic.
A **phased migration (strangler pattern)** is strongly recommended:
- Start with machine-to-machine APIs (`/api/runtime/*`).
- Keep Next.js as the web BFF/auth layer initially.
- Incrementally move stateless and performance-sensitive backend modules to Rust.
- Defer complex chat streaming and Socket.io flows until later.
Recommended default target: **hybrid architecture** (Rust services + Next.js BFF), with re-evaluation after 2–3 sprints.
---
## Current Backend Snapshot
### API Surface
- Total route handlers: **168** (`app/api/**/route.ts`)
- Total route LOC: **~19,070 lines**
- Largest route handlers:
  - `app/api/chat/route.ts` (~1005 lines)
  - `app/api/widget/chat/route.ts` (~722 lines)
  - `app/api/dashboard/digital-employees/[id]/chat/route.ts` (~564 lines)
### Coupling/Dependencies
- `next/server` used by most routes.
- Session auth (`auth()`) used by a large portion of dashboard APIs.
- Runtime token auth (`verifyRuntimeToken`) already isolated in `/api/runtime/*`.
- Data layer complexity:
  - Prisma schema with **56 models** and multiple enums.
  - PostgreSQL + SurrealDB + S3 integration.
- Realtime dependencies:
  - Custom server bootstrap in `server.ts`
  - Socket.io server in `lib/socket.ts`
### Architecture Reality
Current backend behavior is spread across route handlers and `lib/*`, with mixed responsibilities:
- HTTP + auth
- Database access
- workflow/chat orchestration
- streaming logic
- integrations/webhooks