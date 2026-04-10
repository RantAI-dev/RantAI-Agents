"use client"

import { useEffect } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { MediaStudioPanel } from "./media-studio-panel"
import { UsageIndicator } from "./usage-indicator"
import { LibraryTab } from "./library-tab"
import { useMediaStudioStore, type StoreAsset, type StoreJob } from "@/features/media/store"
import { useMediaJobUpdates } from "@/features/media/use-media-job-updates"
import { MODALITY_META } from "./studio-shared"
import { cn } from "@/lib/utils"
import { Library } from "lucide-react"

interface ModelInfo {
  id: string
  name: string
  provider: string
  pricingOutput: number
  inputModalities: string[]
}

interface Props {
  initialAssets: Array<StoreAsset & { jobId: string }>
  imageModels: ModelInfo[]
  audioModels: ModelInfo[]
  videoModels: ModelInfo[]
  userLimitCents: number | null
  usedTodayCents: number
  organizationId: string
  videoEnabled: boolean
}

export default function MediaStudioClient({
  initialAssets,
  imageModels,
  audioModels,
  videoModels,
  userLimitCents,
  usedTodayCents,
  organizationId,
  videoEnabled,
}: Props) {
  const { activeTab, setActiveTab, addJobs } = useMediaStudioStore()

  // Wire up live job updates via Socket.io
  useMediaJobUpdates(organizationId)

  useEffect(() => {
    // Hydrate the store from server-fetched assets by grouping into pseudo-jobs.
    const byJob = new Map<string, StoreJob>()
    for (const a of initialAssets) {
      const existing = byJob.get(a.jobId)
      if (existing) {
        existing.assets.push(a)
      } else {
        byJob.set(a.jobId, {
          id: a.jobId,
          modality: a.modality,
          modelId: "",
          prompt: "",
          status: "SUCCEEDED",
          createdAt: a.createdAt,
          startedAt: null,
          completedAt: a.createdAt,
          errorMessage: null,
          estimatedCostCents: null,
          costCents: null,
          assets: [a],
        })
      }
    }
    addJobs(Array.from(byJob.values()))
  }, [initialAssets, addJobs])

  return (
    <div className="flex h-full flex-col">
      <DashboardPageHeader
        title="Media Studio"
        subtitle="Generate images, audio, and video"
        actions={<UsageIndicator usedCents={usedTodayCents} limitCents={userLimitCents} />}
      />
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="mx-6 mt-4 inline-flex items-center gap-1 rounded-xl border bg-card/60 p-1 shadow-sm backdrop-blur">
          {(["IMAGE", "AUDIO", "VIDEO"] as const).map((m) => {
            const meta = MODALITY_META[m]
            const Icon = meta.icon
            const active = activeTab === m
            const disabled = m === "VIDEO" && !videoEnabled
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(m)}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-40"
                )}
              >
                <Icon className={cn("h-4 w-4", active && meta.accentText)} />
                {meta.label}
                {disabled && (
                  <span className="ml-1 font-mono text-[9px] uppercase opacity-60">off</span>
                )}
              </button>
            )
          })}
          <div className="mx-1 h-6 w-px bg-border" />
          <button
            type="button"
            onClick={() => setActiveTab("LIBRARY")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === "LIBRARY"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Library className="h-4 w-4" />
            Library
          </button>
        </div>

        <TabsContent value="IMAGE">
          <MediaStudioPanel modality="IMAGE" models={imageModels} organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="AUDIO">
          <MediaStudioPanel modality="AUDIO" models={audioModels} organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="VIDEO">
          {videoEnabled ? (
            <MediaStudioPanel modality="VIDEO" models={videoModels} organizationId={organizationId} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Video generation is disabled. Set MEDIA_VIDEO_ENABLED=true to enable.
            </p>
          )}
        </TabsContent>
        <TabsContent value="LIBRARY">
          <LibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
