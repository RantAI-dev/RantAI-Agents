import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { decryptCredential } from "@/lib/workflow/credentials"
import { getIntegrationDefinition } from "@/lib/digital-employee/integrations"
import { pushIntegration } from "@/lib/digital-employee/config-push"

interface RouteParams {
  params: Promise<{ id: string; integrationId: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, integrationId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const integration = await prisma.employeeIntegration.findUnique({
      where: { digitalEmployeeId_integrationId: { digitalEmployeeId: id, integrationId } },
    })
    if (!integration || !integration.encryptedData) {
      return NextResponse.json({ error: "No credentials stored" }, { status: 400 })
    }

    const creds = decryptCredential(integration.encryptedData) as Record<string, string>

    // ─── Custom test logic for specific integrations ───────────────
    // These run before the generic fallback so integrations without
    // a testEndpoint can still have custom validation.
    if (integrationId === "telegram") {
      try {
        const res = await fetch(`https://api.telegram.org/bot${creds.botToken}/getMe`, {
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        const ok = res.ok && data.ok
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `Telegram API: ${data.description || `HTTP ${res.status}`}`,
          },
        })
        if (ok) {
          // Push to running container (best-effort)
          const pushResult = await pushIntegration(id, integrationId, creds as Record<string, string>)
          if (pushResult.success) {
            console.log(`[Test] Config pushed to running container for ${integrationId}`)
          }
        }
        return NextResponse.json({
          success: ok,
          status: res.status,
          botUsername: ok ? `@${data.result?.username}` : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    if (integrationId === "whatsapp") {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${creds.phoneNumberId}?access_token=${creds.accessToken}`,
          { signal: AbortSignal.timeout(10000) }
        )
        const data = await res.json()
        const ok = res.ok && !data.error
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `WhatsApp API: ${data.error?.message || `HTTP ${res.status}`}`,
          },
        })
        if (ok) {
          // Push to running container (best-effort)
          const pushResult = await pushIntegration(id, integrationId, creds as Record<string, string>)
          if (pushResult.success) {
            console.log(`[Test] Config pushed to running container for ${integrationId}`)
          }
        }
        return NextResponse.json({
          success: ok,
          status: res.status,
          phoneNumber: ok ? data.display_phone_number : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    if (integrationId === "whatsapp-web") {
      // No remote test possible — validate phone format and mark as pending
      const phone = String(creds.pairPhone || "")
      const validFormat = /^\d{7,15}$/.test(phone)
      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: {
          lastTestedAt: new Date(),
          status: validFormat ? "connected" : "error",
          lastError: validFormat ? null : "Invalid phone number format. Use country code + number without + (e.g. 15551234567)",
        },
      })
      if (validFormat) {
        // Push to running container (best-effort)
        const pushResult = await pushIntegration(id, integrationId, creds as Record<string, string>)
        if (pushResult.success) {
          console.log(`[Test] Config pushed to running container for ${integrationId}`)
        }
      }
      return NextResponse.json({
        success: validFormat,
        message: validFormat
          ? "Phone format valid. Pairing will happen when the employee container starts."
          : "Invalid phone number format",
      })
    }

    if (integrationId === "discord") {
      try {
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bot ${creds.botToken}` },
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        const ok = res.ok
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `Discord API: ${data.message || `HTTP ${res.status}`}`,
          },
        })
        return NextResponse.json({
          success: ok,
          status: res.status,
          botUsername: ok ? `${data.username}#${data.discriminator}` : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    if (integrationId === "slack") {
      try {
        const res = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${creds.botToken}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        const ok = res.ok && data.ok
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `Slack API: ${data.error || `HTTP ${res.status}`}`,
          },
        })
        return NextResponse.json({
          success: ok,
          status: res.status,
          team: ok ? data.team : undefined,
          botUser: ok ? data.user : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    if (integrationId === "linear") {
      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            Authorization: creds.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "{ viewer { id name email } }" }),
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        const ok = res.ok && data.data?.viewer?.id
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `Linear API: ${data.errors?.[0]?.message || `HTTP ${res.status}`}`,
          },
        })
        return NextResponse.json({
          success: !!ok,
          status: res.status,
          user: ok ? data.data.viewer.name : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    if (integrationId === "notion") {
      try {
        const res = await fetch("https://api.notion.com/v1/users/me", {
          headers: {
            Authorization: `Bearer ${creds.token}`,
            "Notion-Version": "2022-06-28",
          },
          signal: AbortSignal.timeout(10000),
        })
        const data = await res.json()
        const ok = res.ok && data.type
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: {
            lastTestedAt: new Date(),
            status: ok ? "connected" : "error",
            lastError: ok ? null : `Notion API: ${data.message || `HTTP ${res.status}`}`,
          },
        })
        return NextResponse.json({
          success: !!ok,
          status: res.status,
          botName: ok ? data.name : undefined,
        })
      } catch (testError) {
        const message = testError instanceof Error ? testError.message : "Connection test failed"
        await prisma.employeeIntegration.update({
          where: { id: integration.id },
          data: { lastTestedAt: new Date(), status: "error", lastError: message },
        })
        return NextResponse.json({ success: false, error: message })
      }
    }

    // ─── Generic test endpoint fallback ────────────────────────────
    const def = getIntegrationDefinition(integrationId)
    if (!def?.testEndpoint) {
      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: { lastTestedAt: new Date() },
      })
      return NextResponse.json({ success: true, message: "No test endpoint configured" })
    }

    // Build auth headers based on credential shape
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (creds.token) headers["Authorization"] = `Bearer ${creds.token}`
    else if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`
    else if (creds.botToken) headers["Authorization"] = `Bearer ${creds.botToken}`

    try {
      const testRes = await fetch(def.testEndpoint, { headers, method: "GET", signal: AbortSignal.timeout(10000) })
      const ok = testRes.ok

      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: {
          lastTestedAt: new Date(),
          status: ok ? "connected" : "error",
          lastError: ok ? null : `Test failed: HTTP ${testRes.status}`,
        },
      })

      if (ok) {
        // Push to running container (best-effort)
        const pushResult = await pushIntegration(id, integrationId, creds as Record<string, string>)
        if (pushResult.success) {
          console.log(`[Test] Config pushed to running container for ${integrationId}`)
        }
      }

      return NextResponse.json({ success: ok, status: testRes.status })
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await prisma.employeeIntegration.update({
        where: { id: integration.id },
        data: { lastTestedAt: new Date(), status: "error", lastError: message },
      })
      return NextResponse.json({ success: false, error: message })
    }
  } catch (error) {
    console.error("Failed to test integration:", error)
    return NextResponse.json({ error: "Failed to test integration" }, { status: 500 })
  }
}
