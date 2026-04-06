"use client"

import { useState, useCallback } from "react"

export interface FileTreeNode {
  name: string
  type: "file" | "dir"
  size: number
  modified: string
  children?: FileTreeNode[]
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

// Gateway returns a flat list with relative-path names (e.g. "skills/foo/SKILL.md").
// This converts that into a proper tree with children arrays.
function buildFileTree(flat: FileTreeNode[]): FileTreeNode[] {
  // Sort so that parent paths always come before their children
  const sorted = [...flat].sort((a, b) => a.name.localeCompare(b.name))
  const root: FileTreeNode[] = []
  const nodeMap = new Map<string, FileTreeNode>()

  for (const entry of sorted) {
    const parts = entry.name.split("/")
    const basename = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join("/")

    const node: FileTreeNode = {
      name: basename,
      type: entry.type,
      size: entry.size,
      modified: entry.modified,
      children: entry.type === "dir" ? [] : undefined,
    }

    nodeMap.set(entry.name, node)

    if (parentPath === "") {
      root.push(node)
    } else {
      const parent = nodeMap.get(parentPath)
      if (parent?.children) {
        parent.children.push(node)
      }
    }
  }

  // Sort each level: directories first, then files, both alphabetically
  const sortLevel = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((n) => (n.children ? { ...n, children: sortLevel(n.children) } : n))

  return sortLevel(root)
}

export function useWorkspace(employeeId: string) {
  const [files, setFiles] = useState<FileTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const base = `/api/dashboard/digital-employees/${employeeId}/workspace`

  const fetchFiles = useCallback(
    async (path?: string, recursive = true) => {
      setIsLoading(true)
      try {
        const qs = new URLSearchParams()
        if (path) qs.set("path", path)
        if (recursive) qs.set("recursive", "true")
        const res = await fetch(
          `${base}/files${qs.toString() ? `?${qs}` : ""}`
        )
        if (res.ok) {
          const data = await res.json()
          setFiles(Array.isArray(data) ? buildFileTree(data) : [])
        }
      } finally {
        setIsLoading(false)
      }
    },
    [base]
  )

  const readFile = useCallback(
    async (path: string): Promise<{ content: string; binary: boolean }> => {
      const res = await fetch(
        `${base}/files/read?path=${encodeURIComponent(path)}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Read failed" }))
        throw new Error(err.error || "Read failed")
      }
      return res.json()
    },
    [base]
  )

  const writeFile = useCallback(
    async (path: string, content: string) => {
      const res = await fetch(`${base}/files/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Write failed" }))
        throw new Error(err.error || "Write failed")
      }
      return res.json()
    },
    [base]
  )

  const deleteFile = useCallback(
    async (path: string) => {
      const res = await fetch(
        `${base}/files?path=${encodeURIComponent(path)}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete failed" }))
        throw new Error(err.error || "Delete failed")
      }
      return res.json()
    },
    [base]
  )

  const execCommand = useCallback(
    async (command: string, cwd?: string): Promise<ExecResult> => {
      const res = await fetch(`${base}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Exec failed" }))
        throw new Error(err.error || "Exec failed")
      }
      return res.json()
    },
    [base]
  )

  return {
    files,
    isLoading,
    fetchFiles,
    readFile,
    writeFile,
    deleteFile,
    execCommand,
  }
}
