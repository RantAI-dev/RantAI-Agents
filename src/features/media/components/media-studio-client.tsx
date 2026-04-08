"use client"

import { useEffect } from "react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { MediaStudioPanel } from "./media-studio-panel"
import { UsageIndicator } from "./usage-indicator"
import { LibraryTab } from "./library-tab"
import { useMediaStudioStore, type StoreAsset, type StoreJob } from "@/features/media/store"

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
        className="flex-1"
      >
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="IMAGE">Image</TabsTrigger>
          <TabsTrigger value="AUDIO">Audio</TabsTrigger>
          <TabsTrigger value="VIDEO" disabled={!videoEnabled}>
            Video {!videoEnabled && "(disabled)"}
          </TabsTrigger>
          <TabsTrigger value="LIBRARY">Library</TabsTrigger>
        </TabsList>

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
