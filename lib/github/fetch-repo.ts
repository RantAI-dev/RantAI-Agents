import { shouldIncludeFile } from "./file-filter"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedGithubUrl {
  type: "file" | "repo"
  owner: string
  repo: string
  branch?: string
  path?: string
}

export interface RepoFile {
  path: string
  content: string
  size: number
}

interface GitTreeItem {
  path: string
  mode: string
  type: "blob" | "tree"
  sha: string
  size?: number
}

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_FILES = 500
const MAX_TOTAL_SIZE = 5 * 1024 * 1024 // 5MB
const BATCH_SIZE = 10

// ─── URL Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a GitHub URL into its components.
 * Supports:
 *   github.com/owner/repo
 *   github.com/owner/repo/tree/branch
 *   github.com/owner/repo/tree/branch/subdir
 *   github.com/owner/repo/blob/branch/file.ts
 */
export function parseGithubUrl(url: string): ParsedGithubUrl | null {
  const cleaned = url.replace(/^https?:\/\//, "").replace(/\/$/, "")

  // File URL: github.com/owner/repo/blob/branch/path/to/file
  const fileMatch = cleaned.match(
    /^github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  )
  if (fileMatch) {
    return {
      type: "file",
      owner: fileMatch[1],
      repo: fileMatch[2],
      branch: fileMatch[3],
      path: fileMatch[4],
    }
  }

  // Repo + tree URL: github.com/owner/repo/tree/branch[/subdir]
  const treeMatch = cleaned.match(
    /^github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/
  )
  if (treeMatch) {
    return {
      type: "repo",
      owner: treeMatch[1],
      repo: treeMatch[2],
      branch: treeMatch[3],
      path: treeMatch[4],
    }
  }

  // Bare repo URL: github.com/owner/repo
  const repoMatch = cleaned.match(
    /^github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
  )
  if (repoMatch) {
    return {
      type: "repo",
      owner: repoMatch[1],
      repo: repoMatch[2],
    }
  }

  return null
}

// ─── Tree Fetching ───────────────────────────────────────────────────────────

/**
 * Fetch the full file tree for a repo via GitHub API.
 * If no branch is specified, uses the repo's default branch.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch?: string
): Promise<GitTreeItem[]> {
  // Resolve default branch if needed
  const ref = branch || await getDefaultBranch(owner, repo)

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RantAI-Agents",
      },
    }
  )

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Repository not found: ${owner}/${repo}`)
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded. Try again later.")
    throw new Error(`GitHub API error: ${res.status}`)
  }

  const data = await res.json() as { tree: GitTreeItem[]; truncated: boolean }

  return data.tree.filter((item) => item.type === "blob")
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RantAI-Agents",
      },
    }
  )

  if (!res.ok) {
    throw new Error(`Could not resolve default branch for ${owner}/${repo}`)
  }

  const data = await res.json() as { default_branch: string }
  return data.default_branch
}

// ─── Content Fetching ────────────────────────────────────────────────────────

/**
 * Fetch a single file's content from raw.githubusercontent.com.
 */
async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  )
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface FetchRepoResult {
  files: RepoFile[]
  skippedCount: number
  truncated: boolean
  totalSize: number
}

/**
 * Fetch all importable files from a GitHub repo.
 * Applies smart filtering, respects size/count limits, fetches in batches.
 */
export async function fetchRepoFiles(
  owner: string,
  repo: string,
  branch?: string,
  subdir?: string
): Promise<FetchRepoResult> {
  const ref = branch || await getDefaultBranch(owner, repo)
  const tree = await fetchRepoTree(owner, repo, ref)

  // Filter to target subdir if specified
  let candidates = subdir
    ? tree.filter((item) => item.path.startsWith(subdir + "/") || item.path === subdir)
    : tree

  // Apply smart filter
  const included: GitTreeItem[] = []
  let skippedCount = 0

  for (const item of candidates) {
    if (shouldIncludeFile(item.path, item.size ?? 0)) {
      included.push(item)
    } else {
      skippedCount++
    }
  }

  // Enforce file count limit
  const truncated = included.length > MAX_FILES
  const toFetch = included.slice(0, MAX_FILES)

  // Fetch contents in parallel batches
  const files: RepoFile[] = []
  let totalSize = 0

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const content = await fetchFileContent(owner, repo, ref, item.path)
        return { path: item.path, content, size: content.length }
      })
    )

    for (const result of results) {
      if (result.status === "fulfilled") {
        totalSize += result.value.size
        if (totalSize > MAX_TOTAL_SIZE) {
          return { files, skippedCount: skippedCount + (toFetch.length - files.length), truncated: true, totalSize }
        }
        files.push(result.value)
      } else {
        skippedCount++
      }
    }
  }

  return { files, skippedCount, truncated, totalSize }
}

/**
 * Concatenate repo files into a single text block with file path headers.
 */
export function concatenateFiles(files: RepoFile[]): string {
  return files
    .map((f) => `=== FILE: ${f.path} ===\n${f.content}`)
    .join("\n\n")
}
