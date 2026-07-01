"use client"

// OSS route for the embedded open-design SPA.
//
// Optional catch-all (`[[...slug]]`) so the open-design client router — which
// reads window.location at runtime (src/design/web/router.ts) — owns every
// sub-path under /dashboard/design without Next demanding a matching route for
// each. parseRoute() falls back to the home shell for any path it doesn't
// recognise (e.g. "/dashboard/design"), so the shell renders.
//
// The whole SPA (providers + App + its CSS) is behind a `ssr: false` dynamic
// import so no browser-only code runs during server rendering.

import dynamic from "next/dynamic"

const DesignApp = dynamic(() => import("./design-app"), {
  ssr: false,
  loading: () => (
    <div className="od-loading-shell flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading Design…
    </div>
  ),
})

export default function DesignPage() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <DesignApp />
    </div>
  )
}
