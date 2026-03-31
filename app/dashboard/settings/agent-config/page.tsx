import AgentConfigUnified from "@/src/features/settings/components/agent-config-unified"

export default function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <AgentConfigUnified searchParams={searchParams} />
}
