import { NextResponse } from "next/server"
import type { OpenDesignDiscordPresenceResponse } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/community/discord  (SPA fetches /api/community/discord).
//
// Daemon shape (apps/daemon/src/routes/open-design-public-metadata.ts): live
// Discord presence (online/member counts) fetched from Discord's public widget
// API and cached. This is upstream open-design community chrome, not a
// RantAI-cloud feature; rather than proxy Discord we return a stable, `stale`
// shaped payload with zero counts so the SPA (components/useDiscordPresence.ts)
// renders the invite affordance without live numbers instead of 404-ing.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: OpenDesignDiscordPresenceResponse = {
    inviteCode: "9ptkbbqRu",
    inviteUrl: "https://discord.gg/9ptkbbqRu",
    onlineCount: 0,
    memberCount: 0,
    fetchedAt: Date.now(),
    stale: true,
  }
  return NextResponse.json(body)
}
