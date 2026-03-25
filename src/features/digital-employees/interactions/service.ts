import { INTEGRATION_REGISTRY, getIntegrationDefinition } from "@/lib/digital-employee/integrations"
import { listClawHubSkills, searchClawHub, installClawHubSkill } from "@/lib/digital-employee/clawhub"
import { orchestrator } from "@/lib/digital-employee"
import { encryptCredential, decryptCredential } from "@/lib/workflow/credentials"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"
import type { EmployeeSchedule } from "@/lib/digital-employee/types"
import type { Prisma } from "@prisma/client"
import { pushIntegration, removeIntegration } from "@/lib/digital-employee/config-push"
import {
  createDigitalEmployeeWebhook,
  deleteDigitalEmployeeIntegration,
  deleteDigitalEmployeeInstalledSkill,
  deleteDigitalEmployeeWebhook,
  findDigitalEmployeeContext,
  findDigitalEmployeeIntegrationById,
  findDigitalEmployeeIntegrations,
  findDigitalEmployeeMessages,
  findDigitalEmployeeOAuthContext,
  findDigitalEmployeeSkillsContext,
  findDigitalEmployeeTriggersContext,
  findDigitalEmployeeWebhooks,
  updateDigitalEmployeeDeploymentConfig,
  updateDigitalEmployeeIntegration,
  updateDigitalEmployeeInstalledSkill,
  updateDigitalEmployeeWebhook,
  upsertDigitalEmployeeIntegration,
} from "./repository"
import type {
  DashboardDigitalEmployeeIntegrationCreateInput,
  DashboardDigitalEmployeeIntegrationUpdateInput,
  DashboardDigitalEmployeeMessageListInput,
  DashboardDigitalEmployeeSkillInstallInput,
  DashboardDigitalEmployeeSkillSearchInput,
  DashboardDigitalEmployeeSkillUpdateInput,
  DashboardDigitalEmployeeTriggerCreateInput,
  DashboardDigitalEmployeeTriggerUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<ServiceError>
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type DigitalEmployeeSkillsContext = NonNullable<
  Awaited<ReturnType<typeof findDigitalEmployeeSkillsContext>>
>
type AssistantSkillEntry = NonNullable<
  DigitalEmployeeSkillsContext["assistant"]
>["skills"][number]
type AssistantToolEntry = NonNullable<
  DigitalEmployeeSkillsContext["assistant"]
>["tools"][number]
type EmployeeWebhookEntry = Awaited<
  ReturnType<typeof findDigitalEmployeeWebhooks>
>[number]

async function assertAccessibleEmployee(params: {
  id: string
  organizationId: string | null
}) {
  const employee = await findDigitalEmployeeContext(params)
  if (!employee) {
    return { status: 404, error: "Not found" } satisfies ServiceError
  }
  return employee
}

/**
 * Lists employee messages with optional pagination.
 */
export async function listDigitalEmployeeMessages(params: {
  id: string
  organizationId: string | null
  query: DashboardDigitalEmployeeMessageListInput
}): Promise<{ messages: unknown[] } | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const limit = params.query.limit ?? 50
  const before = params.query.before ? new Date(params.query.before) : null

  const messages = await findDigitalEmployeeMessages({
    id: params.id,
    before,
    limit,
  })

  return { messages }
}

/**
 * Lists the registry-backed integrations and their connection state.
 */
export async function listDigitalEmployeeIntegrations(params: {
  id: string
  organizationId: string | null
}): Promise<Array<Record<string, unknown>> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const connected = await findDigitalEmployeeIntegrations(params.id)

  return INTEGRATION_REGISTRY.map((def) => {
    const current = connected.find((item) => item.integrationId === def.id)
    return {
      ...def,
      connectionId: current?.id ?? null,
      status: current?.status ?? "disconnected",
      connectedAt: current?.connectedAt ?? null,
      lastTestedAt: current?.lastTestedAt ?? null,
      lastError: current?.lastError ?? null,
      metadata: current?.metadata ?? {},
    }
  })
}

/**
 * Creates or updates an employee integration.
 */
export async function connectDigitalEmployeeIntegration(params: {
  id: string
  organizationId: string | null
  userId: string
  employeeOrganizationId?: string | null
  input: DashboardDigitalEmployeeIntegrationCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const def = getIntegrationDefinition(params.input.integrationId)
  if (!def) {
    return { status: 400, error: "Unknown integration" }
  }

  const encryptedData = params.input.credentials
    ? encryptCredential(params.input.credentials)
    : null

  const integration = await upsertDigitalEmployeeIntegration({
    id: params.id,
    integrationId: params.input.integrationId,
    status: encryptedData ? "connected" : "disconnected",
    encryptedData,
    metadata: (params.input.metadata ?? {}) as Prisma.InputJsonValue,
    connectedAt: encryptedData ? new Date() : null,
  })

  await logAudit({
    organizationId: (employee.organizationId ?? params.employeeOrganizationId) as string,
    employeeId: params.id,
    userId: params.userId,
    action: AUDIT_ACTIONS.INTEGRATION_CONNECT,
    resource: `integration:${params.input.integrationId}`,
    detail: { integrationId: params.input.integrationId },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.INTEGRATION_CONNECT),
  }).catch(() => {})

  return integration as Record<string, unknown>
}

/**
 * Updates an employee integration and optionally pushes credentials to the runtime.
 */
export async function updateDigitalEmployeeIntegrationForDashboard(params: {
  id: string
  organizationId: string | null
  integrationId: string
  input: DashboardDigitalEmployeeIntegrationUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const encryptedData =
    params.input.credentials !== undefined
      ? params.input.credentials
        ? encryptCredential(params.input.credentials)
        : null
      : undefined

  const integration = await updateDigitalEmployeeIntegration({
    id: params.id,
    integrationId: params.integrationId,
    data: {
      ...(encryptedData !== undefined && {
        encryptedData,
        connectedAt: new Date(),
        status: "connected",
      }),
      ...(params.input.metadata !== undefined && { metadata: params.input.metadata }),
      lastError: null,
    },
  })

  if (params.input.credentials) {
    const pushResult = await pushIntegration(
      params.id,
      params.integrationId,
      params.input.credentials as Record<string, string>
    )
    if (pushResult.success) {
      console.log(`[Config Push] ${params.integrationId} pushed to employee ${params.id}`)
    }
  }

  return integration as Record<string, unknown>
}

/**
 * Deletes an employee integration and removes it from the runtime container.
 */
export async function deleteDigitalEmployeeIntegrationForDashboard(params: {
  id: string
  organizationId: string | null
  integrationId: string
}): Promise<{ success: true } | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  await deleteDigitalEmployeeIntegration({ id: params.id, integrationId: params.integrationId })
  const pushResult = await removeIntegration(params.id, params.integrationId)
  if (pushResult.success) {
    console.log(`[Config Push] ${params.integrationId} removed from employee ${params.id}`)
  }

  return { success: true }
}

/**
 * Tests a stored employee integration.
 */
export async function testDigitalEmployeeIntegration(params: {
  id: string
  organizationId: string | null
  integrationId: string
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const integration = await findDigitalEmployeeIntegrationById({
    id: params.id,
    integrationId: params.integrationId,
  })
  if (!integration || !integration.encryptedData) {
    return { status: 400, error: "No credentials stored" }
  }

  const creds = decryptCredential(integration.encryptedData) as Record<string, string>
  const integrationId = params.integrationId

  const updateStatus = async (data: Record<string, unknown>) => {
    await updateDigitalEmployeeIntegration({
      id: params.id,
      integrationId,
      data,
    })
  }

  if (integrationId === "telegram") {
    try {
      const res = await fetch(`https://api.telegram.org/bot${creds.botToken}/getMe`, {
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      const ok = res.ok && data.ok
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `Telegram API: ${data.description || `HTTP ${res.status}`}`,
      })
      if (ok) {
        const pushResult = await pushIntegration(params.id, integrationId, creds)
        if (pushResult.success) {
          console.log(`[Test] Config pushed to running container for ${integrationId}`)
        }
      }
      return {
        success: ok,
        status: res.status,
        botUsername: ok ? `@${data.result?.username}` : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
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
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `WhatsApp API: ${data.error?.message || `HTTP ${res.status}`}`,
      })
      if (ok) {
        const pushResult = await pushIntegration(params.id, integrationId, creds)
        if (pushResult.success) {
          console.log(`[Test] Config pushed to running container for ${integrationId}`)
        }
      }
      return {
        success: ok,
        status: res.status,
        phoneNumber: ok ? data.display_phone_number : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
    }
  }

  if (integrationId === "whatsapp-web") {
    const phone = String(creds.pairPhone || "")
    const validFormat = /^\d{7,15}$/.test(phone)
    await updateStatus({
      lastTestedAt: new Date(),
      status: validFormat ? "connected" : "error",
      lastError: validFormat
        ? null
        : "Invalid phone number format. Use country code + number without + (e.g. 15551234567)",
    })
    if (validFormat) {
      const pushResult = await pushIntegration(params.id, integrationId, creds)
      if (pushResult.success) {
        console.log(`[Test] Config pushed to running container for ${integrationId}`)
      }
    }
    return {
      success: validFormat,
      message: validFormat
        ? "Phone format valid. Pairing will happen when the employee container starts."
        : "Invalid phone number format",
    }
  }

  if (integrationId === "discord") {
    try {
      const res = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${creds.botToken}` },
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      const ok = res.ok
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `Discord API: ${data.message || `HTTP ${res.status}`}`,
      })
      return {
        success: ok,
        status: res.status,
        botUsername: ok ? `${data.username}#${data.discriminator}` : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
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
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `Slack API: ${data.error || `HTTP ${res.status}`}`,
      })
      return {
        success: ok,
        status: res.status,
        team: ok ? data.team : undefined,
        botUser: ok ? data.user : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
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
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `Linear API: ${data.errors?.[0]?.message || `HTTP ${res.status}`}`,
      })
      return {
        success: !!ok,
        status: res.status,
        user: ok ? data.data.viewer.name : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
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
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `Notion API: ${data.message || `HTTP ${res.status}`}`,
      })
      return {
        success: !!ok,
        status: res.status,
        user: ok ? data.name : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
    }
  }

  if (integrationId === "github") {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${creds.token}` },
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      const ok = res.ok
      await updateStatus({
        lastTestedAt: new Date(),
        status: ok ? "connected" : "error",
        lastError: ok ? null : `GitHub API: ${data.message || `HTTP ${res.status}`}`,
      })
      return {
        success: ok,
        status: res.status,
        user: ok ? data.login : undefined,
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
    }
  }

  const def = getIntegrationDefinition(integrationId)
  if (def?.testEndpoint) {
    try {
      const headers: Record<string, string> = {}
      if (creds.token) headers.Authorization = `Bearer ${creds.token}`
      else if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`
      else if (creds.botToken) headers.Authorization = `Bearer ${creds.botToken}`
      const res = await fetch(def.testEndpoint, {
        headers,
        method: "GET",
        signal: AbortSignal.timeout(10000),
      })
      await updateStatus({
        lastTestedAt: new Date(),
        status: res.ok ? "connected" : "error",
        lastError: res.ok ? null : `HTTP ${res.status}`,
      })
      return { success: res.ok, status: res.status }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : "Connection test failed"
      await updateStatus({
        lastTestedAt: new Date(),
        status: "error",
        lastError: message,
      })
      return { success: false, error: message }
    }
  }

  return { success: true, message: "No test endpoint" }
}

/**
 * Lists installed platform and ClawHub skills for the employee.
 */
export async function listDigitalEmployeeSkills(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDigitalEmployeeSkillsContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return {
    platform: (employee.assistant?.skills ?? []).map((entry: AssistantSkillEntry) => ({
      id: entry.skill.id,
      name: entry.skill.displayName || entry.skill.name,
      description: entry.skill.description,
      source: "platform",
      enabled: entry.enabled,
      icon: entry.skill.source === "openclaw" ? "🐾" : "📝",
      category: entry.skill.source,
      tags: [],
    })),
    clawhub: employee.installedSkills,
  }
}

/**
 * Installs a ClawHub skill for the employee.
 */
export async function installDigitalEmployeeSkill(params: {
  id: string
  organizationId: string | null
  userId: string
  input: DashboardDigitalEmployeeSkillInstallInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  if (!params.input.slug) {
    return { status: 400, error: "Slug is required" }
  }

  if (params.input.source !== "clawhub") {
    return { status: 400, error: "Unsupported source" }
  }

  const skill = await installClawHubSkill(params.id, params.input.slug, params.userId)
  return skill as Record<string, unknown>
}

/**
 * Enables or disables an installed skill.
 */
export async function updateDigitalEmployeeSkill(params: {
  id: string
  organizationId: string | null
  skillId: string
  input: DashboardDigitalEmployeeSkillUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee
  return updateDigitalEmployeeInstalledSkill({ id: params.skillId, enabled: params.input.enabled }) as Promise<Record<string, unknown>>
}

/**
 * Removes an installed skill from the employee.
 */
export async function deleteDigitalEmployeeSkill(params: {
  id: string
  organizationId: string | null
  skillId: string
}): Promise<{ success: true } | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee
  await deleteDigitalEmployeeInstalledSkill(params.skillId)
  return { success: true }
}

/**
 * Searches ClawHub skills.
 */
export async function searchDigitalEmployeeSkills(params: {
  id: string
  organizationId: string | null
  query: DashboardDigitalEmployeeSkillSearchInput
}): Promise<{ results: unknown[] } | ServiceError> {
  const employee = await assertAccessibleEmployee({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (isServiceError(employee)) return employee

  const q = params.query.q || ""
  const results = q.trim() ? await searchClawHub(q) : await listClawHubSkills()
  return { results: (results ?? []) as unknown[] }
}

/**
 * Lists platform and custom tools for an employee.
 */
export async function listDigitalEmployeeTools(params: {
  id: string
  organizationId: string | null
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDigitalEmployeeSkillsContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  return {
    platform: (employee.assistant?.tools ?? []).map((entry: AssistantToolEntry) => ({
      id: entry.tool.id,
      name: entry.tool.name,
      displayName: entry.tool.displayName,
      description: entry.tool.description,
      category: entry.tool.category,
      icon: entry.tool.icon,
      isBuiltIn: entry.tool.isBuiltIn,
      enabled: entry.enabled,
    })),
    custom: employee.customTools,
  }
}

/**
 * Lists employee triggers.
 */
export async function listDigitalEmployeeTriggers(params: {
  id: string
  organizationId: string | null
}): Promise<unknown[] | ServiceError> {
  const employee = await findDigitalEmployeeTriggersContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const webhooks = await findDigitalEmployeeWebhooks(params.id)
  const config = (employee.deploymentConfig as Record<string, unknown> | null) || {}
  const schedules = ((config.schedules as EmployeeSchedule[]) || []).map((schedule) => ({
    id: schedule.id,
    type: "cron" as const,
    name: schedule.name,
    config: { cron: schedule.cron, workflowId: schedule.workflowId },
    enabled: schedule.enabled,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdAt: null,
  }))
  return [
    ...schedules,
    ...webhooks.map((webhook: EmployeeWebhookEntry) => ({
      id: webhook.id,
      type: webhook.type,
      name: webhook.name,
      token: webhook.token,
      config: webhook.config,
      filterRules: webhook.filterRules,
      enabled: webhook.enabled,
      triggerCount: webhook.triggerCount,
      lastTriggeredAt: webhook.lastTriggeredAt,
      createdAt: webhook.createdAt,
    })),
  ]
}

/**
 * Creates a trigger for an employee.
 */
export async function createDigitalEmployeeTrigger(params: {
  id: string
  organizationId: string | null
  input: DashboardDigitalEmployeeTriggerCreateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDigitalEmployeeTriggersContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  if (!params.input.type || !params.input.name) {
    return { status: 400, error: "type and name required" }
  }

  if (params.input.type === "cron") {
    const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
    const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || []).slice()
      const newSchedule: EmployeeSchedule = {
        id: `sched_${Date.now()}`,
        name: params.input.name,
        cron: (params.input.config?.cron as string) || "0 * * * *",
        workflowId: params.input.config?.workflowId as string | undefined,
      input: params.input.config?.input as Record<string, unknown> | undefined,
        enabled: true,
      }
    schedules.push(newSchedule)
    await updateDigitalEmployeeDeploymentConfig({
      id: params.id,
      deploymentConfig: { ...deployConfig, schedules } as object,
    })
    return { id: newSchedule.id, type: "cron", name: params.input.name, config: params.input.config }
  }

  return createDigitalEmployeeWebhook({
    id: params.id,
    type: params.input.type,
    name: params.input.name,
    config: (isObjectRecord(params.input.config) ? params.input.config : {}) as Prisma.InputJsonValue,
    filterRules: (Array.isArray(params.input.filterRules) ? params.input.filterRules : []) as Prisma.InputJsonValue,
  }) as Promise<Record<string, unknown>>
}

/**
 * Updates a trigger.
 */
export async function updateDigitalEmployeeTrigger(params: {
  id: string
  organizationId: string | null
  triggerId: string
  input: DashboardDigitalEmployeeTriggerUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const employee = await findDigitalEmployeeTriggersContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
  const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || []).slice()
  const schedIdx = schedules.findIndex((schedule) => schedule.id === params.triggerId)

  if (schedIdx >= 0) {
    const current = schedules[schedIdx]
    if (params.input.name !== undefined) current.name = params.input.name
    if ((params.input.config as Record<string, unknown> | undefined)?.cron !== undefined) {
      current.cron = String((params.input.config as Record<string, unknown>).cron)
    }
    if (params.input.enabled !== undefined) current.enabled = params.input.enabled
    if ((params.input.config as Record<string, unknown> | undefined)?.workflowId !== undefined) {
      current.workflowId = String((params.input.config as Record<string, unknown>).workflowId)
    }
    await updateDigitalEmployeeDeploymentConfig({
      id: params.id,
      deploymentConfig: { ...deployConfig, schedules } as object,
    })
    return current as unknown as Record<string, unknown>
  }

  return updateDigitalEmployeeWebhook({
    triggerId: params.triggerId,
    data: {
      ...(params.input.name !== undefined && { name: params.input.name }),
      ...(params.input.config !== undefined && { config: params.input.config }),
      ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
      ...(params.input.filterRules !== undefined && { filterRules: params.input.filterRules }),
    },
  }) as Promise<Record<string, unknown>>
}

/**
 * Deletes a trigger.
 */
export async function deleteDigitalEmployeeTrigger(params: {
  id: string
  organizationId: string | null
  triggerId: string
}): Promise<{ success: true } | ServiceError> {
  const employee = await findDigitalEmployeeTriggersContext({
    id: params.id,
    organizationId: params.organizationId,
  })
  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
  const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || []).slice()
  const schedIdx = schedules.findIndex((schedule) => schedule.id === params.triggerId)

  if (schedIdx >= 0) {
    schedules.splice(schedIdx, 1)
    await updateDigitalEmployeeDeploymentConfig({
      id: params.id,
      deploymentConfig: { ...deployConfig, schedules } as object,
    })
    return { success: true }
  }

  await deleteDigitalEmployeeWebhook(params.triggerId)
  return { success: true }
}

/**
 * Proxies OAuth callback traffic to the employee's runtime container.
 */
export async function proxyDigitalEmployeeOAuthCallback(params: {
  id: string
  path: string[]
  request: Request
}): Promise<Response> {
  try {
    const employee = await findDigitalEmployeeOAuthContext(params.id)
    if (!employee?.groupId) {
      return new Response("Employee is not running.", { status: 502 })
    }

    const containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
    if (!containerUrl) {
      return new Response("Employee is not running.", { status: 502 })
    }

    const url = new URL(params.request.url)
    const queryString = url.search

    let targetUrl: string
    if (params.path[0] === "direct") {
      const directPath = params.path.slice(1).join("/")
      targetUrl = `${containerUrl}/${directPath}${queryString}`
    } else {
      const fullPath = params.path.join("/")
      targetUrl = `${containerUrl}/oauth-proxy/${fullPath}${queryString}`
    }

    const proxyResponse = await fetch(targetUrl, {
      headers: {
        accept: params.request.headers.get("accept") || "text/html",
        "user-agent": params.request.headers.get("user-agent") || "",
        cookie: params.request.headers.get("cookie") || "",
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
    return new Response(JSON.stringify({ error: "OAuth proxy error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}
