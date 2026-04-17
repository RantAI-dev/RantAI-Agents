import * as Notifications from "expo-notifications"
import { handleDeepLink } from "@/lib/deep-links"

/**
 * Configures notification handling for the foreground (banner + sound) and
 * subscribes to taps so that a payload `{ data: { url: "rantai://..." } }`
 * routes the user to the right screen.
 *
 * Returns an unsubscribe fn.
 */
export function configureNotifications(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = (response.notification.request.content.data as any)?.url
    if (typeof url === "string") handleDeepLink(url)
  })

  return () => sub.remove()
}
