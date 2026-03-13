import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orchestrator } from "@/lib/digital-employee"

interface RouteParams {
  params: Promise<{ id: string; path: string[] }>
}

/**
 * GET /api/dashboard/digital-employees/[id]/oauth-proxy/[...path]
 *
 * Proxies OAuth callback requests to the container's gateway OAuth proxy.
 * No auth required — this is the callback URL that OAuth providers (Google, etc.)
 * redirect the user's browser to. The session_id in the path is an unguessable UUID.
 *
 * Flow: Browser → Next.js → Container gateway /oauth-proxy/:session_id/:rest → Tool's local HTTP server
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id, path } = await params

    // Look up employee's group, then get the group's container URL
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id },
      select: { groupId: true },
    })
    if (!employee?.groupId) {
      return new Response("Employee is not running.", { status: 502 })
    }

    const containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
    if (!containerUrl) {
      return new Response("Employee is not running.", { status: 502 })
    }

    const url = new URL(req.url)
    const queryString = url.search // includes the leading ?

    let targetUrl: string
    if (path[0] === "direct") {
      // Direct mode: forward to container root (e.g., /oauth2callback)
      const directPath = path.slice(1).join("/")
      targetUrl = `${containerUrl}/${directPath}${queryString}`
    } else {
      // Session mode: forward through gateway's OAuth proxy
      const fullPath = path.join("/")
      targetUrl = `${containerUrl}/oauth-proxy/${fullPath}${queryString}`
    }

    const proxyResponse = await fetch(targetUrl, {
      headers: {
        accept: req.headers.get("accept") || "text/html",
        "user-agent": req.headers.get("user-agent") || "",
        cookie: req.headers.get("cookie") || "",
      },
      signal: AbortSignal.timeout(30_000),
    })

    const body = await proxyResponse.text()
    const contentType = proxyResponse.headers.get("content-type") || "text/html"

    return new Response(body, {
      status: proxyResponse.status,
      headers: { "Content-Type": contentType },
    })
  } catch (error) {
    console.error("OAuth proxy failed:", error)
    return NextResponse.json({ error: "OAuth proxy error" }, { status: 502 })
  }
}
