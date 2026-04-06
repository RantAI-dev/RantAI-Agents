"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Save, User, Mail, CheckCircle, Loader2 } from "@/lib/icons"
import { AvatarUpload } from "@/features/user/components/avatar-upload"
import { useProfileStore } from "@/hooks/use-profile"

export default function AccountPageClient({
  initialProfile,
}: {
  initialProfile: {
    name: string
    email: string
    avatarUrl: string | null
  }
}) {
  const { avatarUrl, name: storedName, email: storedEmail, setAvatarUrl, setProfile } = useProfileStore()
  const [name, setName] = useState(initialProfile.name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setProfile({
      avatarUrl: initialProfile.avatarUrl,
      name: initialProfile.name,
      email: initialProfile.email,
    })
  }, [initialProfile.avatarUrl, initialProfile.email, initialProfile.name, setProfile])

  async function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Name is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })

      if (response.ok) {
        setProfile({
          avatarUrl: avatarUrl ?? initialProfile.avatarUrl,
          name: trimmedName,
          email: initialProfile.email,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        const data = await response.json()
        setError(data.error || "Failed to update profile")
      }
    } catch (err) {
      console.error("Failed to update profile:", err)
      setError("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUploadComplete = useCallback((newAvatarUrl: string) => {
    setAvatarUrl(newAvatarUrl)
  }, [setAvatarUrl])

  const handleAvatarRemoved = useCallback(() => {
    setAvatarUrl(null)
  }, [setAvatarUrl])

  const displayName = storedName || initialProfile.name || "Agent"
  const displayEmail = storedEmail || initialProfile.email || ""
  const currentAvatarUrl = avatarUrl ?? initialProfile.avatarUrl

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Profile Settings</h2>
        <p className="text-muted-foreground text-sm">
          Update your profile information and account details.
        </p>
      </div>

      {/* Profile Picture Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Picture</CardTitle>
          <CardDescription>
            Upload a profile picture to personalize your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUpload
            currentAvatarUrl={currentAvatarUrl}
            userName={displayName}
            onUploadComplete={handleAvatarUploadComplete}
            onAvatarRemoved={handleAvatarRemoved}
          />
        </CardContent>
      </Card>

      {/* Personal Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>
            Update your display name and view account details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Display Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
              />
              <p className="text-xs text-muted-foreground">
                This name will be shown to customers during conversations.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <Input
                value={displayEmail}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed. Contact an administrator if needed.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 mr-2 text-chart-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
