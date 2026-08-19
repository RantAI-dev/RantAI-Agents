import { NextResponse } from "next/server"

import { loginMobile } from "@/lib/mobile-auth"

/**
 * POST /api/mobile/login
 * Body: { email, password }
 * Sukses: { token, user }  — token dipakai sebagai `Authorization: Bearer` oleh app mobile.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "Email dan password wajib diisi" },
      { status: 400 }
    )
  }

  const result = await loginMobile(body.email, body.password)
  if ("error" in result) {
    if (result.error === "suspended") {
      return NextResponse.json(
        { error: "Akun Anda ditangguhkan. Hubungi administrator." },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: "Email atau password salah" },
      { status: 401 }
    )
  }

  return NextResponse.json(result)
}
