"use client"

import type { ReactNode } from "react"

export type UpgradeTriggerType =
  | "credits"
  | "storage"
  | "apiKeys"
  | "members"
  | "assistants"
  | "documents"

export interface UpgradeTrigger {
  type: UpgradeTriggerType
  current?: number
  max?: number
  currentMB?: number
  maxMB?: number
  requiredMB?: number
  needed?: number
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useUpgradeModal() {
  return {
    showUpgradeModal: (_trigger: UpgradeTrigger) => {},
    hideUpgradeModal: () => {},
  }
}

export function handleUpgradeRequired(
  _response: { upgradeRequired?: string; details?: Record<string, number> },
  _showModal: (trigger: UpgradeTrigger) => void
): boolean {
  return false
}
