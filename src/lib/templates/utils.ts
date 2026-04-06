export async function resolveToolNameToIds(
  toolNames: string[]
): Promise<string[]> {
  if (toolNames.length === 0) return []

  try {
    const res = await fetch("/api/dashboard/tools")
    if (!res.ok) return []
    const tools: Array<{ id: string; name: string }> = await res.json()
    const nameToId = new Map(tools.map((t) => [t.name, t.id]))
    return toolNames.flatMap((name) => {
      const id = nameToId.get(name)
      return id ? [id] : []
    })
  } catch {
    return []
  }
}
