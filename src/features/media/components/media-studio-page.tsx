import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listAssetsForOrg } from "@/features/media/repository"
import MediaStudioClient from "./media-studio-client"

export default async function MediaStudioPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  if (!orgContext) {
    redirect("/login")
  }

  const { organizationId } = orgContext

  const [recentAssets, imageModels, audioModels, videoModels] = await Promise.all([
    listAssetsForOrg({
      organizationId,
      limit: 40,
      sort: "new",
    }),
    prisma.llmModel.findMany({
      where: { isActive: true, outputModalities: { has: "image" } },
      orderBy: [{ provider: "asc" }, { name: "asc" }],
    }),
    prisma.llmModel.findMany({
      where: { isActive: true, outputModalities: { has: "audio" } },
      orderBy: [{ provider: "asc" }, { name: "asc" }],
    }),
    prisma.llmModel.findMany({
      where: { isActive: true, outputModalities: { has: "video" } },
      orderBy: [{ provider: "asc" }, { name: "asc" }],
    }),
  ])

  return (
    <MediaStudioClient
      initialAssets={JSON.parse(JSON.stringify(recentAssets.items))}
      imageModels={imageModels}
      audioModels={audioModels}
      videoModels={videoModels}
      organizationId={organizationId}
      videoEnabled={process.env.MEDIA_VIDEO_ENABLED === "true"}
    />
  )
}
