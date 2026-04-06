import GeneralUnified from "@/features/settings/components/general-unified"

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <GeneralUnified searchParams={searchParams} />
}
