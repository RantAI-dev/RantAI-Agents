"use client"

import { create } from "zustand"
import type { MediaModality, MediaJobStatus } from "./schema"

export interface StoreAsset {
  id: string
  jobId: string
  modality: MediaModality
  mimeType: string
  s3Key: string
  width: number | null
  height: number | null
  durationMs: number | null
  thumbnailS3Key: string | null
  isFavorite: boolean
  createdAt: string
}

export interface StoreJob {
  id: string
  modality: MediaModality
  modelId: string
  prompt: string
  status: MediaJobStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  estimatedCostCents: number | null
  costCents: number | null
  assets: StoreAsset[]
}

interface MediaStudioState {
  activeTab: "IMAGE" | "AUDIO" | "VIDEO" | "LIBRARY"
  jobs: StoreJob[]
  referenceAssetIds: string[]
  setActiveTab: (tab: MediaStudioState["activeTab"]) => void
  upsertJob: (job: StoreJob) => void
  addJobs: (jobs: StoreJob[]) => void
  toggleFavorite: (assetId: string, value: boolean) => void
  removeAsset: (assetId: string) => void
  addReference: (assetId: string) => void
  clearReferences: () => void
}

export const useMediaStudioStore = create<MediaStudioState>((set) => ({
  activeTab: "IMAGE",
  jobs: [],
  referenceAssetIds: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  upsertJob: (job) =>
    set((state) => {
      const idx = state.jobs.findIndex((j) => j.id === job.id)
      if (idx === -1) return { jobs: [job, ...state.jobs] }
      const next = [...state.jobs]
      next[idx] = job
      return { jobs: next }
    }),
  addJobs: (jobs) =>
    set((state) => {
      const seen = new Set(state.jobs.map((j) => j.id))
      const merged = [...state.jobs, ...jobs.filter((j) => !seen.has(j.id))]
      return { jobs: merged }
    }),
  toggleFavorite: (assetId, value) =>
    set((state) => ({
      jobs: state.jobs.map((j) => ({
        ...j,
        assets: j.assets.map((a) =>
          a.id === assetId ? { ...a, isFavorite: value } : a
        ),
      })),
    })),
  removeAsset: (assetId) =>
    set((state) => ({
      jobs: state.jobs.map((j) => ({
        ...j,
        assets: j.assets.filter((a) => a.id !== assetId),
      })),
    })),
  addReference: (assetId) =>
    set((state) => ({
      referenceAssetIds: state.referenceAssetIds.includes(assetId)
        ? state.referenceAssetIds
        : [...state.referenceAssetIds, assetId],
    })),
  clearReferences: () => set({ referenceAssetIds: [] }),
}))
