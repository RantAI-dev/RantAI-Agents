/**
 * Tool registration for the Agent Runner
 *
 * Registers:
 * - Platform tools → HTTP calls back to RantAI API
 * - Custom tools → sandboxed JS execution (vm.runInNewContext)
 * - Employee built-in tools (install_skill, create_tool, etc.)
 */

const vm = require("vm")

/**
 * Intercept OAuth callback URLs (http://127.0.0.1:<port>/...) in tool output
 * and rewrite them to go through the gateway's OAuth proxy.
 *
 * This enables OAuth flows from tools running inside the container to work
 * when the user's browser can't reach 127.0.0.1 inside the container.
 */
const OAUTH_URL_RE = /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/[^\s"'<>]*)/g

async function rewriteOAuthUrls(text, gatewayUrl) {
  if (typeof text !== "string") return text

  const matches = [...text.matchAll(OAUTH_URL_RE)]
  if (matches.length === 0) return text

  let result = text
  for (const match of matches) {
    const port = parseInt(match[1], 10)
    const pathAndQuery = match[2]

    try {
      // Register port with gateway OAuth proxy
      const res = await fetch(`${gatewayUrl}/internal/oauth-proxy/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port, path_prefix: pathAndQuery.split("?")[0] }),
      })
      if (!res.ok) continue

      const data = await res.json()
      const sessionId = data.session_id
      // Rewrite: http://127.0.0.1:37785/oauth2/callback → <gatewayUrl>/oauth-proxy/<session_id>/oauth2/callback
      const newUrl = `${gatewayUrl}/oauth-proxy/${sessionId}${pathAndQuery}`
      result = result.replace(match[0], newUrl)
    } catch {
      // Registration failed, leave URL unchanged
    }
  }

  return result
}

function registerTools(pkg, platformApiUrl, runtimeToken) {
  const tools = []

  // Platform tools → HTTP proxy back to RantAI API
  for (const tool of pkg.tools.platform) {
    tools.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      type: "platform",
      execute: async (input) => {
        // Platform tools are executed by calling back to the platform API
        // The platform handles the actual tool execution
        const res = await fetch(`${platformApiUrl}/api/runtime/tools/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeToken}`,
          },
          body: JSON.stringify({ toolName: tool.name, input }),
        })
        if (!res.ok) throw new Error(`Tool execution failed: ${tool.name}`)
        return res.json()
      },
    })
  }

  // Custom tools → sandboxed JS execution
  for (const tool of pkg.tools.custom) {
    if (tool.language !== "javascript") continue

    tools.push({
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters,
      type: "custom",
      execute: (input) => {
        const sandbox = {
          input,
          JSON,
          Math,
          Date,
          Array,
          Object,
          String,
          Number,
          Boolean,
          parseInt,
          parseFloat,
          console: { log: () => {}, error: () => {}, warn: () => {} },
          result: undefined,
        }

        const wrappedCode = `result = (function() { ${tool.code} })()`

        try {
          vm.runInNewContext(wrappedCode, sandbox, { timeout: 5000 })
          return sandbox.result
        } catch (err) {
          throw new Error(`Custom tool "${tool.name}" failed: ${err.message}`)
        }
      },
    })
  }

  // Employee built-in tools
  tools.push({
    name: "update_memory",
    description: "Update long-term memory",
    parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    type: "builtin",
    execute: async (input) => {
      // Write to local MEMORY.md
      const fs = require("fs")
      const path = require("path")
      fs.writeFileSync(path.join("/data/workspace/MEMORY.md"), input.content, "utf-8")
      return { success: true }
    },
  })

  tools.push({
    name: "write_note",
    description: "Write to today's daily note",
    parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    type: "builtin",
    execute: async (input) => {
      const { writeDailyNote } = require("./memory")
      writeDailyNote("/data", input.content)
      return { success: true }
    },
  })

  tools.push({
    name: "search_memory",
    description: "Search past memory entries",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    type: "builtin",
    execute: async (input) => {
      const { searchLocalMemory } = require("./memory")
      return searchLocalMemory("/data", input.query)
    },
  })

  tools.push({
    name: "list_my_skills",
    description: "List installed skills",
    parameters: { type: "object", properties: {} },
    type: "builtin",
    execute: async () => {
      const allSkills = [
        ...pkg.skills.platform.map((s) => ({ name: s.name, source: "platform" })),
        ...pkg.skills.clawhub.map((s) => ({ name: s.name, slug: s.slug, source: "clawhub" })),
      ]
      return allSkills
    },
  })

  tools.push({
    name: "list_my_tools",
    description: "List available tools",
    parameters: { type: "object", properties: {} },
    type: "builtin",
    execute: async () => {
      return tools.map((t) => ({ name: t.name, type: t.type, description: t.description }))
    },
  })

  // Skill search & install — available to ALL agents
  // (autonomy level still controls whether approval is needed)
  tools.push({
    name: "install_skill",
      description:
        "Install or enable a skill. For ClawHub skills, provide 'slug'. " +
        "For platform skills, provide 'skillId' and set source to 'platform'. " +
        "The skill is saved to the DB and written to your workspace so you can use it immediately.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "ClawHub skill slug (e.g. 'weather'). Use for ClawHub skills." },
          skillId: { type: "string", description: "Platform skill ID. Use for platform skills." },
          source: {
            type: "string",
            enum: ["clawhub", "platform"],
            description: "Where the skill comes from. Defaults to 'clawhub'.",
          },
        },
      },
      type: "builtin",
      execute: async (input) => {
        const source = input.source || (input.skillId ? "platform" : "clawhub")

        // TODO: supervised mode — require approval for each action (future)
        // For now, autonomous proceeds directly; supervised is treated same as autonomous

        // Direct install/enable
        const payload = source === "platform"
          ? { skillId: input.skillId, source: "platform" }
          : { slug: input.slug, source: "clawhub" }

        const res = await fetch(`${platformApiUrl}/api/runtime/skills/install`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeToken}`,
          },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          return { success: false, error: err.error || `Install failed (${res.status})` }
        }

        const data = await res.json()
        const skill = data.skill

        // Write skill files locally so they're available immediately
        if (skill?.content) {
          const fs = require("fs")
          const path = require("path")
          const safeName = (skill.slug || skill.name || input.slug || input.skillId)
            .replace(/[^a-zA-Z0-9-_]/g, "_")

          // Write to rantaiclaw workspace (agent uses this)
          const clawHome = process.env.CLAW_HOME || "/root/.rantaiclaw"
          const zcSkillDir = path.join(clawHome, "workspace", "skills", safeName)
          fs.mkdirSync(zcSkillDir, { recursive: true })
          fs.writeFileSync(path.join(zcSkillDir, "SKILL.md"), skill.content, "utf-8")

          // Write to /data/workspace (IDE uses this)
          const dataSkillDir = path.join("/data", "workspace", "skills", safeName)
          fs.mkdirSync(dataSkillDir, { recursive: true })
          fs.writeFileSync(path.join(dataSkillDir, "SKILL.md"), skill.content, "utf-8")
        }

        return {
          success: true,
          source: skill?.source || source,
          installed: skill?.slug || skill?.name || input.slug || input.skillId,
          name: skill?.name,
          hasContent: !!(skill?.content),
        }
      },
    })

    tools.push({
      name: "search_skills",
      description:
        "Search for skills from both the platform skill library and ClawHub marketplace. " +
        "Returns a list with name, description, source, and ID/slug. " +
        "Use install_skill to install or enable any skill you find. " +
        "Use source=platform for platform-only, source=clawhub for ClawHub-only.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (leave empty to list all available)" },
          source: {
            type: "string",
            enum: ["platform", "clawhub"],
            description: "Filter by source. Omit to search both.",
          },
        },
      },
      type: "builtin",
      execute: async (input) => {
        const params = new URLSearchParams()
        if (input.query) params.set("q", input.query)
        if (input.source) params.set("source", input.source)
        const qs = params.toString() ? `?${params.toString()}` : ""
        const res = await fetch(
          `${platformApiUrl}/api/runtime/skills/search${qs}`,
          {
            headers: { Authorization: `Bearer ${runtimeToken}` },
          }
        )
        if (!res.ok) return { error: "Search failed" }
        return res.json()
      },
    })

  // Package installation tool — allows the employee to install system & runtime packages on demand
  tools.push({
    name: "install_packages",
    description:
      "Install system (apt), runtime (npm/bun/pip), brew, or cargo packages. " +
      "Use this when a skill or task requires tools that aren't pre-installed. " +
      "Examples: install_packages({apt: ['ffmpeg']}), " +
      "install_packages({brew: ['gog']}), " +
      "install_packages({cargo: ['ripgrep']}), " +
      "install_packages({npm: ['playwright']}), " +
      "install_packages({pip: ['pandas']})",
    parameters: {
      type: "object",
      properties: {
        apt: {
          type: "array",
          items: { type: "string" },
          description: "System packages to install via apt-get (e.g. ['libglib2.0-0', 'ffmpeg'])",
        },
        brew: {
          type: "array",
          items: { type: "string" },
          description: "Homebrew packages to install (e.g. ['gog', 'gh']). Installs Homebrew first if needed.",
        },
        cargo: {
          type: "array",
          items: { type: "string" },
          description: "Rust crates to install via cargo install (e.g. ['ripgrep', 'gog'])",
        },
        npm: {
          type: "array",
          items: { type: "string" },
          description: "Node.js packages to install via bun/npm (e.g. ['playwright', 'cheerio'])",
        },
        pip: {
          type: "array",
          items: { type: "string" },
          description: "Python packages to install via pip (e.g. ['pandas', 'requests'])",
        },
        global: {
          type: "boolean",
          description: "Install npm packages globally (default: true)",
        },
        playwright_browsers: {
          type: "boolean",
          description: "Also run 'bunx playwright install chromium' after installing playwright npm package",
        },
      },
    },
    type: "builtin",
    execute: async (input) => {
      const { execSync } = require("child_process")
      const results = { apt: null, brew: null, cargo: null, npm: null, pip: null, playwright: null }
      const errors = []

      // Blocklist: prevent installing packages that could compromise the container
      const aptBlocklist = ["passwd", "login", "openssh-server"]

      try {
        // APT packages
        if (input.apt && input.apt.length > 0) {
          const blocked = input.apt.filter((p) => aptBlocklist.includes(p))
          if (blocked.length > 0) {
            errors.push(`Blocked apt packages: ${blocked.join(", ")}`)
          }
          const safe = input.apt.filter((p) => !aptBlocklist.includes(p))
          if (safe.length > 0) {
            // Sanitize: only allow alphanumeric, hyphens, dots, colons, plus signs
            const sanitized = safe.filter((p) => /^[a-zA-Z0-9][a-zA-Z0-9.\-+:]*$/.test(p))
            if (sanitized.length > 0) {
              try {
                execSync(`apt-get update -qq && apt-get install -y --no-install-recommends ${sanitized.join(" ")}`, {
                  timeout: 120000,
                  stdio: "pipe",
                })
                results.apt = { installed: sanitized }
              } catch (e) {
                errors.push(`apt install failed: ${e.message.slice(0, 200)}`)
              }
            }
          }
        }

        // Homebrew packages — install Homebrew first if needed
        if (input.brew && input.brew.length > 0) {
          const sanitized = input.brew.filter((p) => /^[a-zA-Z0-9][a-zA-Z0-9.\-_/@]*$/.test(p))
          if (sanitized.length > 0) {
            try {
              // Check if brew is installed, install it if not
              try {
                execSync("which brew", { stdio: "pipe", timeout: 5000 })
              } catch {
                // Install Homebrew (runs as root in container — use NONINTERACTIVE)
                execSync(
                  'NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
                  { timeout: 300000, stdio: "pipe", env: { ...process.env, NONINTERACTIVE: "1" } }
                )
                // Add brew to PATH for this session
                const brewPaths = ["/home/linuxbrew/.linuxbrew/bin", "/opt/homebrew/bin", "/usr/local/bin"]
                for (const bp of brewPaths) {
                  try {
                    execSync(`test -x ${bp}/brew`, { stdio: "pipe", timeout: 2000 })
                    process.env.PATH = `${bp}:${process.env.PATH}`
                    break
                  } catch { /* try next */ }
                }
              }
              execSync(`brew install ${sanitized.join(" ")}`, {
                timeout: 300000,
                stdio: "pipe",
                env: process.env,
              })
              results.brew = { installed: sanitized }
            } catch (e) {
              errors.push(`brew install failed: ${e.message.slice(0, 300)}`)
            }
          }
        }

        // Cargo packages — uses the Rust toolchain already in the image
        if (input.cargo && input.cargo.length > 0) {
          const sanitized = input.cargo.filter((p) => /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/.test(p))
          if (sanitized.length > 0) {
            try {
              // Check if cargo is available (it's in the builder stage but not runtime by default)
              try {
                execSync("which cargo", { stdio: "pipe", timeout: 5000 })
              } catch {
                // Install minimal Rust toolchain
                execSync(
                  'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal',
                  { timeout: 120000, stdio: "pipe" }
                )
                process.env.PATH = `/root/.cargo/bin:${process.env.PATH}`
              }
              execSync(`cargo install ${sanitized.join(" ")}`, {
                timeout: 600000,
                stdio: "pipe",
                env: process.env,
              })
              results.cargo = { installed: sanitized }
            } catch (e) {
              errors.push(`cargo install failed: ${e.message.slice(0, 300)}`)
            }
          }
        }

        // NPM/Bun packages
        if (input.npm && input.npm.length > 0) {
          const sanitized = input.npm.filter((p) => /^[@a-zA-Z0-9][a-zA-Z0-9.\-_/@]*$/.test(p))
          if (sanitized.length > 0) {
            try {
              const globalFlag = input.global !== false ? "-g" : ""
              execSync(`bun install ${globalFlag} ${sanitized.join(" ")}`, {
                timeout: 120000,
                stdio: "pipe",
                cwd: "/data/workspace",
              })
              results.npm = { installed: sanitized }
            } catch (e) {
              errors.push(`npm install failed: ${e.message.slice(0, 200)}`)
            }
          }
        }

        // Pip packages
        if (input.pip && input.pip.length > 0) {
          const sanitized = input.pip.filter((p) => /^[a-zA-Z0-9][a-zA-Z0-9.\-_\[\]]*$/.test(p))
          if (sanitized.length > 0) {
            try {
              execSync(`pip install --break-system-packages ${sanitized.join(" ")}`, {
                timeout: 120000,
                stdio: "pipe",
              })
              results.pip = { installed: sanitized }
            } catch (e) {
              errors.push(`pip install failed: ${e.message.slice(0, 200)}`)
            }
          }
        }

        // Playwright browsers
        if (input.playwright_browsers) {
          try {
            execSync("bunx playwright install chromium", {
              timeout: 180000,
              stdio: "pipe",
            })
            results.playwright = { installed: "chromium" }
          } catch (e) {
            errors.push(`Playwright browser install failed: ${e.message.slice(0, 200)}`)
          }
        }
      } catch (e) {
        errors.push(`Unexpected error: ${e.message}`)
      }

      return {
        success: errors.length === 0,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }
    },
  })

  // Autonomy-gated tools
  const permissions = pkg.deploymentConfig?.permissions || {}
  if (permissions.canCreateTools) {
    tools.push({
      name: "create_tool",
      description: "Create a custom tool via code generation",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          code: { type: "string" },
          parameters: { type: "object" },
        },
        required: ["name", "code"],
      },
      type: "builtin",
      execute: async (input) => {
        const needsApproval = pkg.employee.autonomyLevel !== "autonomous"
        const res = await fetch(`${platformApiUrl}/api/runtime/tools/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeToken}`,
          },
          body: JSON.stringify({ ...input, needsApproval }),
        })
        return res.json()
      },
    })
  }

  return tools
}

module.exports = { registerTools, rewriteOAuthUrls }
