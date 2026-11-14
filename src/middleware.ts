import { auth } from "@/lib/auth"
import { NextResponse, NextRequest } from "next/server"
import { forwardToRust } from "@/lib/rust-router/forward"
import { rustTarget } from "@/lib/rust-router/routes"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // The API paths in the matcher are here only to reach Rust (RUST_API_URL, RUST_ROUTES);
  // Rust checks the caller itself, and an unrouted one goes on to its Next route untouched.
  // `/v1` is the agent API (Bearer key, no session); Next serves nothing there.
  if (pathname.startsWith("/api/") || pathname.startsWith("/v1/")) {
    const target = rustTarget(request.method, pathname, request.nextUrl.search)
    if (target && !target.route.viaRouteHandler) return forwardToRust(request, target.url)
    return NextResponse.next()
  }

  // Allow login page without auth check
  if (pathname === "/login") {
    return NextResponse.next()
  }

  // Redirect old /agent/login to /login
  if (pathname === "/agent/login" || pathname === "/admin/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // For protected routes, check auth
  const session = await auth()
  const isLoggedIn = !!(session?.user?.email)

  // Redirect old routes to new dashboard
  if (isLoggedIn) {
    if (pathname === "/admin" || pathname === "/admin/") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    if (pathname.startsWith("/admin/settings")) {
      const settingsPath = pathname.replace("/admin/settings", "/dashboard/settings")
      return NextResponse.redirect(new URL(settingsPath, request.url))
    }
    if (pathname === "/agent" || pathname === "/agent/") {
      return NextResponse.redirect(new URL("/dashboard/agent", request.url))
    }
  }

  // Protected routes require login
  if (!isLoggedIn) {
    if (pathname.startsWith("/agent") || pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/login",
    "/agent/:path*",
    "/admin/:path*",
    "/dashboard/:path*",
    // The Rust route groups (src/lib/rust-router/routes.ts). The matcher must be a literal.
    "/api/assistants/:path*",
    "/api/user/default-assistant",
    "/api/user/preferences",
    "/api/mobile/assistants/:path*",
    "/api/mobile/memories/:path*",
    "/api/mobile/login",
    "/api/dashboard/chat/sessions/:path*",
    "/api/dashboard/chat/shared/:path*",
    "/api/dashboard/memory/:path*",
    "/api/dashboard/sso/:path*",
    "/api/dashboard/agent-api-keys/:path*",
    "/api/organizations/:path*",
    // Sign-in only, never NextAuth's /api/auth/session or /api/auth/csrf.
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/sso/:path*",
    "/v1/chat/completions",
  ],
}
