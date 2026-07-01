import { NextResponse } from "next/server"

// GET /api/design/media/providers/elevenlabs/voices?limit=<n>
//
// The daemon (apps/daemon/src/routes/media.ts) calls the ElevenLabs API with the
// user's BYOK key to list available TTS voices. No server-side media BYOK store
// is ported, so we return an empty voice list. The SPA's
// `fetchElevenLabsVoiceOptions` reads `payload.voices` and simply shows no
// ElevenLabs voices in the audio picker.
export function GET() {
  return NextResponse.json({ voices: [] })
}
