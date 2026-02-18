import { auth } from "@/lib/auth"
import { NextResponse, NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

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
  matcher: ["/login", "/agent/:path*", "/admin/:path*", "/dashboard/:path*"],
}
