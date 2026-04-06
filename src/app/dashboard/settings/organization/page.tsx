import OrganizationUnified from "@/features/settings/components/organization-unified"

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <OrganizationUnified searchParams={searchParams} />
}
