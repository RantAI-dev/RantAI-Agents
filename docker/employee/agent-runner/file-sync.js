/**
 * File Sync Sidecar
 *
 * Watches workspace and memory directories, tracks file hashes,
 * and syncs changes back to the platform every 30s.
 *
 * Also syncs RantaiClaw cron jobs → platform deploymentConfig.schedules
 * so agent-created schedules appear in the calendar UI.
 */

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const SYNC_INTERVAL_MS = 30_000
const PLATFORM_API_URL = process.env.PLATFORM_API_URL || "http://host.docker.internal:3000"
const RUNTIME_TOKEN = process.env.RUNTIME_TOKEN
const CLAW_BIN = process.env.CLAW_BIN || "rantaiclaw"
const CLAW_HOME = path.join("/root", `.${CLAW_BIN === "zeroclaw" ? "zeroclaw" : "rantaiclaw"}`)
const EMPLOYEE_ID = process.env.EMPLOYEE_ID

// In-memory hash tracker
const fileHashes = new Map()

function hashContent(content) {
  return crypto.createHash("md5").update(content).digest("hex")
}

function scanDir(dir, type) {
  const changes = []
  if (!fs.existsSync(dir)) return changes

  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) continue

    const content = fs.readFileSync(fullPath, "utf-8")
    const hash = hashContent(content)
    const key = `${type}:${entry}`

    if (fileHashes.get(key) !== hash) {
      fileHashes.set(key, hash)
      changes.push({ path: entry, content, type })
    }
  }

  return changes
}

/** Scan skills directory — each subdirectory is a skill with SKILL.md */
function scanSkillsDir(dir) {
  const changes = []
  if (!fs.existsSync(dir)) return changes

  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    const skillDir = path.join(dir, entry)
    const stat = fs.statSync(skillDir)
    if (!stat.isDirectory()) continue

    const skillMd = path.join(skillDir, "SKILL.md")
    if (!fs.existsSync(skillMd)) continue

    const content = fs.readFileSync(skillMd, "utf-8")
    const hash = hashContent(content)
    const key = `skill:${entry}`

    if (fileHashes.get(key) !== hash) {
      fileHashes.set(key, hash)
      changes.push({ path: `skills/${entry}/SKILL.md`, content, type: "workspace" })
    }
  }

  return changes
}

/**
 * Scan RantaiClaw's cron SQLite DB and return schedule changes
 * if any jobs were added, removed, or modified since last sync.
 */
function scanCronJobs() {
  const dbPath = path.join(CLAW_HOME, "workspace", "cron", "jobs.db")
  if (!fs.existsSync(dbPath)) return []

  try {
    // bun:sqlite is built into Bun runtime
    const { Database } = require("bun:sqlite")
    const db = new Database(dbPath, { readonly: true })

    const rows = db.query(
      "SELECT id, expression, name, enabled, schedule, job_type, prompt, command FROM cron_jobs ORDER BY next_run ASC"
    ).all()

    db.close()

    // Map to EmployeeSchedule-compatible objects
    const schedules = rows.map((row) => {
      let cron = row.expression || ""

      // For non-cron schedules, try to derive a cron expression
      if (!cron && row.schedule) {
        try {
          const sched = JSON.parse(row.schedule)
          if (sched.kind === "at" && sched.at) {
            const d = new Date(sched.at)
            cron = `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`
          } else if (sched.kind === "every" && sched.every_ms) {
            const mins = Math.round(sched.every_ms / 60000)
            if (mins >= 1 && mins <= 59) cron = `*/${mins} * * * *`
            else if (mins >= 60) cron = `0 */${Math.round(mins / 60)} * * *`
          }
        } catch { }
      }

      if (!cron) return null

      // Build a display name from name, prompt snippet, or command snippet
      const name = row.name
        || (row.prompt ? row.prompt.slice(0, 60) : null)
        || (row.command ? `cmd: ${row.command.slice(0, 50)}` : null)
        || `Job ${row.id.slice(0, 8)}`

      return {
        id: row.id,
        name,
        cron,
        enabled: row.enabled === 1,
      }
    }).filter(Boolean)

    // Hash to detect changes
    const content = JSON.stringify(schedules)
    const hash = hashContent(content)
    const key = "cron:schedules"

    if (fileHashes.get(key) !== hash) {
      fileHashes.set(key, hash)
      return [{ path: "_cron_schedules", content, type: "schedules" }]
    }

    return []
  } catch (err) {
    // Silently skip if DB is locked or bun:sqlite unavailable
    if (!scanCronJobs._warned) {
      console.warn(`[FileSync] Cron scan skipped: ${err.message}`)
      scanCronJobs._warned = true
    }
    return []
  }
}

async function syncChanges() {
  const workspaceChanges = scanDir("/data/workspace", "workspace")
  const memoryChanges = scanDir("/data/memory/daily", "memory")
  const skillChanges = scanSkillsDir("/data/workspace/skills")
  const cronChanges = scanCronJobs()
  const allChanges = [...workspaceChanges, ...memoryChanges, ...skillChanges, ...cronChanges]

  if (allChanges.length === 0) return

  try {
    const res = await fetch(
      `${PLATFORM_API_URL}/api/runtime/employees/${EMPLOYEE_ID}/sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RUNTIME_TOKEN}`,
        },
        body: JSON.stringify({ changes: allChanges }),
      }
    )
    if (!res.ok) {
      console.error(`[FileSync] Sync failed: ${res.status}`)
    } else {
      console.log(`[FileSync] Synced ${allChanges.length} file(s)`)
    }
  } catch (err) {
    console.error(`[FileSync] Sync error: ${err.message}`)
  }
}

let syncInterval = null

function startFileSync() {
  console.log("[FileSync] Starting file sync sidecar (interval: 30s)")

  // Initial scan to populate hashes without syncing
  scanDir("/data/workspace", "workspace")
  scanDir("/data/memory/daily", "memory")
  scanSkillsDir("/data/workspace/skills")
  scanCronJobs()

  syncInterval = setInterval(syncChanges, SYNC_INTERVAL_MS)

  return () => {
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
    }
  }
}

module.exports = { startFileSync }
