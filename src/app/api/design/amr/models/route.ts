import { NextResponse } from "next/server"
import type { AmrModelsResponse } from "@open-design/contracts"

// GET /api/design/amr/models
//
// In the daemon (apps/daemon/src/routes/vela.ts) this proxies the locally-run
// AMR/Vela CLI to list that account's available models. AMR is a desktop-only,
// per-machine integration that the cloud build does not run, so we return a
// valid, empty `AmrModelsResponse`. The SPA's `fetchAmrModels` accepts this and
// simply shows no AMR models (its own model list stays intact).
export function GET() {
  const body: AmrModelsResponse = {
    source: "preset",
    models: [],
    refreshing: false,
  }
  return NextResponse.json(body)
}
