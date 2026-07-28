/**
 * Konteks request untuk endpoint mobile yang butuh scope organisasi.
 *
 * Menggabungkan autentikasi mobile (Bearer JWT via {@link getRequestUserId})
 * dengan resolusi organisasi aktif ({@link resolveActiveOrg}). Karena klien
 * mobile tidak mengirim cookie/header org, resolver otomatis memilih membership
 * pertama user — cukup untuk MVP satu-organisasi.
 */
import { getRequestUserId } from "@/lib/mobile-auth"
import { resolveActiveOrg } from "@/lib/org-context"

export interface MobileContext {
  userId: string
  organizationId: string | null
  role: string | null
}

/**
 * Ambil userId + konteks organisasi dari request mobile. Mengembalikan null
 * bila token tidak valid (caller balas 401).
 */
export async function getMobileContext(
  request: Request
): Promise<MobileContext | null> {
  const userId = await getRequestUserId(request)
  if (!userId) return null

  const org = await resolveActiveOrg(request, userId)
  return {
    userId,
    organizationId: org?.organizationId ?? null,
    role: org?.role ?? null,
  }
}
