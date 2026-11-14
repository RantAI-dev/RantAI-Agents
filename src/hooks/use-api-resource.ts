"use client"

import { useCallback, useEffect, useState } from "react"
import { useOrgFetch } from "@/hooks/use-organization"
import { readApiError } from "@/lib/api/error"

export interface ResourceState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export interface Resource<T> extends ResourceState<T> {
  /** Read the path again, after a change. */
  reload: () => void
  /** Replace what is shown, for an optimistic update the answer already confirmed. */
  setData: (data: T) => void
}

/**
 * One GET, answered by whichever backend serves the path, for a client screen that changes the
 * same resource in place. `path` null means "nothing to read yet" (no organisation selected, no
 * agent saved), which is not an error.
 *
 * Lives in `src/hooks` beside the other data hooks so a component stays a renderer: the
 * compliance guard flags a `useEffect` that fetches inside a migrated component folder.
 */
export function useApiResource<T>(path: string | null): Resource<T> {
  const orgFetch = useOrgFetch()
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: path !== null })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), [])

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false })
      return
    }
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))
    orgFetch(path)
      .then(async (response) => {
        if (!response.ok) {
          const failure = await readApiError(response)
          if (!cancelled) setState({ data: null, error: failure.message, loading: false })
          return
        }
        const body = (await response.json()) as T
        if (!cancelled) setState({ data: body, error: null, loading: false })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ data: null, error: "We could not reach the server. Try again.", loading: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [orgFetch, path, nonce])

  return { ...state, reload, setData }
}

/** A cursor list (`{ data, nextCursor }`) that appends the next page and keeps what it has. */
export function useCursorPage<T>(
  basePath: string | null,
): ResourceState<T[]> & { nextCursor: string | null; reload: () => void; loadMore: () => void; loadingMore: boolean } {
  const orgFetch = useOrgFetch()
  const [rows, setRows] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(basePath !== null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)

  const reload = useCallback(() => {
    setCursor(null)
    setRows([])
    setNextCursor(null)
    setNonce((value) => value + 1)
  }, [])

  const loadMore = useCallback(() => {
    if (nextCursor) setCursor(nextCursor)
  }, [nextCursor])

  useEffect(() => {
    if (!basePath) {
      setLoading(false)
      setRows([])
      return
    }
    const target = cursor
      ? `${basePath}${basePath.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`
      : basePath
    let cancelled = false
    const first = cursor === null
    if (first) setLoading(true)
    else setLoadingMore(true)
    orgFetch(target)
      .then(async (response) => {
        if (!response.ok) {
          const failure = await readApiError(response)
          if (!cancelled) setError(failure.message)
          return
        }
        const body = (await response.json()) as { data: T[]; nextCursor: string | null }
        if (cancelled) return
        setRows((current) => (first ? body.data : [...current, ...body.data]))
        setNextCursor(body.nextCursor)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError("We could not reach the server. Try again.")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setLoadingMore(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgFetch, basePath, cursor, nonce])

  return { data: rows, error, loading, nextCursor, reload, loadMore, loadingMore }
}
