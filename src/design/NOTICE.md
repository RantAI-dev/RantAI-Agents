# Design Studio — ported from Open Design

The code under `src/design/web` and `src/design/packages/*` is **ported from
Open Design** (https://github.com/nexu-io/open-design), specifically its
`apps/web` and `packages/*`, and is being adapted from a desktop (local
daemon + Electron) architecture to run on the rantai-agents **web** stack.

Open Design is licensed under the **Apache License, Version 2.0**.
Copyright 2026 Open Design contributors. See http://www.apache.org/licenses/LICENSE-2.0.

## What is being changed in the port (infra only)
- agent CLI subprocess → rantai-agents model gateway (OpenRouter/MiniMax)
- better-sqlite3 → Prisma / Postgres
- local filesystem → S3 / RustFS
- Electron host / sidecar / platform IPC → web stubs

Their components, screens, and UX are preserved. This module is isolated from
the rest of rantai-agents (no reuse of the existing artifact engine).

Plan: `docs/superpowers/plans/2026-07-01-open-design-web-port.md`.
