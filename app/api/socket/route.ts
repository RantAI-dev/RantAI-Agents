import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSocketHandshakePayload } from "@/src/features/platform-routes/socket/service"

export async function GET(request: NextRequest) {
  // This endpoint exists to handle the initial Socket.io handshake
  // The actual Socket.io server is initialized in server.ts
  void request
  return NextResponse.json(getSocketHandshakePayload())
}
