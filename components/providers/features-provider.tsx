"use client"

import { createContext, useContext, useEffect, useState } from "react"

interface FeaturesContextValue {
  isAgentEnabled: boolean
  isLoading: boolean
}

const FeaturesContext = createContext<FeaturesContextValue>({
  isAgentEnabled: true,
  isLoading: true,
})

export function useFeaturesContext() {
  return useContext(FeaturesContext)
}

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const [isAgentEnabled, setIsAgentEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchFeatures() {
      try {
        const response = await fetch("/api/dashboard/features")
        if (response.ok) {
          const data = await response.json()
          setIsAgentEnabled(data.AGENT ?? true)
        }
      } catch (error) {
        console.error("Failed to fetch features:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchFeatures()
  }, [])

  return (
    <FeaturesContext.Provider value={{ isAgentEnabled, isLoading }}>
      {children}
    </FeaturesContext.Provider>
  )
}
