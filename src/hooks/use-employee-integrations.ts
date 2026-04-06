"use client"

import { useState, useEffect, useCallback } from "react"

export interface EmployeeIntegrationItem {
  id: string
  name: string
  description: string
  icon: string
  category: string
  setupType: string
  fields: Array<{
    key: string
    label: string
    type: string
    required: boolean
    placeholder?: string
    helpText?: string
  }>
  connectionId: string | null
  status: string
  connectedAt: string | null
  lastTestedAt: string | null
  lastError: string | null
  metadata: Record<string, unknown>
}

export function useEmployeeIntegrations(employeeId: string) {
  const [integrations, setIntegrations] = useState<EmployeeIntegrationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/integrations`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setIntegrations(data)
    } catch {
      setIntegrations([])
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const connectIntegration = useCallback(async (integrationId: string, credentials: Record<string, string>, metadata?: Record<string, unknown>) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId, credentials, metadata }),
    })
    if (!res.ok) throw new Error("Failed to connect")
    await fetchIntegrations()
  }, [employeeId, fetchIntegrations])

  const disconnectIntegration = useCallback(async (integrationId: string) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/integrations/${integrationId}`, {
      method: "DELETE",
    })
    if (!res.ok) throw new Error("Failed to disconnect")
    await fetchIntegrations()
  }, [employeeId, fetchIntegrations])

  const testIntegration = useCallback(async (integrationId: string): Promise<{ success: boolean; error?: string }> => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/integrations/${integrationId}/test`, {
      method: "POST",
    })
    const data = await res.json()
    await fetchIntegrations()
    return data
  }, [employeeId, fetchIntegrations])

  const updateIntegration = useCallback(async (integrationId: string, credentials: Record<string, string>, metadata?: Record<string, unknown>) => {
    const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/integrations/${integrationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials, metadata }),
    })
    if (!res.ok) throw new Error("Failed to update")
    await fetchIntegrations()
  }, [employeeId, fetchIntegrations])

  return { integrations, isLoading, fetchIntegrations, connectIntegration, disconnectIntegration, testIntegration, updateIntegration }
}
