#!/usr/bin/env node

/**
 * RantAI Agent Runner
 *
 * Boot sequence:
 * 1. Read /data/config/employee-package.json
 * 2. Write workspace files to /data/workspace/
 * 3. Write SKILL.md files for each ClawHub skill to /data/skills/
 * 4. Initialize RantaiClaw with agent config
 * 5. Register tools (platform → HTTP, custom → sandboxed, MCP → native)
 * 6. Read trigger context
 * 7. Execute the target workflow
 * 8. Write daily note to /data/memory/
 * 9. Report results to platform
 * 10. Exit
 */

const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")
const { registerTools } = require("./tools")
const { writeDailyNote, loadMemory } = require("./memory")
const { startFileSync } = require("./file-sync")
const { stopBrowserServices } = require("./browser-services")

/** Escape a string for use inside a TOML basic string ("...") */
function tomlEscape(s) {
  if (s == null) return ""
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

const { execFileSync: execFileSyncGlobal } = require("child_process")

// Detect binary name and home directory — handles both zeroclaw (legacy) and rantaiclaw (current)
function detectBinary() {
  for (const name of ["rantaiclaw", "zeroclaw"]) {
    try {
      execFileSyncGlobal("which", [name], { stdio: "pipe", timeout: 5000 })
      return name
    } catch { /* not found, try next */ }
  }
  return "rantaiclaw" // fallback
}

const CLAW_BIN = detectBinary()
const CLAW_HOME = path.join("/root", `.${CLAW_BIN === "zeroclaw" ? "zeroclaw" : "rantaiclaw"}`)

/**
 * Recursively mirror all files from src to dst, creating directories as needed.
 * This keeps /data/workspace (IDE-visible) in sync with the rantaiclaw workspace.
 */
function mirrorWorkspace(src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      mirrorWorkspace(srcPath, dstPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

const DATA_DIR = "/data"
const CONFIG_PATH = path.join(DATA_DIR, "config", "employee-package.json")

const PLATFORM_API_URL = process.env.PLATFORM_API_URL || "http://host.docker.internal:3000"
const RUNTIME_TOKEN = process.env.RUNTIME_TOKEN
const RUN_ID = process.env.RUN_ID
const EMPLOYEE_ID = process.env.EMPLOYEE_ID
const TRIGGER_TYPE = process.env.TRIGGER_TYPE || "manual"
const WORKFLOW_ID = process.env.WORKFLOW_ID
const RESUME_RUN_ID = process.env.RESUME_RUN_ID
const MODE = process.env.MODE || "run"

async function reportStatus(status, extra = {}) {
  try {
    await fetch(`${PLATFORM_API_URL}/api/runtime/runs/${RUN_ID}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNTIME_TOKEN}`,
      },
      body: JSON.stringify({ status, ...extra }),
    })
  } catch (err) {
    console.error("Failed to report status:", err.message)
  }
}

async function reportOutput(output) {
  try {
    await fetch(`${PLATFORM_API_URL}/api/runtime/runs/${RUN_ID}/output`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNTIME_TOKEN}`,
      },
      body: JSON.stringify({ output }),
    })
  } catch (err) {
    console.error("Failed to report output:", err.message)
  }
}

async function sendHeartbeat() {
  try {
    await fetch(`${PLATFORM_API_URL}/api/runtime/employees/${EMPLOYEE_ID}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNTIME_TOKEN}`,
      },
    })
  } catch (err) {
    console.error("[Gateway] Heartbeat failed:", err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// OpenClaw Feature Support: Triggers, Lifecycle, Services, Permissions
// ══════════════════════════════════════════════════════════════════════════

/**
 * Register cron triggers for a ClawHub skill.
 * Calls `rantaiclaw cron add <expression> <message>` for each cron trigger.
 */
function registerSkillTriggers(pkg) {
  const skills = pkg.skills?.clawhub || []
  let registered = 0

  for (const skill of skills) {
    const triggers = skill.metadata?.triggers || []
    for (const trigger of triggers) {
      if (trigger.type === "cron" && trigger.expression) {
        const message = trigger.message || `Run skill: ${skill.name || skill.slug}`
        try {
          execFileSyncGlobal(
            CLAW_BIN,
            ["cron", "add", trigger.expression, message],
            { stdio: "pipe", timeout: 10000 }
          )
          registered++
          console.log(`[Triggers] Registered cron: "${trigger.expression}" → ${skill.name || skill.slug}`)
        } catch (err) {
          console.warn(`[Triggers] Failed to register cron for ${skill.name || skill.slug}: ${err.message}`)
        }
      }
    }
  }

  // Write webhook trigger routes for the gateway to load
  const webhookRoutes = []
  for (const skill of skills) {
    const triggers = skill.metadata?.triggers || []
    for (const trigger of triggers) {
      if (trigger.type === "webhook" && trigger.path) {
        webhookRoutes.push({
          path: trigger.path.replace(/^\//, ""),
          skill: skill.name || skill.slug,
          message: trigger.message || `Webhook trigger for skill: ${skill.name || skill.slug}`,
        })
      }
    }
  }

  if (webhookRoutes.length > 0) {
    const routesPath = path.join(CLAW_HOME, "webhook-routes.json")
    fs.mkdirSync(path.dirname(routesPath), { recursive: true })
    fs.writeFileSync(routesPath, JSON.stringify(webhookRoutes, null, 2), "utf-8")
    console.log(`[Triggers] Wrote ${webhookRoutes.length} webhook routes to ${routesPath}`)
  }

  if (registered > 0) {
    console.log(`[Triggers] Registered ${registered} cron triggers`)
  }
}

/**
 * Execute a lifecycle hook by invoking `rantaiclaw agent <hookValue>`.
 */
function executeLifecycleHook(hookType, hookValue, skillName) {
  if (!hookValue) return
  console.log(`[Lifecycle] Executing ${hookType} hook for skill: ${skillName}`)
  try {
    execFileSyncGlobal(
      CLAW_BIN,
      ["agent", hookValue],
      { stdio: "pipe", timeout: 60000 }
    )
    console.log(`[Lifecycle] ${hookType} hook completed for: ${skillName}`)
  } catch (err) {
    console.warn(`[Lifecycle] ${hookType} hook failed for ${skillName}: ${err.message}`)
  }
}

/**
 * Check if required services are available.
 * Returns a map of { serviceName: boolean }.
 */
function checkRequiredServices(services) {
  const results = {}
  for (const service of services) {
    try {
      switch (service) {
        case "redis":
          execFileSyncGlobal("redis-cli", ["ping"], { stdio: "pipe", timeout: 5000 })
          results[service] = true
          break
        case "postgres":
        case "postgresql":
          execFileSyncGlobal("pg_isready", [], { stdio: "pipe", timeout: 5000 })
          results[service] = true
          break
        case "mysql":
          execFileSyncGlobal("mysqladmin", ["ping"], { stdio: "pipe", timeout: 5000 })
          results[service] = true
          break
        default:
          // Fallback: check if the binary exists
          execFileSyncGlobal("which", [service], { stdio: "pipe", timeout: 5000 })
          results[service] = true
          break
      }
    } catch {
      results[service] = false
    }
  }
  return results
}

/**
 * Map OpenClaw permissions to RantaiClaw autonomy context.
 * Returns a prompt string describing which permissions are allowed/denied
 * based on the employee's current autonomy level.
 */
function mapPermissionsToAutonomy(permissions, currentAutonomyLevel) {
  // Map autonomy level names to capability tiers
  // Platform: "supervised" | "autonomous"
  // RantaiClaw: "readonly" | "supervised" | "full"
  const levelTier = {
    readonly: 0,
    supervised: 1,
    full: 2,
  }
  const autonomyMap = { supervised: "supervised", autonomous: "full" }
  const zcLevel = autonomyMap[currentAutonomyLevel] || "supervised"
  const currentTier = levelTier[zcLevel] ?? 1

  // Permission → minimum tier required
  const permissionTiers = {
    "file:read": 0,
    "file:write": 1,
    "network:outbound": 1,
    "network:inbound": 2,
    "system:exec": 2,
    "system:install": 2,
  }

  const allowed = []
  const denied = []

  for (const perm of permissions) {
    const requiredTier = permissionTiers[perm] ?? 1
    if (currentTier >= requiredTier) {
      allowed.push(perm)
    } else {
      denied.push(perm)
    }
  }

  const parts = []
  if (allowed.length > 0) {
    parts.push(`Allowed permissions (autonomy level "${currentAutonomyLevel}"): ${allowed.join(", ")}. You may use these capabilities freely.`)
  }
  if (denied.length > 0) {
    parts.push(`Denied permissions (requires higher autonomy): ${denied.join(", ")}. Do NOT attempt these actions; they are blocked by policy.`)
  }

  return parts.join(" ")
}

async function gatewayMode() {
  console.log(`[Gateway] Starting gateway mode for employee ${EMPLOYEE_ID}`)

  // 1. Read employee package
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("Employee package not found at " + CONFIG_PATH)
  }
  const pkg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
  console.log(`[Gateway] Loaded package for: ${pkg.employee.name}`)

  // 2. Write workspace files
  const workspaceDir = path.join(DATA_DIR, "workspace")
  fs.mkdirSync(workspaceDir, { recursive: true })
  for (const [filename, content] of Object.entries(pkg.workspaceFiles || {})) {
    fs.writeFileSync(path.join(workspaceDir, filename), content, "utf-8")
  }

  // 3. Register tools
  const tools = registerTools(pkg, PLATFORM_API_URL, RUNTIME_TOKEN)
  console.log(`[Gateway] Registered ${tools.length} tools`)

  // Sandbox mode: wrap platform/custom tool executions with mock responses
  if (pkg.employee.sandboxMode) {
    console.log(`[Gateway] Sandbox mode enabled — external tool calls will be simulated`)
    for (const tool of tools) {
      if (tool.type === "platform" || tool.type === "custom") {
        const originalExecute = tool.execute
        tool.execute = async (input) => {
          console.log(`[SANDBOX] Simulating ${tool.type} tool: ${tool.name}`)
          return {
            _sandbox: true,
            message: `[SANDBOX] Tool "${tool.name}" was called with input: ${JSON.stringify(input).substring(0, 500)}. In sandbox mode, no real action was taken.`,
            simulatedResult: { success: true },
          }
        }
      }
    }
  }

  // 6. Bootstrap config via onboard
  const zcHome = CLAW_HOME

  const API_KEY = process.env.AI_API_KEY || ""
  const model = pkg.agent.model || "anthropic/claude-haiku-4.5"
  const provider = process.env.AI_PROVIDER || "openrouter"

  console.log(`[Gateway] Running ${CLAW_BIN} onboard to generate config...`)
  const { execFileSync: execFileGw } = require("child_process")
  try {
    execFileGw(
      CLAW_BIN,
      ["onboard", "--force", "--api-key", API_KEY, "--provider", provider, "--model", model, "--memory", "markdown"],
      { stdio: "inherit", timeout: 30000 }
    )
  } catch (err) {
    console.error("[Gateway] Onboard failed:", err.message)
  }

  // Patch the generated config.toml with gateway + autonomy overrides
  // We use line-by-line patching to avoid TOML parsing issues
  const configPath = path.join(zcHome, "config.toml")
  if (fs.existsSync(configPath)) {
    const lines = fs.readFileSync(configPath, "utf-8").split("\n")
    const output = []
    let currentSection = ""
    const skipSections = new Set(["gateway", "autonomy", "channels_config"])
    let skipping = false

    for (const line of lines) {
      // Match [section] or [[array_table]] headers
      const singleSection = line.match(/^\[([a-zA-Z_][a-zA-Z0-9_.]*)\]\s*$/)
      const arraySection = line.match(/^\[\[([a-zA-Z_][a-zA-Z0-9_.]*)\]\]\s*$/)

      if (singleSection) {
        // Top-level section like [gateway] or [autonomy]
        const topLevel = singleSection[1].split(".")[0]
        currentSection = topLevel
        skipping = skipSections.has(topLevel)
        if (!skipping) output.push(line)
        continue
      }
      if (arraySection) {
        // Array table like [[tools]] — check if it belongs to a skipped section
        const topLevel = arraySection[1].split(".")[0]
        if (skipping && skipSections.has(topLevel)) {
          // Still within a skipped section's sub-table
          continue
        }
        // New top-level array table
        currentSection = topLevel
        skipping = skipSections.has(topLevel)
        if (!skipping) output.push(line)
        continue
      }
      if (!skipping) output.push(line)
    }

    // Append our gateway and autonomy sections
    const pairedTokensStr = RUNTIME_TOKEN ? `"${tomlEscape(RUNTIME_TOKEN)}"` : ""
    output.push("")
    output.push("[gateway]")
    output.push('host = "0.0.0.0"')
    output.push("port = 8080")
    output.push(`require_pairing = ${RUNTIME_TOKEN ? "true" : "false"}`)
    output.push(`paired_tokens = [${pairedTokensStr}]`)
    output.push("allow_public_bind = true")
    output.push("webhook_rate_limit_per_minute = 120")
    output.push("request_timeout_secs = 600")
    output.push("")
    // Map platform autonomy levels to RantaiClaw values
    // Platform: "supervised" | "autonomous"
    // RantaiClaw: "readonly" | "supervised" | "full"
    //
    // NOTE: The employee container is an isolated Docker sandbox, so we always
    // grant full shell access inside it. The platform's autonomy level still
    // controls prompt-level permission hints (via mapPermissionsToAutonomy),
    // but execution policy is unrestricted.
    output.push("[autonomy]")
    output.push('level = "full"')
    output.push("workspace_only = false")
    output.push("block_high_risk_commands = false")
    output.push("require_approval_for_medium_risk = false")
    output.push("max_actions_per_hour = 10000")
    output.push("max_cost_per_day_cents = 100000")
    output.push('allowed_commands = ["git", "bun", "bunx", "ls", "cat", "grep", "find", "echo", "pwd", "wc", "head", "tail", "curl", "wget", "node", "python3", "pip3", "pip", "python", "date", "env", "whoami", "mkdir", "cp", "mv", "rm", "touch", "sort", "uniq", "tr", "cut", "sed", "awk", "jq", "sh", "bash", "chmod", "chown", "tar", "gzip", "gunzip", "zip", "unzip", "xargs", "tee", "diff", "patch", "ln", "realpath", "dirname", "basename", "mktemp", "less", "more", "file", "stat", "du", "df", "free", "top", "ps", "kill", "sleep", "true", "false", "test", "expr", "bc", "dc", "base64", "md5sum", "sha256sum", "openssl", "ssh", "scp", "rsync", "nc", "ncat", "dig", "nslookup", "host", "ping", "traceroute", "ifconfig", "ip", "apt", "apt-get", "dpkg", "npm", "npx", "yarn", "pnpm", "cargo", "rustc", "gcc", "g++", "make", "cmake", "go", "java", "javac", "ruby", "perl", "php", "sqlite3", "mysql", "psql", "redis-cli", "docker", "kubectl", "terraform", "ansible", "aws", "gcloud", "az", "search-skills", "install-skill", "platform-tool", "rantaiclaw", "zeroclaw", "firefox-esr", "xdotool", "open-browser"]')
    output.push("forbidden_paths = []")
    output.push("")

    // Append channel configs from platform integrations
    if (pkg.channelIntegrations && pkg.channelIntegrations.length > 0) {
      // Base section is required — RantaiClaw expects `cli` field
      output.push("[channels_config]")
      output.push("cli = true")
      output.push("message_timeout_secs = 300")
      output.push("")

      for (const ch of pkg.channelIntegrations) {
        if (ch.channelId === "telegram") {
          const c = ch.credentials
          const users = (c.allowedUsers || "*").split(",").map(u => u.trim()).filter(Boolean)
          output.push("[channels_config.telegram]")
          output.push(`bot_token = "${c.botToken}"`)
          output.push(`allowed_users = [${users.map(u => `"${u}"`).join(", ")}]`)
          output.push(`mention_only = ${c.mentionOnly === "true"}`)
          output.push(`stream_mode = "partial"`)
          output.push("")
        }
        if (ch.channelId === "whatsapp") {
          const c = ch.credentials
          const nums = (c.allowedNumbers || "").split(",").map(n => n.trim()).filter(Boolean)
          output.push("[channels_config.whatsapp]")
          output.push(`access_token = "${c.accessToken}"`)
          output.push(`phone_number_id = "${c.phoneNumberId}"`)
          output.push(`verify_token = "${c.verifyToken}"`)
          output.push(`app_secret = "${c.appSecret}"`)
          if (nums.length > 0) {
            output.push(`allowed_numbers = [${nums.map(n => `"${n}"`).join(", ")}]`)
          }
          output.push("")
        }
        if (ch.channelId === "whatsapp-web") {
          const c = ch.credentials
          const nums = (c.allowedNumbers || "").split(",").map(n => n.trim()).filter(Boolean)
          output.push("[channels_config.whatsapp]")
          output.push(`session_path = "/root/.rantaiclaw/state/whatsapp-web/session.db"`)
          if (c.pairPhone) output.push(`pair_phone = "${c.pairPhone}"`)
          if (nums.length > 0) {
            output.push(`allowed_numbers = [${nums.map(n => `"${n}"`).join(", ")}]`)
          }
          output.push("")
        }
      }
      console.log(`[Gateway] Added ${pkg.channelIntegrations.length} channel config(s) to config.toml`)
    }

    fs.writeFileSync(configPath, output.join("\n"), "utf-8")
    console.log(`[Gateway] Patched config.toml: provider=${provider}, model=${model}`)
  }

  // Write all workspace files to RantaiClaw's workspace so they're
  // available to the agent prompt (SOUL.md, AGENTS.md, TOOLS.md, etc.)
  const zcWorkspace = path.join(zcHome, "workspace")
  fs.mkdirSync(zcWorkspace, { recursive: true })
  for (const [filename, content] of Object.entries(pkg.workspaceFiles)) {
    fs.writeFileSync(path.join(zcWorkspace, filename), String(content), "utf-8")
  }
  // Also write raw system prompt as SOUL.md if not already in workspace files
  if (pkg.agent.systemPrompt && !pkg.workspaceFiles["SOUL.md"]) {
    fs.writeFileSync(
      path.join(zcWorkspace, "SOUL.md"),
      pkg.agent.systemPrompt,
      "utf-8"
    )
  }

  // 7. Write platform skills to RantaiClaw skills directory
  //    RantaiClaw expects: skills/<name>/SKILL.md (or SKILL.toml)
  const zcSkillsDir = path.join(zcHome, "workspace", "skills")
  fs.mkdirSync(zcSkillsDir, { recursive: true })

  const allSkillNames = []

  for (const skill of (pkg.skills?.platform || [])) {
    const safeName = skill.name.replace(/[^a-zA-Z0-9-_]/g, "_")
    const skillDir = path.join(zcSkillsDir, safeName)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")
    allSkillNames.push(skill.name)
  }

  for (const skill of (pkg.skills?.clawhub || [])) {
    const safeName = skill.slug.replace(/[^a-zA-Z0-9-_]/g, "_")
    const skillDir = path.join(zcSkillsDir, safeName)
    fs.mkdirSync(skillDir, { recursive: true })

    // Write the markdown content
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")

    // Annotate skill with employee autonomy level for permission mapping
    skill._autonomyLevel = pkg.employee.autonomyLevel || "supervised"

    // Generate SKILL.toml with metadata + tool definitions from ClawHub requires
    const toml = generateSkillToml(skill, skillDir)
    fs.writeFileSync(path.join(skillDir, "SKILL.toml"), toml, "utf-8")

    allSkillNames.push(skill.name || skill.slug)

    // Execute on_install lifecycle hook
    const lifecycle = skill.metadata?.lifecycle || {}
    if (lifecycle.on_install) {
      executeLifecycleHook("on_install", lifecycle.on_install, skill.name || skill.slug)
    }
  }

  console.log(`[Gateway] Wrote ${(pkg.skills?.platform?.length || 0) + (pkg.skills?.clawhub?.length || 0)} skills to ${zcSkillsDir}`)

  // Register cron and webhook triggers from ClawHub skills
  registerSkillTriggers(pkg)

  // 8. Write wrapper scripts to /usr/local/bin so RantaiClaw shell tool can call them
  //    (RantaiClaw strips all env vars except PATH/HOME/TERM for security,
  //     so we bake credentials into scripts rather than relying on env vars)
  const binDir = "/usr/local/bin"
  const apiUrl = PLATFORM_API_URL
  const rtoken = RUNTIME_TOKEN

  // platform-tool: execute a platform tool by name
  const platformToolScript = `#!/bin/sh
TOOL_NAME="$1"
shift
INPUT="$*"
if [ -z "$INPUT" ]; then INPUT="{}"; fi
curl -s -X POST "${apiUrl}/api/runtime/tools/execute" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${rtoken}" \\
  -d "{\\"toolName\\":\\"$TOOL_NAME\\",\\"input\\":$INPUT}"
`
  fs.writeFileSync(path.join(binDir, "platform-tool"), platformToolScript, "utf-8")
  fs.chmodSync(path.join(binDir, "platform-tool"), 0o755)

  // search-skills: search platform + ClawHub skills
  const searchSkillsScript = `#!/bin/sh
QUERY="\${1:-}"
if [ -n "$QUERY" ]; then
  curl -s "${apiUrl}/api/runtime/skills/search?q=$QUERY" \\
    -H "Authorization: Bearer ${rtoken}"
else
  curl -s "${apiUrl}/api/runtime/skills/search" \\
    -H "Authorization: Bearer ${rtoken}"
fi
`
  fs.writeFileSync(path.join(binDir, "search-skills"), searchSkillsScript, "utf-8")
  fs.chmodSync(path.join(binDir, "search-skills"), 0o755)

  // install-skill: install a skill by slug (ClawHub) or by ID (platform)
  // After install, writes SKILL.md to both workspace paths so the agent can use it immediately
  const clawHome = CLAW_HOME
  const installSkillScript = `#!/bin/sh
SLUG_OR_ID="$1"
SOURCE="\${2:-clawhub}"
if [ "$SOURCE" = "platform" ]; then
  RESPONSE=$(curl -s -X POST "${apiUrl}/api/runtime/skills/install" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${rtoken}" \\
    -d "{\\"skillId\\":\\"$SLUG_OR_ID\\",\\"source\\":\\"platform\\"}")
else
  RESPONSE=$(curl -s -X POST "${apiUrl}/api/runtime/skills/install" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${rtoken}" \\
    -d "{\\"slug\\":\\"$SLUG_OR_ID\\",\\"source\\":\\"clawhub\\"}")
fi

# Write skill file to workspace if content is available
CONTENT=$(echo "$RESPONSE" | jq -r '.skill.content // empty')
SKILL_NAME=$(echo "$RESPONSE" | jq -r '.skill.slug // .skill.name // empty' | sed 's/[^a-zA-Z0-9_-]/_/g')
if [ -n "$CONTENT" ] && [ -n "$SKILL_NAME" ]; then
  mkdir -p "${clawHome}/workspace/skills/$SKILL_NAME"
  echo "$CONTENT" > "${clawHome}/workspace/skills/$SKILL_NAME/SKILL.md"
  mkdir -p "/data/workspace/skills/$SKILL_NAME"
  echo "$CONTENT" > "/data/workspace/skills/$SKILL_NAME/SKILL.md"
fi

echo "$RESPONSE"
`
  fs.writeFileSync(path.join(binDir, "install-skill"), installSkillScript, "utf-8")
  fs.chmodSync(path.join(binDir, "install-skill"), 0o755)

  // open-browser: launch Firefox in the container's display stack
  const openBrowserScript = `#!/usr/bin/env node
const { startBrowserServices, openFirefox } = require("/opt/agent-runner/browser-services");
const url = process.argv[2];
if (!url) { console.error(JSON.stringify({ success: false, error: "Usage: open-browser <url> [wait_seconds]" })); process.exit(1); }
const waitSec = parseInt(process.argv[3] || "3", 10);
(async () => {
  try {
    await startBrowserServices();
    await openFirefox(url);
    await new Promise(r => setTimeout(r, waitSec * 1000));
    console.log(JSON.stringify({ success: true, url, noVncPort: 6080, message: "Browser is running. Use show_to_user with type 'browser' to stream the viewport to the user." }));
  } catch (e) {
    console.error(JSON.stringify({ success: false, error: e.message }));
    process.exit(1);
  }
})();
`
  fs.writeFileSync(path.join(binDir, "open-browser"), openBrowserScript, "utf-8")
  fs.chmodSync(path.join(binDir, "open-browser"), 0o755)

  console.log(`[Gateway] Wrote platform wrapper scripts to ${binDir}`)

  // 9. Generate TOOLS.md with platform + custom tools
  const zcToolsPath = path.join(zcHome, "workspace", "TOOLS.md")

  let toolsDoc = `# Available Tools\n\n`
  toolsDoc += `## Built-in Tools (RantaiClaw native)\n`
  toolsDoc += `- shell, file_read, file_write, memory_store, memory_recall, memory_forget\n\n`

  // Document container-local tools (called via shell, not platform-tool)
  toolsDoc += `## Container Tools\n\n`
  toolsDoc += `These tools run locally inside the container via shell commands.\n\n`
  toolsDoc += `### open-browser\n`
  toolsDoc += `Open a URL in Firefox browser inside the container. Starts display services (Xvfb, VNC) on first use.\n`
  toolsDoc += `After calling this, use show_to_user with type "browser" to stream the viewport to the user.\n\n`
  toolsDoc += "```bash\n"
  toolsDoc += `open-browser "https://example.com"       # opens URL, waits 3s\n`
  toolsDoc += `open-browser "https://example.com" 5     # opens URL, waits 5s\n`
  toolsDoc += "```\n\n"

  const platformAndCustomTools = tools.filter(
    (t) => t.type === "platform" || t.type === "custom"
  )

  if (platformAndCustomTools.length > 0) {
    toolsDoc += `## Platform Tools\n\n`
    toolsDoc += `Call these via the \`platform-tool\` command:\n\n`
    toolsDoc += "```bash\n"
    toolsDoc += `platform-tool TOOL_NAME '{"param":"value"}'\n`
    toolsDoc += "```\n\n"

    for (const tool of platformAndCustomTools) {
      toolsDoc += `### ${tool.name}\n`
      toolsDoc += `${tool.description}\n\n`
      toolsDoc += "```bash\n"
      toolsDoc += `platform-tool ${tool.name} '${JSON.stringify(
        Object.fromEntries(
          Object.entries(tool.parameters?.properties || {}).map(([k, v]) => [k, `<${v.type || "string"}>`])
        )
      )}'\n`
      toolsDoc += "```\n\n"
      if (tool.parameters) {
        toolsDoc += `Parameters:\n\`\`\`json\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\`\n\n`
      }
    }
  }

  // Document custom tool scripts (runnable locally)
  const customTools = pkg.tools.custom.filter((t) => t.language === "javascript")
  if (customTools.length > 0) {
    const customToolsDir = path.join(zcHome, "workspace", "tools")
    fs.mkdirSync(customToolsDir, { recursive: true })

    toolsDoc += `## Custom Tool Scripts\n\n`
    toolsDoc += `These tools are also available as local scripts:\n\n`

    for (const tool of customTools) {
      const script = `#!/usr/bin/env node
// Custom tool: ${tool.name}
// ${tool.description || ""}
const input = JSON.parse(require("fs").readFileSync("/dev/stdin", "utf-8"));
${tool.code}
`
      const scriptPath = path.join(customToolsDir, `${tool.name}.js`)
      fs.writeFileSync(scriptPath, script, "utf-8")
      fs.chmodSync(scriptPath, 0o755)

      toolsDoc += `### ${tool.name}\n`
      toolsDoc += `${tool.description || ""}\n\n`
      toolsDoc += "```bash\n"
      toolsDoc += `echo '{"param":"value"}' | node ${CLAW_HOME}/workspace/tools/${tool.name}.js\n`
      toolsDoc += "```\n\n"
    }

    console.log(`[Gateway] Wrote ${customTools.length} custom tool scripts to ${customToolsDir}`)
  }

  // Document skill management tools (always available)
  {
    toolsDoc += `## Skill Management\n\n`
    toolsDoc += `Search and install skills from both the platform library and ClawHub marketplace.\n\n`
    toolsDoc += `### search-skills\n`
    toolsDoc += `Search for available skills. Omit query to list all.\n\n`
    toolsDoc += "```bash\n"
    toolsDoc += `search-skills "finance"\n`
    toolsDoc += `search-skills           # list all available\n`
    toolsDoc += "```\n\n"
    toolsDoc += `### install-skill\n`
    toolsDoc += `Install a skill by slug (ClawHub) or ID (platform).\n\n`
    toolsDoc += "```bash\n"
    toolsDoc += `install-skill weather                    # ClawHub skill by slug\n`
    toolsDoc += `install-skill cmXXXXXX platform          # Platform skill by ID\n`
    toolsDoc += "```\n\n"
    toolsDoc += `After installing, the skill's SKILL.md is written to \`skills/<name>/SKILL.md\` in your workspace.\n\n`
  }

  fs.writeFileSync(zcToolsPath, toolsDoc, "utf-8")
  console.log(`[Gateway] Generated TOOLS.md with ${platformAndCustomTools.length} platform/custom tools`)

  // Execute on_enable lifecycle hooks for all ClawHub skills
  for (const skill of (pkg.skills?.clawhub || [])) {
    const lifecycle = skill.metadata?.lifecycle || {}
    if (lifecycle.on_enable) {
      executeLifecycleHook("on_enable", lifecycle.on_enable, skill.name || skill.slug)
    }
  }

  // Augment BOOTSTRAP.md with skill references and tool-call instructions
  const bootstrapPath = path.join(zcWorkspace, "BOOTSTRAP.md")
  let bootstrapContent = fs.existsSync(bootstrapPath)
    ? fs.readFileSync(bootstrapPath, "utf-8")
    : "# Bootstrap\n"

  // Add skills section
  if (allSkillNames.length > 0) {
    bootstrapContent += `\n## Installed Skills\nYou have ${allSkillNames.length} skill(s) installed. Read each SKILL.md for instructions:\n`
    for (const name of allSkillNames) {
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "_")
      bootstrapContent += `- **${name}**: \`skills/${safeName}/SKILL.md\`\n`
    }
  }

  // Add tool-call format instructions
  bootstrapContent += `
## Tool Call Format
When using tools, wrap calls in XML markers so the platform can detect them:
\`\`\`
<tool-call name="tool_name">{"param": "value"}</tool-call>
\`\`\`
After tool execution, output results:
\`\`\`
<tool-result name="tool_name">result output</tool-result>
\`\`\`
`
  fs.writeFileSync(bootstrapPath, bootstrapContent, "utf-8")
  console.log(`[Gateway] Augmented BOOTSTRAP.md with ${allSkillNames.length} skill references`)

  // Mirror the final rantaiclaw workspace back to /data/workspace so the
  // IDE (Theia) and file-sync sidecar see the same content
  mirrorWorkspace(zcWorkspace, workspaceDir)

  // 9. Spawn gateway (use daemon mode when channels are configured so
  //    Telegram/WhatsApp pollers start alongside the HTTP gateway)
  const hasChannels = pkg.channelIntegrations && pkg.channelIntegrations.length > 0
  const runCmd = hasChannels ? "daemon" : "gateway"
  console.log(`[Gateway] Spawning ${CLAW_BIN} ${runCmd} on port 8080...`)
  const rantaiclaw = spawn(CLAW_BIN, [runCmd, "--port", "8080", "--host", "0.0.0.0"], {
    stdio: "inherit",
    env: { ...process.env, CLAW_HOME: zcHome },
  })

  rantaiclaw.on("error", (err) => {
    console.error("[Gateway] Spawn error:", err.message)
  })

  rantaiclaw.on("exit", (code) => {
    console.log(`[Gateway] ${runCmd} exited with code ${code}`)
    process.exit(code || 0)
  })

  // 10. Start file sync sidecar
  const stopSync = startFileSync()

  // 11. Start heartbeat
  const heartbeatInterval = setInterval(sendHeartbeat, 30_000)

  // 12. Handle graceful shutdown
  const shutdown = () => {
    console.log("[Gateway] Shutting down...")
    // Execute on_disable lifecycle hooks
    for (const skill of (pkg.skills?.clawhub || [])) {
      const lifecycle = skill.metadata?.lifecycle || {}
      if (lifecycle.on_disable) {
        executeLifecycleHook("on_disable", lifecycle.on_disable, skill.name || skill.slug)
      }
    }
    clearInterval(heartbeatInterval)
    stopSync()
    stopBrowserServices()
    rantaiclaw.kill("SIGTERM")
    setTimeout(() => process.exit(0), 5000)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

// ══════════════════════════════════════════════════════════════════════════
// Group Gateway Mode: multi-agent in a single container
// ══════════════════════════════════════════════════════════════════════════

const GROUP_CONFIG_PATH = path.join(DATA_DIR, "config", "group-package.json")

/**
 * Send a heartbeat for a specific employee (used in group mode where
 * EMPLOYEE_ID env var covers only a single employee).
 */
async function sendHeartbeatFor(employeeId) {
  try {
    await fetch(`${PLATFORM_API_URL}/api/runtime/employees/${employeeId}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNTIME_TOKEN}`,
      },
    })
  } catch (err) {
    console.error(`[GroupGateway] Heartbeat failed for ${employeeId}:`, err.message)
  }
}

/**
 * Write workspace files, skills, tools, and wrapper scripts for a single
 * employee within a group. Mirrors the per-employee setup from gatewayMode()
 * but targets agent-specific directories.
 *
 * @param {object} pkg - The employee package (same shape as employee-package.json)
 * @param {string} employeeId - The employee's ID
 * @param {string} agentWorkspaceDir - e.g. CLAW_HOME/agents/<id>/workspace
 * @param {string} ideWorkspaceDir - e.g. /data/employees/<id>/workspace
 */
function writeEmployeeWorkspace(pkg, employeeId, agentWorkspaceDir, ideWorkspaceDir) {
  // Create both workspace directories
  fs.mkdirSync(agentWorkspaceDir, { recursive: true })
  fs.mkdirSync(ideWorkspaceDir, { recursive: true })

  // Write workspace files (SOUL.md, AGENTS.md, etc.)
  for (const [filename, content] of Object.entries(pkg.workspaceFiles || {})) {
    fs.writeFileSync(path.join(agentWorkspaceDir, filename), String(content), "utf-8")
  }

  // Write system prompt as SOUL.md if not already present
  if (pkg.agent?.systemPrompt && !(pkg.workspaceFiles || {})["SOUL.md"]) {
    fs.writeFileSync(path.join(agentWorkspaceDir, "SOUL.md"), pkg.agent.systemPrompt, "utf-8")
  }

  // Write skills
  const skillsDir = path.join(agentWorkspaceDir, "skills")
  fs.mkdirSync(skillsDir, { recursive: true })
  const allSkillNames = []

  for (const skill of (pkg.skills?.platform || [])) {
    const safeName = skill.name.replace(/[^a-zA-Z0-9-_]/g, "_")
    const skillDir = path.join(skillsDir, safeName)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")
    allSkillNames.push(skill.name)
  }

  for (const skill of (pkg.skills?.clawhub || [])) {
    const safeName = skill.slug.replace(/[^a-zA-Z0-9-_]/g, "_")
    const skillDir = path.join(skillsDir, safeName)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")
    skill._autonomyLevel = pkg.employee?.autonomyLevel || "supervised"
    const toml = generateSkillToml(skill, skillDir)
    fs.writeFileSync(path.join(skillDir, "SKILL.toml"), toml, "utf-8")
    allSkillNames.push(skill.name || skill.slug)

    const lifecycle = skill.metadata?.lifecycle || {}
    if (lifecycle.on_install) {
      executeLifecycleHook("on_install", lifecycle.on_install, skill.name || skill.slug)
    }
  }

  // Register tools and generate TOOLS.md
  const tools = registerTools(pkg, PLATFORM_API_URL, RUNTIME_TOKEN)
  const toolsPath = path.join(agentWorkspaceDir, "TOOLS.md")

  let toolsDoc = `# Available Tools\n\n`
  toolsDoc += `## Built-in Tools (RantaiClaw native)\n`
  toolsDoc += `- shell, file_read, file_write, memory_store, memory_recall, memory_forget\n\n`

  // Document container-local tools (called via shell, not platform-tool)
  toolsDoc += `## Container Tools\n\n`
  toolsDoc += `These tools run locally inside the container via shell commands.\n\n`
  toolsDoc += `### open-browser\n`
  toolsDoc += `Open a URL in Firefox browser inside the container. Starts display services (Xvfb, VNC) on first use.\n`
  toolsDoc += `After calling this, use show_to_user with type "browser" to stream the viewport to the user.\n\n`
  toolsDoc += "```bash\n"
  toolsDoc += `open-browser "https://example.com"       # opens URL, waits 3s\n`
  toolsDoc += `open-browser "https://example.com" 5     # opens URL, waits 5s\n`
  toolsDoc += "```\n\n"

  const platformAndCustomTools = tools.filter(
    (t) => t.type === "platform" || t.type === "custom"
  )

  if (platformAndCustomTools.length > 0) {
    toolsDoc += `## Platform Tools\n\n`
    toolsDoc += `Call these via the \`platform-tool\` command:\n\n`
    toolsDoc += "```bash\n"
    toolsDoc += `platform-tool TOOL_NAME '{"param":"value"}'\n`
    toolsDoc += "```\n\n"

    for (const tool of platformAndCustomTools) {
      toolsDoc += `### ${tool.name}\n`
      toolsDoc += `${tool.description}\n\n`
      toolsDoc += "```bash\n"
      toolsDoc += `platform-tool ${tool.name} '${JSON.stringify(
        Object.fromEntries(
          Object.entries(tool.parameters?.properties || {}).map(([k, v]) => [k, `<${v.type || "string"}>`])
        )
      )}'\n`
      toolsDoc += "```\n\n"
      if (tool.parameters) {
        toolsDoc += `Parameters:\n\`\`\`json\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\`\n\n`
      }
    }
  }

  toolsDoc += `## Skill Management\n\n`
  toolsDoc += `Search and install skills from both the platform library and ClawHub marketplace.\n\n`
  toolsDoc += `### search-skills\nSearch for available skills.\n\n\`\`\`bash\nsearch-skills "finance"\n\`\`\`\n\n`
  toolsDoc += `### install-skill\nInstall a skill by slug (ClawHub) or ID (platform).\n\n\`\`\`bash\ninstall-skill weather\n\`\`\`\n\n`

  fs.writeFileSync(toolsPath, toolsDoc, "utf-8")

  // Augment BOOTSTRAP.md with skill references and tool-call instructions
  const bootstrapPath = path.join(agentWorkspaceDir, "BOOTSTRAP.md")
  let bootstrapContent = fs.existsSync(bootstrapPath)
    ? fs.readFileSync(bootstrapPath, "utf-8")
    : "# Bootstrap\n"

  if (allSkillNames.length > 0) {
    bootstrapContent += `\n## Installed Skills\nYou have ${allSkillNames.length} skill(s) installed. Read each SKILL.md for instructions:\n`
    for (const name of allSkillNames) {
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "_")
      bootstrapContent += `- **${name}**: \`skills/${safeName}/SKILL.md\`\n`
    }
  }

  bootstrapContent += `
## Tool Call Format
When using tools, wrap calls in XML markers so the platform can detect them:
\`\`\`
<tool-call name="tool_name">{"param": "value"}</tool-call>
\`\`\`
After tool execution, output results:
\`\`\`
<tool-result name="tool_name">result output</tool-result>
\`\`\`
`
  fs.writeFileSync(bootstrapPath, bootstrapContent, "utf-8")

  // Mirror to IDE-visible directory
  mirrorWorkspace(agentWorkspaceDir, ideWorkspaceDir)

  console.log(`[GroupGateway] Employee ${employeeId}: wrote ${Object.keys(pkg.workspaceFiles || {}).length} workspace files, ${allSkillNames.length} skills, ${tools.length} tools`)

  return { tools, allSkillNames }
}

async function groupGatewayMode() {
  const GROUP_ID = process.env.GROUP_ID
  const EMPLOYEE_IDS = (process.env.EMPLOYEE_IDS || "").split(",").filter(Boolean)

  console.log(`[GroupGateway] Starting group gateway for group ${GROUP_ID} with ${EMPLOYEE_IDS.length} employees`)

  // 1. Read group package
  if (!fs.existsSync(GROUP_CONFIG_PATH)) {
    throw new Error("Group package not found at " + GROUP_CONFIG_PATH)
  }
  const groupPkg = JSON.parse(fs.readFileSync(GROUP_CONFIG_PATH, "utf-8"))
  const employees = groupPkg.employees || []
  console.log(`[GroupGateway] Loaded group "${groupPkg.group?.name || GROUP_ID}" with ${employees.length} employees`)

  if (employees.length === 0) {
    throw new Error("No employees found in group package")
  }

  // 2. Write wrapper scripts to /usr/local/bin (shared across all agents)
  const binDir = "/usr/local/bin"
  const apiUrl = PLATFORM_API_URL
  const rtoken = RUNTIME_TOKEN

  const platformToolScript = `#!/bin/sh
TOOL_NAME="$1"
shift
INPUT="$*"
if [ -z "$INPUT" ]; then INPUT="{}"; fi
curl -s -X POST "${apiUrl}/api/runtime/tools/execute" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${rtoken}" \\
  -d "{\\"toolName\\":\\"$TOOL_NAME\\",\\"input\\":$INPUT}"
`
  fs.writeFileSync(path.join(binDir, "platform-tool"), platformToolScript, "utf-8")
  fs.chmodSync(path.join(binDir, "platform-tool"), 0o755)

  const searchSkillsScript = `#!/bin/sh
QUERY="\${1:-}"
if [ -n "$QUERY" ]; then
  curl -s "${apiUrl}/api/runtime/skills/search?q=$QUERY" \\
    -H "Authorization: Bearer ${rtoken}"
else
  curl -s "${apiUrl}/api/runtime/skills/search" \\
    -H "Authorization: Bearer ${rtoken}"
fi
`
  fs.writeFileSync(path.join(binDir, "search-skills"), searchSkillsScript, "utf-8")
  fs.chmodSync(path.join(binDir, "search-skills"), 0o755)

  const clawHome = CLAW_HOME
  const installSkillScript = `#!/bin/sh
SLUG_OR_ID="$1"
SOURCE="\${2:-clawhub}"
if [ "$SOURCE" = "platform" ]; then
  RESPONSE=$(curl -s -X POST "${apiUrl}/api/runtime/skills/install" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${rtoken}" \\
    -d "{\\"skillId\\":\\"$SLUG_OR_ID\\",\\"source\\":\\"platform\\"}")
else
  RESPONSE=$(curl -s -X POST "${apiUrl}/api/runtime/skills/install" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer ${rtoken}" \\
    -d "{\\"slug\\":\\"$SLUG_OR_ID\\",\\"source\\":\\"clawhub\\"}")
fi
echo "$RESPONSE"
`
  fs.writeFileSync(path.join(binDir, "install-skill"), installSkillScript, "utf-8")
  fs.chmodSync(path.join(binDir, "install-skill"), 0o755)

  console.log(`[GroupGateway] Wrote platform wrapper scripts to ${binDir}`)

  // 3. Bootstrap config via onboard --force (creates base config.toml)
  const API_KEY = process.env.AI_API_KEY || ""
  const defaultProvider = process.env.AI_PROVIDER || "openrouter"
  const defaultModel = employees[0]?.agent?.model || "anthropic/claude-haiku-4.5"

  console.log(`[GroupGateway] Running ${CLAW_BIN} onboard to generate base config...`)
  const { execFileSync: execFileGw } = require("child_process")
  try {
    execFileGw(
      CLAW_BIN,
      ["onboard", "--force", "--api-key", API_KEY, "--provider", defaultProvider, "--model", defaultModel, "--memory", "markdown"],
      { stdio: "inherit", timeout: 30000 }
    )
  } catch (err) {
    console.error("[GroupGateway] Onboard failed:", err.message)
  }

  // 4. Write workspace files for each employee
  for (const empPkg of employees) {
    const empId = empPkg.employee?.id
    if (!empId) {
      console.warn("[GroupGateway] Skipping employee with no ID")
      continue
    }

    const agentWorkspaceDir = path.join(CLAW_HOME, "agents", empId, "workspace")
    const ideWorkspaceDir = path.join(DATA_DIR, "employees", empId, "workspace")

    writeEmployeeWorkspace(empPkg, empId, agentWorkspaceDir, ideWorkspaceDir)

    // Register triggers for this employee
    registerSkillTriggers(empPkg)

    // Execute on_enable lifecycle hooks
    for (const skill of (empPkg.skills?.clawhub || [])) {
      const lifecycle = skill.metadata?.lifecycle || {}
      if (lifecycle.on_enable) {
        executeLifecycleHook("on_enable", lifecycle.on_enable, skill.name || skill.slug)
      }
    }
  }

  // 5. Patch config.toml with gateway, autonomy, and gateway_agents sections
  const configPath = path.join(CLAW_HOME, "config.toml")
  if (fs.existsSync(configPath)) {
    const lines = fs.readFileSync(configPath, "utf-8").split("\n")
    const output = []
    const skipSections = new Set(["gateway", "autonomy", "gateway_agents", "channels_config"])
    let skipping = false

    for (const line of lines) {
      const singleSection = line.match(/^\[([a-zA-Z_][a-zA-Z0-9_.]*)\]\s*$/)
      const arraySection = line.match(/^\[\[([a-zA-Z_][a-zA-Z0-9_.]*)\]\]\s*$/)

      if (singleSection) {
        const topLevel = singleSection[1].split(".")[0]
        skipping = skipSections.has(topLevel)
        if (!skipping) output.push(line)
        continue
      }
      if (arraySection) {
        const topLevel = arraySection[1].split(".")[0]
        if (skipping && skipSections.has(topLevel)) continue
        skipping = skipSections.has(topLevel)
        if (!skipping) output.push(line)
        continue
      }
      if (!skipping) output.push(line)
    }

    // Append [gateway] section
    const pairedTokensStr = RUNTIME_TOKEN ? `"${tomlEscape(RUNTIME_TOKEN)}"` : ""
    output.push("")
    output.push("[gateway]")
    output.push('host = "0.0.0.0"')
    output.push("port = 8080")
    output.push(`require_pairing = ${RUNTIME_TOKEN ? "true" : "false"}`)
    output.push(`paired_tokens = [${pairedTokensStr}]`)
    output.push("allow_public_bind = true")
    output.push("webhook_rate_limit_per_minute = 120")
    output.push("request_timeout_secs = 600")
    output.push("")

    // Append [autonomy] section (full access inside container)
    output.push("[autonomy]")
    output.push('level = "full"')
    output.push("workspace_only = false")
    output.push("block_high_risk_commands = false")
    output.push("require_approval_for_medium_risk = false")
    output.push("max_actions_per_hour = 10000")
    output.push("max_cost_per_day_cents = 100000")
    output.push('allowed_commands = ["git", "bun", "bunx", "ls", "cat", "grep", "find", "echo", "pwd", "wc", "head", "tail", "curl", "wget", "node", "python3", "pip3", "pip", "python", "date", "env", "whoami", "mkdir", "cp", "mv", "rm", "touch", "sort", "uniq", "tr", "cut", "sed", "awk", "jq", "sh", "bash", "chmod", "chown", "tar", "gzip", "gunzip", "zip", "unzip", "xargs", "tee", "diff", "patch", "ln", "realpath", "dirname", "basename", "mktemp", "less", "more", "file", "stat", "du", "df", "free", "top", "ps", "kill", "sleep", "true", "false", "test", "expr", "bc", "dc", "base64", "md5sum", "sha256sum", "openssl", "ssh", "scp", "rsync", "nc", "ncat", "dig", "nslookup", "host", "ping", "traceroute", "ifconfig", "ip", "apt", "apt-get", "dpkg", "npm", "npx", "yarn", "pnpm", "cargo", "rustc", "gcc", "g++", "make", "cmake", "go", "java", "javac", "ruby", "perl", "php", "sqlite3", "mysql", "psql", "redis-cli", "docker", "kubectl", "terraform", "ansible", "aws", "gcloud", "az", "search-skills", "install-skill", "platform-tool", "rantaiclaw", "zeroclaw", "firefox-esr", "xdotool", "open-browser"]')
    output.push("forbidden_paths = []")
    output.push("")

    // Append channel configs from platform integrations (aggregate from all employees)
    const allChannelIntegrations = employees.flatMap(e => e.channelIntegrations || [])
    if (allChannelIntegrations.length > 0) {
      // Base section is required — RantaiClaw expects `cli` field
      output.push("[channels_config]")
      output.push("cli = true")
      output.push("message_timeout_secs = 300")
      output.push("")

      for (const ch of allChannelIntegrations) {
        if (ch.channelId === "telegram") {
          output.push("[channels_config.telegram]")
          output.push(`bot_token = "${tomlEscape(ch.credentials.botToken || "")}"`)
          if (ch.credentials.allowedUsers && ch.credentials.allowedUsers.trim() && ch.credentials.allowedUsers.trim() !== "*") {
            const users = ch.credentials.allowedUsers.split(",").map(u => `"${tomlEscape(u.trim())}"`).join(", ")
            output.push(`allowed_users = [${users}]`)
          }
          output.push(`mention_only = ${ch.credentials.mentionOnly === "true" ? "true" : "false"}`)
          output.push('stream_mode = "partial"')
          output.push("")
        }
        if (ch.channelId === "whatsapp") {
          output.push("[channels_config.whatsapp]")
          output.push(`access_token = "${tomlEscape(ch.credentials.accessToken || "")}"`)
          output.push(`phone_number_id = "${tomlEscape(ch.credentials.phoneNumberId || "")}"`)
          output.push(`verify_token = "${tomlEscape(ch.credentials.verifyToken || "")}"`)
          output.push(`app_secret = "${tomlEscape(ch.credentials.appSecret || "")}"`)
          if (ch.credentials.allowedNumbers && ch.credentials.allowedNumbers.trim()) {
            const nums = ch.credentials.allowedNumbers.split(",").map(n => `"${tomlEscape(n.trim())}"`).join(", ")
            output.push(`allowed_numbers = [${nums}]`)
          }
          output.push("")
        }
        if (ch.channelId === "whatsapp-web") {
          output.push("[channels_config.whatsapp]")
          output.push('session_path = "/root/.rantaiclaw/state/whatsapp-web/session.db"')
          output.push(`pair_phone = "${tomlEscape(ch.credentials.pairPhone || "")}"`)
          if (ch.credentials.allowedNumbers && ch.credentials.allowedNumbers.trim()) {
            const nums = ch.credentials.allowedNumbers.split(",").map(n => `"${tomlEscape(n.trim())}"`).join(", ")
            output.push(`allowed_numbers = [${nums}]`)
          }
          output.push("")
        }
      }
    }

    // Append [gateway_agents.<employeeId>] sections for each employee
    for (const empPkg of employees) {
      const empId = empPkg.employee?.id
      if (!empId) continue

      const empModel = empPkg.agent?.model || defaultModel
      const empProvider = empPkg.agent?.provider || defaultProvider
      const empApiKey = empPkg.agent?.apiKey || API_KEY
      const empTemperature = empPkg.agent?.temperature ?? 0.7
      const empWorkspaceDir = path.join(CLAW_HOME, "agents", empId, "workspace")

      output.push(`[gateway_agents.${empId}]`)
      output.push(`workspace_dir = "${tomlEscape(empWorkspaceDir)}"`)
      output.push(`provider = "${tomlEscape(empProvider)}"`)
      output.push(`model = "${tomlEscape(empModel)}"`)
      output.push(`api_key = "${tomlEscape(empApiKey)}"`)
      output.push(`temperature = ${empTemperature}`)
      output.push("")
    }

    fs.writeFileSync(configPath, output.join("\n"), "utf-8")
    console.log(`[GroupGateway] Patched config.toml with ${employees.length} gateway_agents sections`)
  }

  // 6. Spawn gateway (use daemon mode when channels are configured)
  const hasChannels = allChannelIntegrations.length > 0
  const runCmd = hasChannels ? "daemon" : "gateway"
  console.log(`[GroupGateway] Spawning ${CLAW_BIN} ${runCmd} on port 8080...`)
  const rantaiclaw = spawn(CLAW_BIN, [runCmd, "--port", "8080", "--host", "0.0.0.0"], {
    stdio: "inherit",
    env: { ...process.env, CLAW_HOME },
  })

  rantaiclaw.on("error", (err) => {
    console.error("[GroupGateway] Spawn error:", err.message)
  })

  rantaiclaw.on("exit", (code) => {
    console.log(`[GroupGateway] ${runCmd} exited with code ${code}`)
    process.exit(code || 0)
  })

  // 7. Start file-sync sidecar for each employee
  const stopSyncs = []
  for (const empPkg of employees) {
    const empId = empPkg.employee?.id
    if (!empId) continue

    const agentWs = path.join(CLAW_HOME, "agents", empId, "workspace")
    const ideWs = path.join(DATA_DIR, "employees", empId, "workspace")

    // Start a periodic mirror from agent workspace to IDE workspace
    const syncInterval = setInterval(() => {
      try { mirrorWorkspace(agentWs, ideWs) } catch {}
    }, 5000)
    stopSyncs.push(() => clearInterval(syncInterval))
  }

  // Also start the default file-sync sidecar
  const stopDefaultSync = startFileSync()

  // 8. Start heartbeats for all employees
  const heartbeatInterval = setInterval(() => {
    for (const empPkg of employees) {
      const empId = empPkg.employee?.id
      if (empId) sendHeartbeatFor(empId)
    }
  }, 30_000)

  // Send initial heartbeats immediately
  for (const empPkg of employees) {
    const empId = empPkg.employee?.id
    if (empId) sendHeartbeatFor(empId)
  }

  // 9. Handle graceful shutdown
  const shutdown = () => {
    console.log("[GroupGateway] Shutting down...")
    // Execute on_disable lifecycle hooks for all employees
    for (const empPkg of employees) {
      for (const skill of (empPkg.skills?.clawhub || [])) {
        const lifecycle = skill.metadata?.lifecycle || {}
        if (lifecycle.on_disable) {
          executeLifecycleHook("on_disable", lifecycle.on_disable, skill.name || skill.slug)
        }
      }
    }
    clearInterval(heartbeatInterval)
    for (const stop of stopSyncs) stop()
    stopDefaultSync()
    stopBrowserServices()
    rantaiclaw.kill("SIGTERM")
    setTimeout(() => process.exit(0), 5000)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

/**
 * Extract executable script blocks from a ClawHub skill's markdown content.
 * Writes each script to a temp file and returns shell tool definitions that
 * execute them directly (RantaiClaw shell tools don't pipe stdin).
 */
function extractScriptTools(content, skillDir) {
  const tools = []
  const fencedPattern = /```(bash|sh|python|javascript|typescript|js|ts)\n([\s\S]*?)```/g
  let match
  let idx = 0
  const seenNames = new Set()

  while ((match = fencedPattern.exec(content)) !== null) {
    const lang = match[1]
    const code = match[2].trim()

    // Skip short snippets (likely examples, not tools)
    if (code.split("\n").length < 3) continue

    // Check for tool-like patterns (function definitions, shebang, main logic)
    const isToolLike =
      code.includes("#!/") ||
      code.includes("def ") ||
      code.includes("function ") ||
      code.includes("async ") ||
      code.includes("import ") ||
      code.includes("require(")

    if (!isToolLike) continue

    idx++
    const ext = lang === "python" ? "py" : ["bash", "sh"].includes(lang) ? "sh" : "js"
    const runtime =
      lang === "python"
        ? "python3"
        : ["javascript", "js", "typescript", "ts"].includes(lang)
          ? "bun run"
          : "bash"

    // Look for the nearest heading before this code block to use as the tool name
    const before = content.substring(0, match.index)
    const headingMatches = [...before.matchAll(/#{1,4}\s+(.+)/g)]
    const lastHeading = headingMatches.length > 0 ? headingMatches[headingMatches.length - 1] : null
    let name = lastHeading
      ? lastHeading[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
      : `script_tool_${idx}`

    // Deduplicate names
    if (seenNames.has(name)) name = `${name}_${idx}`
    seenNames.add(name)

    // Write script to file inside the skill directory so RantaiClaw can execute it
    if (skillDir) {
      const scriptPath = path.join(skillDir, `${name}.${ext}`)
      fs.writeFileSync(scriptPath, code, { mode: 0o755 })

      tools.push({
        name,
        description: `Script tool from ClawHub skill (${lang})`,
        command: `${runtime} ${scriptPath}`,
      })
    }
  }

  return tools
}

/**
 * Generate a SKILL.toml for a ClawHub skill, handling:
 * - Basic metadata ([skill] section)
 * - Required binaries as [[tools]] shell commands
 * - Embedded script tools from code blocks
 * - OpenClaw-specific features (requires.tools, requires.services,
 *   requires.permissions, triggers, lifecycle) — mapped or warned
 * - Full SKILL.md content embedded in prompts array
 */
function generateSkillToml(skill, skillDir) {
  const meta = skill.metadata || {}
  const requires = meta.requires || meta.openclaw?.requires || {}
  const bins = requires.bins || []
  const env = requires.env || []
  const requiredTools = requires.tools || []
  const services = requires.services || []
  const permissions = requires.permissions || []
  const triggers = meta.triggers || []
  const lifecycle = meta.lifecycle || {}
  const integrations = meta.integrations || []

  let toml = `[skill]\n`
  toml += `name = "${tomlEscape(skill.name || skill.slug)}"\n`
  toml += `description = "${tomlEscape(skill.description || skill.name || skill.slug)}"\n`
  toml += `version = "${tomlEscape(meta.version || "0.1.0")}"\n`
  if (meta.author) toml += `author = "${tomlEscape(meta.author)}"\n`
  if (meta.tags && Array.isArray(meta.tags)) {
    toml += `tags = [${meta.tags.map((t) => `"${tomlEscape(t)}"`).join(", ")}]\n`
  }
  toml += `\n`

  // Generate [[tools]] for each required binary
  for (const bin of bins) {
    toml += `[[tools]]\nname = "${tomlEscape(bin)}"\ndescription = "Run ${tomlEscape(bin)} command"\nkind = "shell"\ncommand = "${tomlEscape(bin)}"\n\n`
  }

  // Extract script tools from embedded code blocks
  const scriptTools = extractScriptTools(skill.content, skillDir)
  for (const st of scriptTools) {
    toml += `[[tools]]\n`
    toml += `name = "${tomlEscape(st.name)}"\n`
    toml += `description = "${tomlEscape(st.description)}"\n`
    toml += `kind = "shell"\n`
    toml += `command = "${tomlEscape(st.command)}"\n`
    toml += `\n`
  }

  // Build prompts: embed skill content + compatibility notes
  const promptParts = []
  if (skill.content && skill.content.trim()) {
    promptParts.push(skill.content.trim())
  }
  if (env.length > 0) {
    promptParts.push(`Required environment variables: ${env.join(", ")}`)
  }

  // Map requires.tools — these reference platform tools the skill expects
  if (requiredTools.length > 0) {
    promptParts.push(
      `This skill expects the following platform tools to be available: ${requiredTools.join(", ")}. ` +
      `Use these tools when this skill's instructions call for them.`
    )
  }

  // Map integrations to hints
  if (integrations.length > 0) {
    promptParts.push(
      `This skill integrates with: ${integrations.join(", ")}. ` +
      `Ensure the required API keys and credentials are configured.`
    )
  }

  // ── OpenClaw Feature Support ──

  // Feature C: Service detection — check and report service availability
  if (services.length > 0) {
    const serviceStatus = checkRequiredServices(services)
    const available = Object.entries(serviceStatus).filter(([, v]) => v).map(([k]) => k)
    const unavailable = Object.entries(serviceStatus).filter(([, v]) => !v).map(([k]) => k)
    if (available.length > 0) {
      promptParts.push(`Available services: ${available.join(", ")}. These are running and can be used.`)
    }
    if (unavailable.length > 0) {
      promptParts.push(`Unavailable services: ${unavailable.join(", ")}. These are not running; use alternative approaches.`)
      console.warn(`[Skill] ${skill.name || skill.slug}: unavailable services: ${unavailable.join(", ")}`)
    }
  }

  // Feature D: Permission mapping — map to autonomy context
  if (permissions.length > 0) {
    const autonomyLevel = skill._autonomyLevel || "supervised"
    const permPrompt = mapPermissionsToAutonomy(permissions, autonomyLevel)
    if (permPrompt) {
      promptParts.push(permPrompt)
    }
  }

  // Features A & B (triggers, lifecycle) are handled in boot sequence, not in TOML generation.
  // Only warn about truly unmappable features.
  const unmapped = []
  if (triggers.length > 0) {
    // Triggers are registered in boot sequence via registerSkillTriggers()
    console.log(`[Skill] ${skill.name || skill.slug}: ${triggers.length} trigger(s) will be registered at boot`)
  }
  if (Object.keys(lifecycle).length > 0) {
    // Lifecycle hooks are executed in boot sequence
    console.log(`[Skill] ${skill.name || skill.slug}: lifecycle hooks (${Object.keys(lifecycle).join(", ")}) will be executed at boot`)
  }
  if (unmapped.length > 0) {
    promptParts.push(
      `[Compatibility Note] Unmapped OpenClaw features: ${unmapped.join("; ")}. Use shell tools as alternatives.`
    )
  }

  if (promptParts.length > 0) {
    toml += `prompts = [\n`
    for (let i = 0; i < promptParts.length; i++) {
      const escaped = promptParts[i].replace(/\\/g, "\\\\").replace(/"""/g, '""\\"')
      toml += `"""\n${escaped}\n"""`
      if (i < promptParts.length - 1) toml += `,`
      toml += `\n`
    }
    toml += `]\n`
  }

  return toml
}

async function main() {
  // Check mode
  if (MODE === "gateway") return gatewayMode()
  if (MODE === "group-gateway") return groupGatewayMode()

  const startTime = Date.now()
  console.log(`[Agent Runner] Starting run ${RUN_ID} for employee ${EMPLOYEE_ID}`)

  try {
    // 1. Read employee package
    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error("Employee package not found at " + CONFIG_PATH)
    }
    const pkg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
    console.log(`[Agent Runner] Loaded package for: ${pkg.employee.name}`)

    // 2. Write workspace files
    const workspaceDir = path.join(DATA_DIR, "workspace")
    fs.mkdirSync(workspaceDir, { recursive: true })
    for (const [filename, content] of Object.entries(pkg.workspaceFiles)) {
      fs.writeFileSync(path.join(workspaceDir, filename), content, "utf-8")
    }
    console.log(`[Agent Runner] Wrote ${Object.keys(pkg.workspaceFiles).length} workspace files`)

    // 3. Register tools + load memory + check resume state
    const tools = registerTools(pkg, PLATFORM_API_URL, RUNTIME_TOKEN)
    console.log(`[Agent Runner] Registered ${tools.length} tools`)

    // Sandbox mode: wrap platform/custom tool executions with mock responses
    if (pkg.employee.sandboxMode) {
      console.log(`[Agent Runner] Sandbox mode enabled — external tool calls will be simulated`)
      for (const tool of tools) {
        if (tool.type === "platform" || tool.type === "custom") {
          tool.execute = async (input) => {
            console.log(`[SANDBOX] Simulating ${tool.type} tool: ${tool.name}`)
            return {
              _sandbox: true,
              message: `[SANDBOX] Tool "${tool.name}" was called with input: ${JSON.stringify(input).substring(0, 500)}. In sandbox mode, no real action was taken.`,
              simulatedResult: { success: true },
            }
          }
        }
      }
    }

    const memoryContext = loadMemory(DATA_DIR, pkg.memory)

    let resumeState = null
    if (RESUME_RUN_ID) {
      const statePath = path.join(DATA_DIR, "state", "suspended-run.json")
      const approvalPath = path.join(DATA_DIR, "state", "approval-response.json")
      if (fs.existsSync(statePath)) {
        resumeState = JSON.parse(fs.readFileSync(statePath, "utf-8"))
      }
      if (fs.existsSync(approvalPath)) {
        resumeState = {
          ...resumeState,
          approval: JSON.parse(fs.readFileSync(approvalPath, "utf-8")),
        }
        fs.unlinkSync(approvalPath)
      }
    }

    // 4. Bootstrap config — onboard --force creates fresh workspace
    console.log(`[Agent Runner] Trigger: ${TRIGGER_TYPE}, Workflow: ${WORKFLOW_ID || "none"}`)

    const zcHome = CLAW_HOME
    const API_KEY = process.env.AI_API_KEY || ""
    const model = pkg.agent.model || "anthropic/claude-haiku-4.5"
    const provider = process.env.AI_PROVIDER || "openrouter"

    const { execFileSync } = require("child_process")
    try {
      execFileSync(
        CLAW_BIN,
        ["onboard", "--force", "--api-key", API_KEY, "--provider", provider, "--model", model, "--memory", "markdown"],
        { stdio: "inherit", timeout: 30000 }
      )
    } catch (err) {
      console.error("[Agent Runner] Onboard failed:", err.message)
    }

    // 5. Write workspace files AFTER onboard (overwrite defaults with our content)
    const zcWorkspace = path.join(zcHome, "workspace")
    fs.mkdirSync(zcWorkspace, { recursive: true })
    for (const [filename, content] of Object.entries(pkg.workspaceFiles || {})) {
      fs.writeFileSync(path.join(zcWorkspace, filename), String(content), "utf-8")
    }
    if (pkg.agent.systemPrompt && !(pkg.workspaceFiles || {})["SOUL.md"]) {
      fs.writeFileSync(path.join(zcWorkspace, "SOUL.md"), pkg.agent.systemPrompt, "utf-8")
    }

    // 6. Write skill files AFTER onboard (so onboard doesn't wipe them)
    const zcSkillsDir = path.join(zcHome, "workspace", "skills")
    fs.mkdirSync(zcSkillsDir, { recursive: true })
    const runSkillNames = []

    for (const skill of (pkg.skills?.platform || [])) {
      const safeName = skill.name.replace(/[^a-zA-Z0-9-_]/g, "_")
      const skillDir = path.join(zcSkillsDir, safeName)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")
      runSkillNames.push(skill.name)
    }

    for (const skill of (pkg.skills?.clawhub || [])) {
      const safeName = skill.slug.replace(/[^a-zA-Z0-9-_]/g, "_")
      const skillDir = path.join(zcSkillsDir, safeName)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content, "utf-8")
      skill._autonomyLevel = pkg.employee.autonomyLevel || "supervised"
      const toml = generateSkillToml(skill, skillDir)
      fs.writeFileSync(path.join(skillDir, "SKILL.toml"), toml, "utf-8")
      runSkillNames.push(skill.name || skill.slug)
      const lifecycle = skill.metadata?.lifecycle || {}
      if (lifecycle.on_install) {
        executeLifecycleHook("on_install", lifecycle.on_install, skill.name || skill.slug)
      }
    }
    console.log(`[Agent Runner] Wrote ${(pkg.skills.platform?.length || 0) + (pkg.skills.clawhub?.length || 0)} skills`)

    // Augment BOOTSTRAP.md with skill references
    const runBootstrapPath = path.join(zcWorkspace, "BOOTSTRAP.md")
    if (runSkillNames.length > 0 && fs.existsSync(runBootstrapPath)) {
      let bsContent = fs.readFileSync(runBootstrapPath, "utf-8")
      bsContent += `\n## Installed Skills\nYou have ${runSkillNames.length} skill(s) installed. Read each SKILL.md for instructions:\n`
      for (const name of runSkillNames) {
        const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "_")
        bsContent += `- **${name}**: \`skills/${safeName}/SKILL.md\`\n`
      }
      fs.writeFileSync(runBootstrapPath, bsContent, "utf-8")
    }

    registerSkillTriggers(pkg)

    // Build the message from trigger context
    const triggerInput = process.env.TRIGGER_INPUT
    let message = `Execute task: trigger=${TRIGGER_TYPE}`
    if (triggerInput) {
      try {
        const input = JSON.parse(triggerInput)
        message = input.message || input.prompt || input.query || JSON.stringify(input)
      } catch { message = triggerInput }
    }
    if (WORKFLOW_ID) message += ` (workflow: ${WORKFLOW_ID})`
    if (resumeState) message += ` (resuming from previous run)`

    // Clamp message length to prevent abuse
    if (message.length > 4096) message = message.substring(0, 4096)

    // 8. Execute via RantaiClaw agent (single-shot mode)
    console.log(`[Agent Runner] Running rantaiclaw agent with message: ${message.substring(0, 100)}...`)
    await reportStatus("RUNNING", { message: "Executing agent..." })

    let zcOutput = ""
    let zcExitCode = 0
    try {
      zcOutput = execFileSync(
        CLAW_BIN,
        ["agent", message],
        {
          encoding: "utf-8",
          timeout: 300000, // 5 minute timeout
          env: { ...process.env },
          maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
        }
      )
    } catch (err) {
      zcOutput = err.stdout || err.stderr || err.message
      zcExitCode = err.status || 1
    }

    const result = {
      success: zcExitCode === 0,
      trigger: TRIGGER_TYPE,
      workflowId: WORKFLOW_ID,
      message: zcOutput || `Run completed by ${pkg.employee.name}`,
      toolsAvailable: tools.length,
      memoryLoaded: !!memoryContext,
      resumed: !!resumeState,
    }

    // 9. Write daily note
    const executionTimeMs = Date.now() - startTime
    const note = `## Run ${RUN_ID}\n- Trigger: ${TRIGGER_TYPE}\n- Duration: ${executionTimeMs}ms\n- Status: ${zcExitCode === 0 ? "completed" : "failed"}\n- Output: ${(zcOutput || "").substring(0, 500)}\n`
    writeDailyNote(DATA_DIR, note)

    // 10. Report results
    await reportOutput(result)
    await reportStatus(zcExitCode === 0 ? "COMPLETED" : "FAILED", { executionTimeMs })

    console.log(`[Agent Runner] Run ${zcExitCode === 0 ? "completed" : "failed"} in ${executionTimeMs}ms`)
  } catch (error) {
    console.error(`[Agent Runner] Run failed:`, error.message)
    await reportStatus("FAILED", {
      error: error.message,
      executionTimeMs: Date.now() - startTime,
    })
    process.exit(1)
  }
}

main()
