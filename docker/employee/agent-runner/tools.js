/**
 * Tool registration for the Agent Runner
 *
 * Registers:
 * - Platform tools → HTTP calls back to RantAI API
 * - Custom tools → sandboxed JS execution (vm.runInNewContext)
 * - Employee built-in tools (install_skill, create_tool, etc.)
 */

const vm = require("vm")

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

module.exports = { registerTools }
