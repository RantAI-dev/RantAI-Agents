import { prisma } from "@/lib/prisma"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
  /** Optional notification category for actionable replies on iOS. */
  categoryId?: string
}

interface ExpoPushTicket {
  status: "ok" | "error"
  id?: string
  message?: string
  details?: { error?: string }
}

/**
 * Sends a push notification to every active device registered for the given
 * userId. Uses the Expo Push Service (no APNs/FCM secrets required).
 *
 * Marks tokens that come back as `DeviceNotRegistered` as revoked so we stop
 * trying.
 *
 * Fire-and-forget on failure — push is best-effort and must never block the
 * caller's response.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const tokens = await prisma.mobilePushToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, expoPushToken: true },
  })
  if (tokens.length === 0) return

  // Expo accepts up to 100 messages per request.
  const batches: { id: string; expoPushToken: string }[][] = []
  for (let i = 0; i < tokens.length; i += 100) {
    batches.push(tokens.slice(i, i + 100))
  }

  for (const batch of batches) {
    const messages = batch.map((t) => ({
      to: t.expoPushToken,
      sound: "default" as const,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
    }))

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { data?: ExpoPushTicket[] }
      const tickets = json.data ?? []
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]
        if (
          ticket?.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          await prisma.mobilePushToken.update({
            where: { id: batch[i].id },
            data: { revokedAt: new Date() },
          }).catch(() => {})
        }
      }
    } catch {
      // Network errors are silently swallowed — push is best-effort.
    }
  }
}
