"use client"

interface Props {
  initialAssets: unknown[]
  imageModels: unknown[]
  audioModels: unknown[]
  videoModels: unknown[]
  userLimitCents: number | null
  usedTodayCents: number
  organizationId: string
  videoEnabled: boolean
}

export default function MediaStudioClient(props: Props) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Media Studio</h1>
      <p className="text-sm text-muted-foreground">Stub — wired in Task 16</p>
    </div>
  )
}
