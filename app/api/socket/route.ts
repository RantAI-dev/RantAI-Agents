import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  // This endpoint exists to handle the initial Socket.io handshake
  // The actual Socket.io server is initialized in server.ts
  return NextResponse.json({ message: "Socket.io endpoint" })
}
