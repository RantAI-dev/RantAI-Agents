import { auth } from "@/lib/auth"
import { getAdminProfile, isServiceError } from "@/src/features/admin/profile/service"
import AccountPageClient from "./account-page-client"

interface InitialProfile {
  name: string
  email: string
  avatarUrl: string | null
}

function toInitialProfile(value: unknown): InitialProfile {
  if (!value || typeof value !== "object") {
    return { name: "", email: "", avatarUrl: null }
  }

  const row = value as Record<string, unknown>
  return {
    name: typeof row.name === "string" ? row.name : "",
    email: typeof row.email === "string" ? row.email : "",
    avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
  }
}

export default async function AccountPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <AccountPageClient
        initialProfile={{
          name: "",
          email: "",
          avatarUrl: null,
        }}
      />
    )
  }

  const result = await getAdminProfile(session.user.id)
  const initialProfile = isServiceError(result)
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        avatarUrl: null,
      }
    : toInitialProfile(result)

  return <AccountPageClient initialProfile={initialProfile} />
}
