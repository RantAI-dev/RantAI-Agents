/**
 * Pushes config changes to a running employee container via the Config API.
 * If container isn't running, push fails silently — agent-runner picks up at next start.
 *
 * Container info (containerPort, gatewayToken) lives on the EmployeeGroup,
 * not DigitalEmployee. We resolve via employee.groupId.
 */

import { prisma } from "@/lib/prisma"
import { getMcpServerConfig, isMcpIntegration } from "./mcp-mapping"

interface PushResult {
  success: boolean
  applied?: Record<string, unknown>
  error?: string
}

async function getContainerUrl(employeeId: string): Promise<{ url: string; token: string } | null> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { groupId: true },
  })

  if (!employee?.groupId) {
    return null
  }

  const group = await prisma.employeeGroup.findUnique({
    where: { id: employee.groupId },
    select: { containerPort: true, gatewayToken: true, status: true },
  })

  if (!group?.containerPort) {
    return null
  }

  return {
    url: `http://localhost:${group.containerPort}`,
    token: group.gatewayToken || "",
  }
}

async function patchConfig(
  employeeId: string,
  endpoint: string,
  body: unknown,
): Promise<PushResult> {
  try {
    const container = await getContainerUrl(employeeId)
    if (!container) {
      return { success: false, error: "Container not running" }
    }
    if (!container.token) {
      return { success: false, error: "No runtime token" }
    }

    const res = await fetch(`${container.url}${endpoint}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${container.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    return {
      success: res.ok && data.ok !== false,
      applied: data.applied,
      error: data.error || (res.ok ? undefined : `HTTP ${res.status}`),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config push failed"
    return { success: false, error: message }
  }
}

export async function pushMcpServer(
  employeeId: string,
  integrationId: string,
  credentials: Record<string, string>,
): Promise<PushResult> {
  const mcpConfig = getMcpServerConfig(integrationId, credentials)
  if (!mcpConfig) {
    return { success: false, error: `No MCP mapping for '${integrationId}'` }
  }
  return patchConfig(employeeId, "/config/mcp-servers", {
    [integrationId]: mcpConfig,
  })
}

export async function removeMcpServer(
  employeeId: string,
  integrationId: string,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/mcp-servers", {
    [integrationId]: null,
  })
}

export async function pushChannel(
  employeeId: string,
  channelId: string,
  config: Record<string, unknown>,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/channels", {
    [channelId]: config,
  })
}

export async function removeChannel(
  employeeId: string,
  channelId: string,
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/channels", {
    [channelId]: null,
  })
}

export async function pushModel(
  employeeId: string,
  model: { provider?: string; model?: string; temperature?: number },
): Promise<PushResult> {
  return patchConfig(employeeId, "/config/model", model)
}

export async function pushIntegration(
  employeeId: string,
  integrationId: string,
  credentials: Record<string, string>,
): Promise<PushResult> {
  if (isMcpIntegration(integrationId)) {
    return pushMcpServer(employeeId, integrationId, credentials)
  }
  return pushChannel(employeeId, integrationId, credentials)
}

export async function removeIntegration(
  employeeId: string,
  integrationId: string,
): Promise<PushResult> {
  if (isMcpIntegration(integrationId)) {
    return removeMcpServer(employeeId, integrationId)
  }
  return removeChannel(employeeId, integrationId)
}
