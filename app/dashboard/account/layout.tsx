import { auth } from "@/lib/auth"
import { getAdminProfile, isServiceError } from "@/src/features/admin/profile/service"
import AccountLayoutClient from "@/src/features/user/components/account/account-layout-client"

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <AccountLayoutClient
        initialUser={{
          id: null,
          name: null,
          email: null,
        }}
        initialAvatarUrl={null}
      >
        {children}
      </AccountLayoutClient>
    )
  }

  const profile = await getAdminProfile(session.user.id)
  const initialAvatarUrl = !isServiceError(profile) && typeof profile.avatarUrl === "string"
    ? profile.avatarUrl
    : null

  return (
    <AccountLayoutClient
      initialUser={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      }}
      initialAvatarUrl={initialAvatarUrl}
    >
      {children}
    </AccountLayoutClient>
  )
}
