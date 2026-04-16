import * as Sentry from "sentry-expo"
import { env } from "./env"

export function initSentry() {
  if (!env.sentryDsn) return
  Sentry.init({
    dsn: env.sentryDsn,
    enableInExpoDevelopment: false,
    debug: false,
  })
}

export const captureException = Sentry.Native.captureException
