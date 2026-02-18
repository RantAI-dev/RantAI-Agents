"use client"

import { useState } from "react"
import { Building2, Save, Trash2, AlertTriangle, AlertCircle, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useOrganization } from "@/hooks/use-organization"
import { useRouter } from "next/navigation"
import { DashboardPageHeader } from "../_components/dashboard-page-header"
import { PlanGate } from "./_components/plan-gate"

export default function OrganizationOverviewPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader title="Organization" subtitle="Manage your organization settings" />
      <div className="flex-1 overflow-auto p-6">
        <PlanGate>
          <OrganizationOverviewContent />
        </PlanGate>
      </div>
    </div>
  )
}

function OrganizationOverviewContent() {
  const router = useRouter()
  const { activeOrganization, isOwner, isAdmin, refetch } = useOrganization()

  const [name, setName] = useState(activeOrganization?.name || "")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useState(() => {
    if (activeOrganization) {
      setName(activeOrganization.name)
    }
  })

  if (!activeOrganization) return null

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Organization name is required")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/organizations/${activeOrganization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update organization")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/organizations/${activeOrganization.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete organization")
      }

      await refetch()
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete organization")
      setIsDeleting(false)
    }
  }

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "default" as const
      case "pro":
        return "secondary" as const
      default:
        return "outline" as const
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            General
          </CardTitle>
          <CardDescription>
            Basic organization information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Organization"
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={activeOrganization.slug} disabled />
            <p className="text-xs text-muted-foreground">
              The URL-friendly identifier for your organization.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label>Plan</Label>
              <div>
                <Badge variant={getPlanBadgeVariant(activeOrganization.plan)}>
                  {activeOrganization.plan.charAt(0).toUpperCase() + activeOrganization.plan.slice(1)}
                </Badge>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Your Role</Label>
              <div>
                <Badge variant="outline">
                  {activeOrganization.role.charAt(0).toUpperCase() + activeOrganization.role.slice(1)}
                </Badge>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {isAdmin && (
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : saved ? (
                  <CheckCircle className="h-4 w-4 mr-2 text-chart-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saved ? "Saved!" : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Organization</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this organization and all its data.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the
                      organization <strong>{activeOrganization.name}</strong> and remove all
                      associated data including assistants, documents, and API keys.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? "Deleting..." : "Delete Organization"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
