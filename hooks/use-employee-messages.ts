"use client"

import { useState, useEffect, useCallback } from "react"

interface EmployeeMessageFilters {
  employeeId?: string
  type?: string
  status?: string
}

interface EmployeeRef {
  id: string
  name: string
  avatar: string | null
}

interface EmployeeMessage {
  id: string
  fromEmployee: EmployeeRef
  toEmployee: EmployeeRef | null
  toGroup: string | null
  type: string
  subject: string
  content: string
  status: string
  priority: string
  responseData: unknown
  attachments: unknown[]
  childMessages: Array<{
    id: string
    content: string
    fromEmployeeId: string
    createdAt: string
  }>
  createdAt: string
}

export function useEmployeeMessages(filters?: EmployeeMessageFilters) {
  const [messages, setMessages] = useState<EmployeeMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const fetchMessages = useCallback(async (cursor?: string) => {
    try {
      if (!cursor) setIsLoading(true)
      const params = new URLSearchParams()
      if (filters?.employeeId) params.set("employeeId", filters.employeeId)
      if (filters?.type) params.set("type", filters.type)
      if (filters?.status) params.set("status", filters.status)
      if (cursor) params.set("cursor", cursor)

      const res = await fetch(`/api/dashboard/messages?${params}`)
      if (!res.ok) throw new Error("Failed to fetch messages")
      const data = await res.json()

      if (cursor) {
        setMessages((prev) => [...prev, ...data.messages])
      } else {
        setMessages(data.messages)
      }
      setNextCursor(data.nextCursor)
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      setIsLoading(false)
    }
  }, [filters?.employeeId, filters?.type, filters?.status])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const fetchMore = useCallback(() => {
    if (nextCursor) fetchMessages(nextCursor)
  }, [nextCursor, fetchMessages])

  return { messages, isLoading, fetchMore, hasMore: !!nextCursor, refresh: () => fetchMessages() }
}
