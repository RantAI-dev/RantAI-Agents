import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  listDashboardCredentials,
  type DashboardCredentialSummary,
} from "@/features/credentials/service"
import CredentialsSettingsClient, {
  type Credential,
} from "./credentials-settings-client"

function mapCredential(item: DashboardCredentialSummary): Credential {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export default async function CredentialsSettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <CredentialsSettingsClient initialCredentials={[]} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })

  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
  const credentials = await listDashboardCredentials({
    organizationId: orgContext?.organizationId ?? null,
    userId: session.user.id,
  })

  return <CredentialsSettingsClient initialCredentials={credentials.map(mapCredential)} />
}
