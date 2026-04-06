export default function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth check is handled by middleware - no redirect here to avoid loops
  return <>{children}</>
}
