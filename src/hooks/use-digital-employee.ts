"use client"

import { useState, useCallback, useEffect } from "react"
import type { DigitalEmployeeItem } from "./use-digital-employees"

interface EmployeeFile {
  id: string
  digitalEmployeeId: string
  filename: string
  content: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

interface EmployeeRunItem {
  id: string
  trigger: string
  workflowId: string | null
  status: string
  output: unknown
  error: string | null
  promptTokens: number
  completionTokens: number
  executionTimeMs: number | null
  startedAt: string
  completedAt: string | null
}

export interface DeployProgressEvent {
  step: number
  total: number
  message: string
  status: "in_progress" | "completed" | "error"
}

interface PlatformToolItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  icon: string | null
  isBuiltIn: boolean
  enabled: boolean
}

interface CustomToolItem {
  id: string
  digitalEmployeeId: string
  name: string
  description: string | null
  parameters: unknown
  code: string
  language: string
  enabled: boolean
  approved: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface PlatformSkillItem {
  id: string
  name: string
  description: string
  source: string
  enabled: boolean
  icon: string
  category: string
  tags: string[]
}

interface ClawHubSkillItem {
  id: string
  name: string
  slug: string
  version: string
  description: string | null
  enabled: boolean
  createdAt: string
}

export interface DigitalEmployeeHydrationData {
  employee: DigitalEmployeeItem
  files: EmployeeFile[]
  runs: EmployeeRunItem[]
  approvals: ApprovalItem[]
  platformTools: PlatformToolItem[]
  customTools: CustomToolItem[]
  skills: {
    platform: PlatformSkillItem[]
    clawhub: ClawHubSkillItem[]
  }
}

interface ApprovalItem {
  id: string
  requestType: string
  title: string
  description: string | null
  content: unknown
  options: unknown
  status: string
  respondedBy: string | null
  response: string | null
  createdAt: string
  respondedAt: string | null
}

async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onProgress?: (event: DeployProgressEvent) => void
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let lastEvent: DeployProgressEvent | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as DeployProgressEvent
          lastEvent = event
          onProgress?.(event)
        } catch {
          // skip malformed events
        }
      }
    }
  }

  if (lastEvent?.status === "error") {
    throw new Error(lastEvent.message)
  }
}

export function useDigitalEmployee(
  id: string | null,
  options?: { initialData?: DigitalEmployeeHydrationData | null }
) {
  const initialData = options?.initialData
  const [employee, setEmployee] = useState<DigitalEmployeeItem | null>(
    initialData?.employee ?? null
  )
  const [files, setFiles] = useState<EmployeeFile[]>(initialData?.files ?? [])
  const [runs, setRuns] = useState<EmployeeRunItem[]>(initialData?.runs ?? [])
  const [approvals, setApprovals] = useState<ApprovalItem[]>(initialData?.approvals ?? [])
  const [platformTools, setPlatformTools] = useState<PlatformToolItem[]>(
    initialData?.platformTools ?? []
  )
  const [customTools, setCustomTools] = useState<CustomToolItem[]>(
    initialData?.customTools ?? []
  )
  const [skills, setSkills] = useState<{
    platform: PlatformSkillItem[]
    clawhub: ClawHubSkillItem[]
  }>(initialData?.skills ?? { platform: [], clawhub: [] })
  const [isLoading, setIsLoading] = useState(initialData === undefined)
  const base = `/api/dashboard/digital-employees/${id}`

  useEffect(() => {
    if (initialData === undefined) {
      return
    }

    setEmployee(initialData?.employee ?? null)
    setFiles(initialData?.files ?? [])
    setRuns(initialData?.runs ?? [])
    setApprovals(initialData?.approvals ?? [])
    setPlatformTools(initialData?.platformTools ?? [])
    setCustomTools(initialData?.customTools ?? [])
    setSkills(initialData?.skills ?? { platform: [], clawhub: [] })
    setIsLoading(false)
  }, [initialData])

  const fetchEmployee = useCallback(async () => {
    if (!id) return
    try {
      setIsLoading(true)
      const res = await fetch(base)
      if (res.ok) setEmployee(await res.json())
    } finally {
      setIsLoading(false)
    }
  }, [id, base])

  const fetchFiles = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${base}/files`)
    if (res.ok) setFiles(await res.json())
  }, [id, base])

  const fetchRuns = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${base}/runs`)
    if (res.ok) setRuns(await res.json())
  }, [id, base])

  const fetchApprovals = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${base}/approvals`)
    if (res.ok) setApprovals(await res.json())
  }, [id, base])

  const fetchTools = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${base}/tools`)
    if (res.ok) {
      const data = await res.json()
      setPlatformTools(data.platform || [])
      setCustomTools(data.custom || [])
    }
  }, [id, base])

  const fetchSkills = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${base}/skills`)
    if (res.ok) {
      const data = await res.json()
      setSkills({ platform: data.platform || [], clawhub: data.clawhub || [] })
    }
  }, [id, base])

  const pause = useCallback(async () => {
    const res = await fetch(`${base}/pause`, { method: "POST" })
    if (!res.ok) throw new Error("Pause failed")
    await fetchEmployee()
  }, [base, fetchEmployee])

  const resume = useCallback(async () => {
    const res = await fetch(`${base}/resume`, { method: "POST" })
    if (!res.ok) throw new Error("Resume failed")
    await fetchEmployee()
  }, [base, fetchEmployee])

  const terminate = useCallback(async () => {
    const res = await fetch(`${base}/terminate`, { method: "POST" })
    if (!res.ok) throw new Error("Terminate failed")
    await fetchEmployee()
  }, [base, fetchEmployee])

  const triggerRun = useCallback(
    async (input?: { workflowId?: string; input?: Record<string, unknown> }) => {
      const res = await fetch(`${base}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual", ...input }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Run failed")
      }
      const data = await res.json()
      await fetchRuns()
      return data.runId
    },
    [base, fetchRuns]
  )

  const respondToApproval = useCallback(
    async (
      approvalId: string,
      response: { status: string; response?: string; responseData?: Record<string, unknown> }
    ) => {
      const res = await fetch(`/api/dashboard/approvals/${approvalId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      })
      if (!res.ok) throw new Error("Response failed")
      await fetchApprovals()
    },
    [fetchApprovals]
  )

  const updateFile = useCallback(
    async (filename: string, content: string) => {
      const res = await fetch(`${base}/files/${encodeURIComponent(filename)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error("Update failed")
      await fetchFiles()
    },
    [base, fetchFiles]
  )

  const installSkill = useCallback(
    async (slug: string) => {
      const res = await fetch(`${base}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, source: "clawhub" }),
      })
      if (!res.ok) throw new Error("Install failed")
      const result = await res.json()
      await fetchSkills()
      return result
    },
    [base, fetchSkills]
  )

  const uninstallSkill = useCallback(
    async (skillId: string) => {
      const res = await fetch(`${base}/skills/${skillId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Uninstall failed")
      await fetchSkills()
    },
    [base, fetchSkills]
  )

  const createCustomTool = useCallback(
    async (input: {
      name: string
      description?: string
      parameters?: unknown
      code: string
      language?: string
    }) => {
      const res = await fetch(`${base}/custom-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Create failed")
      const result = await res.json()
      await fetchTools()
      return result
    },
    [base, fetchTools]
  )

  const deleteCustomTool = useCallback(
    async (toolId: string) => {
      const res = await fetch(`${base}/custom-tools/${toolId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      await fetchTools()
    },
    [base, fetchTools]
  )

  const toggleCustomTool = useCallback(
    async (toolId: string, enabled: boolean) => {
      const res = await fetch(`${base}/custom-tools/${toolId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error("Toggle failed")
      await fetchTools()
    },
    [base, fetchTools]
  )

  const toggleSkill = useCallback(
    async (skillId: string, enabled: boolean) => {
      const res = await fetch(`${base}/skills/${skillId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error("Toggle failed")
      await fetchSkills()
    },
    [base, fetchSkills]
  )

  const updateMemory = useCallback(
    async (content: string) => {
      await updateFile("MEMORY.md", content)
    },
    [updateFile]
  )

  const updateSchedules = useCallback(
    async (schedules: Array<{ id: string; name: string; cron: string; workflowId?: string; input?: Record<string, unknown>; enabled: boolean }>) => {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentConfig: {
            ...(employee as any)?.deploymentConfig,
            schedules,
          },
        }),
      })
      if (!res.ok) throw new Error("Update schedules failed")
      await fetchEmployee()
    },
    [base, employee, fetchEmployee]
  )

  const deleteEmployee = useCallback(async () => {
    const res = await fetch(base, { method: "DELETE" })
    if (!res.ok) throw new Error("Delete failed")
  }, [base])

  useEffect(() => {
    if (initialData !== undefined || !id) {
      return
    }

    fetchEmployee()
    fetchFiles()
    fetchRuns()
    fetchApprovals()
    fetchTools()
    fetchSkills()
  }, [
    id,
    initialData,
    fetchEmployee,
    fetchFiles,
    fetchRuns,
    fetchApprovals,
    fetchTools,
    fetchSkills,
  ])

  return {
    employee,
    files,
    runs,
    approvals,
    platformTools,
    customTools,
    skills,
    isLoading,
    fetchEmployee,
    fetchFiles,
    fetchRuns,
    fetchApprovals,
    fetchTools,
    fetchSkills,
    pause,
    resume,
    terminate,
    triggerRun,
    respondToApproval,
    updateFile,
    installSkill,
    uninstallSkill,
    createCustomTool,
    deleteCustomTool,
    toggleCustomTool,
    toggleSkill,
    updateMemory,
    updateSchedules,
    deleteEmployee,
  }
}
