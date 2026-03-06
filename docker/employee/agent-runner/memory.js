/**
 * Memory management for the Agent Runner
 *
 * Handles:
 * - Loading memory context from package + local files
 * - Writing daily notes
 * - Local keyword search across memory files
 */

const fs = require("fs")
const path = require("path")

/**
 * Load memory context for injection into the system prompt
 */
function loadMemory(dataDir, packageMemory) {
  const parts = []

  // Load MEMORY.md from workspace
  const memoryPath = path.join(dataDir, "workspace", "MEMORY.md")
  if (fs.existsSync(memoryPath)) {
    const content = fs.readFileSync(memoryPath, "utf-8").trim()
    if (content) parts.push(`## Long-Term Memory\n${content}`)
  } else if (packageMemory?.longTerm) {
    parts.push(`## Long-Term Memory\n${packageMemory.longTerm}`)
  }

  // Load recent daily notes from package or local files
  const dailyDir = path.join(dataDir, "memory", "daily")
  if (fs.existsSync(dailyDir)) {
    const files = fs
      .readdirSync(dailyDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 3)

    if (files.length > 0) {
      const notes = files.map((f) => {
        const date = f.replace(".md", "")
        const content = fs.readFileSync(path.join(dailyDir, f), "utf-8")
        return `### ${date}\n${content}`
      })
      parts.push(`## Recent Daily Notes\n${notes.join("\n\n")}`)
    }
  } else if (packageMemory?.recentDailyNotes?.length > 0) {
    const notes = packageMemory.recentDailyNotes.map(
      (n) => `### ${n.date}\n${n.content}`
    )
    parts.push(`## Recent Daily Notes\n${notes.join("\n\n")}`)
  }

  return parts.length > 0 ? parts.join("\n\n") : null
}

/**
 * Write/append to today's daily note
 */
function writeDailyNote(dataDir, content) {
  const dailyDir = path.join(dataDir, "memory", "daily")
  fs.mkdirSync(dailyDir, { recursive: true })

  const today = new Date().toISOString().split("T")[0]
  const filePath = path.join(dailyDir, `${today}.md`)

  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, `\n\n${content}`, "utf-8")
  } else {
    fs.writeFileSync(filePath, `# Daily Note — ${today}\n\n${content}`, "utf-8")
  }
}

/**
 * Search local memory files by keyword
 */
function searchLocalMemory(dataDir, query) {
  const results = []
  const queryLower = query.toLowerCase()

  // Search workspace files
  const workspaceDir = path.join(dataDir, "workspace")
  if (fs.existsSync(workspaceDir)) {
    for (const filename of fs.readdirSync(workspaceDir)) {
      const filepath = path.join(workspaceDir, filename)
      if (!fs.statSync(filepath).isFile()) continue
      const content = fs.readFileSync(filepath, "utf-8")
      if (content.toLowerCase().includes(queryLower)) {
        results.push({ source: "workspace", filename, snippet: extractSnippet(content, queryLower) })
      }
    }
  }

  // Search daily notes
  const dailyDir = path.join(dataDir, "memory", "daily")
  if (fs.existsSync(dailyDir)) {
    for (const filename of fs.readdirSync(dailyDir)) {
      const filepath = path.join(dailyDir, filename)
      if (!fs.statSync(filepath).isFile()) continue
      const content = fs.readFileSync(filepath, "utf-8")
      if (content.toLowerCase().includes(queryLower)) {
        results.push({ source: "daily_note", date: filename.replace(".md", ""), snippet: extractSnippet(content, queryLower) })
      }
    }
  }

  return results
}

function extractSnippet(content, queryLower) {
  const idx = content.toLowerCase().indexOf(queryLower)
  if (idx === -1) return ""
  const start = Math.max(0, idx - 100)
  const end = Math.min(content.length, idx + queryLower.length + 100)
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "")
}

module.exports = { loadMemory, writeDailyNote, searchLocalMemory }
