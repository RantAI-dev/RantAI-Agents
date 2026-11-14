"use client"

import { useState } from "react"
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Loader2,
  Plus,
  Shield,
  Trash2,
  User,
  Users,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgPaths } from "@/features/org-admin/api"
import type {
  AccessGrant,
  CursorPage,
  OrgMember,
  UnitNode,
} from "@/features/org-admin/types"
import { flattenUnits } from "@/features/org-admin/units"
import { draftFromGrant, grantKey, toGrantBody, type GrantDraft } from "../grants"

const LEVEL_LABELS = { use: "Can use", manage: "Can manage" } as const

/**
 * Who may use (or manage) one agent.
 *
 * A new agent starts with no grants: only the organisation's admins see it until it is shared
 * (design §3.3). The panel edits a draft and saves it with one `PUT`, which replaces every grant;
 * a row that already exists server-side can also be revoked on its own.
 */
export function AgentAccessPanel({ assistantId }: { assistantId: string | null }) {
  const orgFetch = useOrgFetch()
  const { activeOrganization } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const orgName = activeOrganization?.name ?? "the whole organisation"

  const grants = useApiResource<CursorPage<AccessGrant>>(
    assistantId ? `/api/assistants/${assistantId}/access` : null,
  )
  const units = useApiResource<CursorPage<UnitNode>>(orgId ? orgPaths.units(orgId) : null)
  const people = useApiResource<OrgMember[]>(orgId ? orgPaths.members(orgId) : null)

  const [draft, setDraft] = useState<GrantDraft[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [unitChoice, setUnitChoice] = useState("")
  const [personChoice, setPersonChoice] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The server's list seeds the draft once; after that the draft is what the caller edits.
  if (!hydrated && grants.data) {
    setHydrated(true)
    setDraft((grants.data.data ?? []).map(draftFromGrant))
  }

  if (!assistantId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Who can use this agent</CardTitle>
          <CardDescription>Save the agent before choosing who may use it.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const unitRows = flattenUnits(units.data?.data ?? [])
  const peopleRows = (people.data ?? []).filter((person) => !person.isPending)

  const nameFor = (row: GrantDraft): string => {
    if (row.subjectType === "org") return orgName
    if (row.subjectType === "unit") {
      const unit = unitRows.find((entry) => entry.unit.id === row.subjectId)
      return unit ? unit.unit.name : row.subjectId
    }
    const person = peopleRows.find((entry) => entry.userId === row.subjectId)
    return person?.name?.trim() || person?.email || row.subjectId
  }

  const add = (row: GrantDraft) => {
    setDraft((current) =>
      current.some((entry) => grantKey(entry) === grantKey(row)) ? current : [...current, row],
    )
    setSaved(false)
  }

  const setLevel = (row: GrantDraft, level: GrantDraft["level"]) => {
    setDraft((current) =>
      current.map((entry) => (grantKey(entry) === grantKey(row) ? { ...entry, level } : entry)),
    )
    setSaved(false)
  }

  const remove = async (row: GrantDraft) => {
    setError(null)
    setDraft((current) => current.filter((entry) => grantKey(entry) !== grantKey(row)))
    setSaved(false)
    const existing = (grants.data?.data ?? []).find((grant) => grantKey(grant) === grantKey(row))
    if (!existing) return
    setBusy(true)
    try {
      const response = await orgFetch(
        `/api/assistants/${assistantId}/access/${encodeURIComponent(existing.id)}`,
        { method: "DELETE" },
      )
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      grants.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await orgFetch(`/api/assistants/${assistantId}/access`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toGrantBody(draft)),
      })
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      setSaved(true)
      grants.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Who can use this agent</CardTitle>
        <CardDescription>
          A new agent has no grants: only your organisation&apos;s admins see it until you share
          it. A grant to a unit reaches everyone in it and in the units below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {grants.error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {grants.error}
          </div>
        )}

        {grants.loading && !grants.data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading access...
          </div>
        ) : draft.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Nobody but your admins. Add the organisation, a team, or a person below.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {draft.map((row) => (
              <li key={grantKey(row)} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {row.subjectType === "org" ? (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                ) : row.subjectType === "unit" ? (
                  <Users className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{nameFor(row)}</span>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {row.subjectType}
                </Badge>
                <div className="flex items-center rounded-md border p-0.5" role="group" aria-label={`Level for ${nameFor(row)}`}>
                  {(["use", "manage"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={row.level === level}
                      onClick={() => setLevel(row, level)}
                      className={cn(
                        "rounded px-2 py-0.5 text-xs transition-colors",
                        row.level === level
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {LEVEL_LABELS[level]}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  aria-label={`Remove access for ${nameFor(row)}`}
                  disabled={busy}
                  onClick={() => void remove(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Building2 className="h-3.5 w-3.5" />
              Whole organisation
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => add({ subjectType: "org", subjectId: orgId ?? "", level: "use" })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Everyone at {orgName}
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Users className="h-3.5 w-3.5" />
              A department or team
            </p>
            <div className="flex gap-2">
              <Select value={unitChoice} onValueChange={setUnitChoice} disabled={busy}>
                <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Unit to share with">
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitRows.map(({ unit, depth }) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {"— ".repeat(depth)}
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={busy || !unitChoice}
                onClick={() => {
                  add({ subjectType: "unit", subjectId: unitChoice, level: "use" })
                  setUnitChoice("")
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <User className="h-3.5 w-3.5" />
              One person
            </p>
            <div className="flex gap-2">
              <Select value={personChoice} onValueChange={setPersonChoice} disabled={busy}>
                <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Person to share with">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {peopleRows.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.name?.trim() || person.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={busy || !personChoice}
                onClick={() => {
                  add({ subjectType: "user", subjectId: personChoice, level: "use" })
                  setPersonChoice("")
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-2 h-3.5 w-3.5" />}
            Save access
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-chart-2" />
              Saved.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
