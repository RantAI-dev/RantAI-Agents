/**
 * Autentikasi untuk klien mobile (React Native).
 *
 * Web memakai sesi cookie next-auth; mobile memakai JWT Bearer. Modul ini
 * menyediakan penerbitan token saat login dan verifikasi token pada request,
 * ditandatangani dengan NEXTAUTH_SECRET (algoritma HS256) via `jose`.
 */
import { compare } from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "")

export interface MobileUser {
  id: string
  email: string
  name: string | null
  role: string
}

/** Terbitkan JWT untuk user (berlaku 30 hari). */
export async function signMobileToken(user: {
  id: string
  email: string
  role?: string | null
}): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret)
}

/** Verifikasi email+password lalu kembalikan token + data user, atau null. */
export async function loginMobile(
  email: string,
  password: string
): Promise<{ token: string; user: MobileUser } | null> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return null

  const isValid = await compare(password, user.passwordHash)
  if (!isValid) return null

  const token = await signMobileToken(user)
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }
}

/**
 * Verifikasi token mobile mentah (tanpa prefix "Bearer ") dan kembalikan userId,
 * atau null. Dipakai mis. oleh endpoint media yang menerima `?token=` pada URL
 * karena <Image>/<Video> React Native tidak andal mengirim header Authorization.
 */
export async function userIdFromMobileToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

async function userIdFromBearer(header: string | null): Promise<string | null> {
  if (!header?.startsWith("Bearer ")) return null
  return userIdFromMobileToken(header.slice(7))
}

/**
 * Ambil userId dari request: sesi next-auth (web) ATAU header
 * `Authorization: Bearer <jwt>` (mobile). Mengembalikan null bila keduanya
 * tidak valid.
 */
export async function getRequestUserId(request: Request): Promise<string | null> {
  const session = await auth()
  if (session?.user?.id) return session.user.id
  return userIdFromBearer(request.headers.get("authorization"))
}
