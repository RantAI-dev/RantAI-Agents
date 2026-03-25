import { execSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"

type SubmoduleStatus = {
  path: string
  sha: string
  marker: string
}

type CompatRelease = {
  rantai_agents_version: string
  date: string
  notes?: string
  submodules: {
    rantaiclaw: {
      sha: string
      tag?: string
    }
    community_skills: {
      sha: string
      tag?: string
    }
  }
}

type CompatFile = {
  schemaVersion: number
  releases: CompatRelease[]
}

const REQUIRED_SUBMODULES = [
  "packages/rantaiclaw",
  "packages/community-skills",
] as const

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).replace(/\s+$/, "")
}

function parseArgs(argv: string[]) {
  let version: string | undefined
  let verifyRantaiclawChecks = false

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--version") {
      version = argv[i + 1]
      i += 1
      continue
    }
    if (token === "--verify-rantaiclaw-checks") {
      verifyRantaiclawChecks = true
    }
  }

  return { version, verifyRantaiclawChecks }
}

function getSubmoduleStatuses(): Record<string, SubmoduleStatus> {
  const output = run(`git submodule status --recursive ${REQUIRED_SUBMODULES.join(" ")}`)
  const lines = output.split("\n").filter((line) => line.trim().length > 0)

  const result: Record<string, SubmoduleStatus> = {}

  for (const line of lines) {
    const marker = line[0]
    const rest = line.slice(1).trim()
    const [sha, path] = rest.split(/\s+/, 2)
    if (!sha || !path) continue
    result[path] = { path, sha, marker }
  }

  for (const path of REQUIRED_SUBMODULES) {
    if (!result[path]) {
      throw new Error(`Missing submodule status for ${path}`)
    }
  }

  return result
}

function assertSubmodulesClean(statuses: Record<string, SubmoduleStatus>) {
  for (const path of REQUIRED_SUBMODULES) {
    const status = statuses[path]
    if (status.marker !== " ") {
      throw new Error(
        `Submodule ${path} is not pinned/clean (status marker '${status.marker}'). Ensure submodules are initialized and committed.`
      )
    }
    if (!/^[0-9a-f]{40}$/i.test(status.sha)) {
      throw new Error(`Submodule ${path} has invalid SHA: ${status.sha}`)
    }
  }
}

function readCompatFile(): CompatFile {
  const compatPath = "release-compat.json"
  if (!existsSync(compatPath)) {
    throw new Error(`Missing ${compatPath}`)
  }
  const content = readFileSync(compatPath, "utf8")
  const parsed = JSON.parse(content) as CompatFile

  if (!parsed || typeof parsed !== "object") {
    throw new Error("release-compat.json must be a JSON object")
  }
  if (!Array.isArray(parsed.releases) || parsed.releases.length === 0) {
    throw new Error("release-compat.json must contain at least one release entry")
  }

  return parsed
}

function assertShaReachable(remoteUrl: string, sha: string, label: string) {
  const safeUrl = remoteUrl.replace(/'/g, "'\\''")
  const output = run(`git ls-remote '${safeUrl}' ${sha}`)
  if (!output.includes(sha)) {
    throw new Error(`${label} SHA ${sha} is not reachable on ${remoteUrl}`)
  }
}

function assertShaKnownLocally(path: string, sha: string, label: string) {
  const safePath = path.replace(/'/g, "'\\''")
  run(`git -C '${safePath}' cat-file -e ${sha}^{commit}`)
  console.warn(
    `[release-compat] ${label}: remote reachability could not be verified, falling back to locally checked-out commit ${sha}.`
  )
}

function assertSubmoduleShaReachable(path: string, remoteUrl: string, sha: string, label: string) {
  try {
    assertShaReachable(remoteUrl, sha, label)
  } catch (error) {
    // Cross-repo GITHUB_TOKEN permissions can block ls-remote on private repos.
    // In that case, accept the already checked-out commit in the submodule as fallback.
    assertShaKnownLocally(path, sha, label)
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[release-compat] ${label}: ${message}`)
  }
}

function getSubmoduleRemote(path: string): string {
  const configKey = `submodule.${path}.url`
  try {
    const fromConfig = run(`git config --get ${configKey}`)
    if (fromConfig) return fromConfig
  } catch {
    // fall through
  }
  const fromGitmodules = run(`git config -f .gitmodules --get ${configKey}`)
  if (!fromGitmodules) {
    throw new Error(`Cannot resolve remote URL for submodule ${path}`)
  }
  return fromGitmodules
}

function withAuthIfHttps(remoteUrl: string): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) return remoteUrl
  if (!remoteUrl.startsWith("https://")) return remoteUrl
  return remoteUrl.replace("https://", `https://x-access-token:${token}@`)
}

async function assertRantaiclawChecksPassed(sha: string) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN is required for --verify-rantaiclaw-checks")
  }

  const requiredChecks = (process.env.REQUIRED_RANTAICLAW_CHECKS || "CI Required Gate")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const response = await fetch(
    `https://api.github.com/repos/RantAI-dev/RantaiClaw/commits/${sha}/check-runs?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to query RantaiClaw check-runs: ${response.status} ${text}`)
  }

  const payload = await response.json() as { check_runs?: Array<{ name: string; status: string; conclusion: string | null }> }
  const checkRuns = payload.check_runs || []
  const names = checkRuns.map((run) => run.name)

  for (const requiredName of requiredChecks) {
    const matched = checkRuns.find((run) => run.name === requiredName)
    if (!matched) {
      throw new Error(
        `Required RantaiClaw check '${requiredName}' not found for ${sha}. Available checks: ${names.join(", ")}`
      )
    }
    if (matched.status !== "completed" || matched.conclusion !== "success") {
      throw new Error(
        `Required RantaiClaw check '${requiredName}' is not successful for ${sha} (status=${matched.status}, conclusion=${matched.conclusion})`
      )
    }
  }
}

function toCompatibilityMarkdown(entry: CompatRelease): string {
  const rTag = entry.submodules.rantaiclaw.tag ? ` (${entry.submodules.rantaiclaw.tag})` : ""
  const cTag = entry.submodules.community_skills.tag ? ` (${entry.submodules.community_skills.tag})` : ""
  const notes = entry.notes?.trim() || "No additional notes."
  return [
    "## Compatibility Matrix",
    `- RantAI Agents: \`${entry.rantai_agents_version}\``,
    `- RantaiClaw: \`${entry.submodules.rantaiclaw.sha}\`${rTag}`,
    `- Community Skills: \`${entry.submodules.community_skills.sha}\`${cTag}`,
    `- Compatibility date: ${entry.date}`,
    `- Notes: ${notes}`,
  ].join("\n")
}

function setGithubOutput(name: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) return
  appendFileSync(outputPath, `${name}<<EOF\n${value}\nEOF\n`)
}

async function main() {
  const { version, verifyRantaiclawChecks } = parseArgs(process.argv.slice(2))
  const statuses = getSubmoduleStatuses()
  assertSubmodulesClean(statuses)

  const compat = readCompatFile()
  let releaseEntry: CompatRelease | undefined

  if (version) {
    releaseEntry = compat.releases.find((entry) => entry.rantai_agents_version === version)
    if (!releaseEntry) {
      throw new Error(`release-compat.json has no entry for version ${version}`)
    }

    const rSha = statuses["packages/rantaiclaw"].sha
    const cSha = statuses["packages/community-skills"].sha
    if (releaseEntry.submodules.rantaiclaw.sha !== rSha) {
      throw new Error(
        `release-compat mismatch: rantaiclaw SHA is ${rSha}, expected ${releaseEntry.submodules.rantaiclaw.sha} for ${version}`
      )
    }
    if (releaseEntry.submodules.community_skills.sha !== cSha) {
      throw new Error(
        `release-compat mismatch: community-skills SHA is ${cSha}, expected ${releaseEntry.submodules.community_skills.sha} for ${version}`
      )
    }
  } else {
    releaseEntry = compat.releases[0]
  }

  const rantaiclawRemote = withAuthIfHttps(getSubmoduleRemote("packages/rantaiclaw"))
  const communityRemote = withAuthIfHttps(getSubmoduleRemote("packages/community-skills"))

  assertSubmoduleShaReachable(
    "packages/rantaiclaw",
    rantaiclawRemote,
    statuses["packages/rantaiclaw"].sha,
    "RantaiClaw"
  )
  assertSubmoduleShaReachable(
    "packages/community-skills",
    communityRemote,
    statuses["packages/community-skills"].sha,
    "Community Skills"
  )

  if (verifyRantaiclawChecks) {
    await assertRantaiclawChecksPassed(statuses["packages/rantaiclaw"].sha)
  }

  const markdown = toCompatibilityMarkdown(releaseEntry)
  console.log(markdown)
  setGithubOutput("compatibility_markdown", markdown)
  setGithubOutput("rantaiclaw_sha", statuses["packages/rantaiclaw"].sha)
  setGithubOutput("community_skills_sha", statuses["packages/community-skills"].sha)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`release-compat check failed: ${message}`)
  process.exit(1)
})
