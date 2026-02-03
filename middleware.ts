import { auth } from "@/lib/auth"
import { NextResponse, NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Always allow login pages without any auth check
  if (pathname === "/agent/login" || pathname === "/admin/login") {
    return NextResponse.next()
  }

  // For protected routes, check auth
  const session = await auth()
  const isLoggedIn = !!(session?.user?.email)
  const userType = session?.user?.userType

  // Redirect old routes to new dashboard (for logged-in agents)
  if (isLoggedIn && userType === "agent") {
    // /admin → /dashboard
    if (pathname === "/admin" || pathname === "/admin/") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    // /admin/settings/* → /dashboard/settings/*
    if (pathname.startsWith("/admin/settings")) {
      const settingsPath = pathname.replace("/admin/settings", "/dashboard/settings")
      return NextResponse.redirect(new URL(settingsPath, request.url))
    }
    // /agent (not /agent/login) → /dashboard/agent
    if (pathname === "/agent" || pathname === "/agent/") {
      return NextResponse.redirect(new URL("/dashboard/agent", request.url))
    }
  }

  // Agent/Admin/Dashboard routes - require login
  if (pathname.startsWith("/agent") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/agent/login", request.url))
  }

  if (pathname.startsWith("/admin") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/agent/login", request.url))
  }

  if (pathname.startsWith("/dashboard")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/agent/login", request.url))
    }
    // Only agents can access dashboard (no customer type in this app)
    if (userType === "customer") {
      return NextResponse.redirect(new URL("/agent/login", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/agent/:path*", "/admin/:path*", "/dashboard/:path*"],
}
