import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listGroupsForDashboard } from "@/src/features/digital-employees/groups/service"
import GroupDetailPageClient from "./group-detail-page-client"
import type { EmployeeGroupItem } from "@/hooks/use-employee-groups"

interface GroupDetailPageParams {
  id: string
}

function mapGroupsForClient(
  groups: Awaited<ReturnType<typeof listGroupsForDashboard>>
): EmployeeGroupItem[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    status: group.status,
    isImplicit: group.isImplicit,
    containerPort: group.containerPort,
    noVncPort: group.noVncPort,
    members: group.members,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }))
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<GroupDetailPageParams>
}) {
  const session = await auth()
  const resolvedParams = await params

  if (!session?.user?.id) {
    return <GroupDetailPageClient groupId={resolvedParams.id} initialGroups={[]} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  const groups = orgContext?.organizationId
    ? await listGroupsForDashboard(orgContext.organizationId)
    : []

  return (
    <GroupDetailPageClient
      groupId={resolvedParams.id}
      initialGroups={mapGroupsForClient(groups)}
    />
  )
}
