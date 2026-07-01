"use client"

// Client-only mount for the vendored open-design SPA (src/design/web).
//
// In upstream open-design this tree was mounted by apps/web/app/layout.tsx
// (which supplied <html>, the theme-init inline script, and the I18n +
// Analytics providers) plus apps/web/app/[[...slug]]/client-app.tsx (which
// `next/dynamic`-imported `src/App` with `ssr: false`). We can't own the root
// layout here — the SPA is embedded inside the RantAI dashboard shell — so we
// replicate the two provider wrappers and the global CSS imports at this
// boundary instead, and let the parent page apply the `ssr: false` dynamic
// import so NONE of this module (providers included) is evaluated during SSR.
//
// The SPA is fully client-driven (localStorage, window.location, its own
// popstate router). Backend calls (fetchAgentsStream, fetchDesignSystems, …)
// will 404 until the open-design daemon API is ported; those are handled in
// effects and only degrade data, they do not block the shell from rendering.

// Foundation + home styles, mirroring apps/web/app/layout.tsx.
import "@/design/web/index.css"
import "@/design/web/styles/home/index.css"

import { App } from "@/design/web/App"
import { I18nProvider } from "@/design/web/i18n"
import { AnalyticsProvider } from "@/design/web/analytics/provider"

// NOTE: upstream also called installErrorHandlers() + installWebObservability()
// at module load (apps/web/app/[[...slug]]/client-app.tsx). Those are analytics
// infrastructure and are intentionally omitted here to keep the boot surface
// minimal for the shell bring-up; re-add them behind this boundary if the
// observability pipeline is ported.

export default function DesignApp() {
  return (
    <I18nProvider>
      <AnalyticsProvider>
        <App />
      </AnalyticsProvider>
    </I18nProvider>
  )
}
