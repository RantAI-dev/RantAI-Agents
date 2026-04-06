import AnalyticsUnified from "@/features/settings/components/analytics-unified"

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <AnalyticsUnified searchParams={searchParams} />
}
