export function consumeSseChunk(
  buffer: string,
  chunk: string
): { buffer: string; parts: Record<string, unknown>[] } {
  const nextBuffer = buffer + chunk
  const events = nextBuffer.split("\n\n")
  const remaining = events.pop() || ""

  const parts: Record<string, unknown>[] = []

  for (const event of events) {
    const eventLines = event
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (eventLines.length === 0) continue

    const dataLines = eventLines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())

    if (dataLines.length === 0) continue

    const data = dataLines.join("\n")
    if (data === "[DONE]") continue

    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      parts.push(parsed)
    } catch {
      // Ignore invalid SSE payload chunks.
    }
  }

  return { buffer: remaining, parts }
}
