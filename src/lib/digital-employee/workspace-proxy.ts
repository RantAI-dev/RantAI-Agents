import { prisma } from "@/lib/prisma"

/**
 * Proxy a request to an employee's RantaiClaw gateway.
 * Resolves containerPort + gatewayToken through the employee's group,
 * forwards the request with bearer auth, and returns the parsed JSON response.
 */
export async function proxyToGateway(
  employeeId: string,
  path: string,
  options?: { method?: string; body?: unknown; timeout?: number }
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { groupId: true },
  })

  if (!employee?.groupId) {
    return { ok: false, status: 503, data: { error: "Employee has no team" } }
  }

  const group = await prisma.employeeGroup.findUnique({
    where: { id: employee.groupId },
    select: { containerPort: true, gatewayToken: true },
  })

  if (!group?.containerPort) {
    return { ok: false, status: 503, data: { error: "Team container not running" } }
  }

  const url = `http://localhost:${group.containerPort}${path}`

  const fetchOptions: RequestInit = {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(group.gatewayToken
        ? { Authorization: `Bearer ${group.gatewayToken}` }
        : {}),
    },
    signal: AbortSignal.timeout(options?.timeout ?? 30000),
  }

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  try {
    const res = await fetch(url, fetchOptions)
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gateway request failed"
    return { ok: false, status: 502, data: { error: message } }
  }
}
