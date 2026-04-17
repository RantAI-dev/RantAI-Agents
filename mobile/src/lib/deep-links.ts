import { Linking } from "react-native"
import { router } from "expo-router"

/**
 * Routes for deep links served from the universal-links domain or from a
 * push notification payload.
 *
 * Supported URL shapes:
 *   rantai://conversation/:id
 *   rantai://assistant/:id
 *   rantai://digital-employee/:id
 *   rantai://settings/:section
 */
export function handleDeepLink(url: string | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
    const host = parsed.host || segments.shift() || ""

    switch (host) {
      case "conversation": {
        const id = segments[0] ?? parsed.pathname.replace(/^\/+/, "").split("/")[0]
        if (id) router.push(`/(tabs)/chat/${id}`)
        return !!id
      }
      case "assistant": {
        const id = segments[0]
        if (id) router.push(`/(tabs)/agents/assistants/${id}`)
        return !!id
      }
      case "digital-employee": {
        const id = segments[0]
        if (id) router.push(`/(tabs)/agents/digital-employees/${id}`)
        return !!id
      }
      case "settings": {
        const section = segments[0]
        if (section) router.push(`/(tabs)/account/settings/${section}`)
        return !!section
      }
      default:
        return false
    }
  } catch {
    return false
  }
}

/** Subscribes to deep-link events. Returns an unsubscribe fn. */
export function subscribeDeepLinks(): () => void {
  // Cold-start link.
  Linking.getInitialURL()
    .then((url) => handleDeepLink(url))
    .catch(() => {})
  // Warm-start links.
  const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url))
  return () => sub.remove()
}
