"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "rantai-assistants-test-sessions"

export interface TestSession {
  id: string
  assistantId: string
  title: string
  createdAt: Date
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    createdAt: Date
  }>
}

interface SessionsState {
  [assistantId: string]: TestSession[]
}

// Helper to parse dates from JSON
function parseSessionsState(json: string): SessionsState {
  try {
    const data = JSON.parse(json)
    const result: SessionsState = {}
    for (const [assistantId, sessions] of Object.entries(data)) {
      result[assistantId] = (sessions as any[]).map((s) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        messages: s.messages.map((m: any) => ({
          ...m,
          createdAt: new Date(m.createdAt),
        })),
      }))
    }
    return result
  } catch {
    return {}
  }
}

export function useAssistantTestSessions(assistantId: string | null) {
  const [allSessions, setAllSessions] = useState<SessionsState>({})
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setAllSessions(parseSessionsState(stored))
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allSessions))
    }
  }, [allSessions, isLoaded])

  // Reset active session when assistant changes
  useEffect(() => {
    if (assistantId) {
      const sessions = allSessions[assistantId] || []
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id)
      } else {
        setActiveSessionId(null)
      }
    } else {
      setActiveSessionId(null)
    }
  }, [assistantId, allSessions])

  // Get sessions for current assistant
  const sessions = assistantId ? (allSessions[assistantId] || []) : []
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null

  const createSession = useCallback((targetAssistantId: string): TestSession => {
    const newSession: TestSession = {
      id: crypto.randomUUID(),
      assistantId: targetAssistantId,
      title: "New Test Chat",
      createdAt: new Date(),
      messages: [],
    }
    setAllSessions((prev) => ({
      ...prev,
      [targetAssistantId]: [newSession, ...(prev[targetAssistantId] || [])],
    }))
    setActiveSessionId(newSession.id)
    return newSession
  }, [])

  const updateSession = useCallback((sessionId: string, updates: Partial<TestSession>) => {
    setAllSessions((prev) => {
      const newState = { ...prev }
      for (const [aid, sessions] of Object.entries(newState)) {
        const sessionIndex = sessions.findIndex((s) => s.id === sessionId)
        if (sessionIndex !== -1) {
          newState[aid] = sessions.map((s, i) =>
            i === sessionIndex ? { ...s, ...updates } : s
          )
          break
        }
      }
      return newState
    })
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    setAllSessions((prev) => {
      const newState = { ...prev }
      for (const [aid, sessions] of Object.entries(newState)) {
        const filtered = sessions.filter((s) => s.id !== sessionId)
        if (filtered.length !== sessions.length) {
          newState[aid] = filtered
          break
        }
      }
      return newState
    })
    if (activeSessionId === sessionId) {
      // Select next available session for current assistant
      if (assistantId) {
        const remaining = (allSessions[assistantId] || []).filter((s) => s.id !== sessionId)
        setActiveSessionId(remaining[0]?.id || null)
      } else {
        setActiveSessionId(null)
      }
    }
  }, [activeSessionId, assistantId, allSessions])

  const clearAssistantSessions = useCallback((targetAssistantId: string) => {
    setAllSessions((prev) => {
      const newState = { ...prev }
      delete newState[targetAssistantId]
      return newState
    })
    if (assistantId === targetAssistantId) {
      setActiveSessionId(null)
    }
  }, [assistantId])

  const clearAllSessions = useCallback(() => {
    setAllSessions({})
    setActiveSessionId(null)
  }, [])

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    updateSession,
    deleteSession,
    clearAssistantSessions,
    clearAllSessions,
    isLoaded,
  }
}
