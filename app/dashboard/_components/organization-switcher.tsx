"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus, Building2, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useOrganization, type Organization } from "@/hooks/use-organization"
import { useRouter } from "next/navigation"

interface OrganizationSwitcherProps {
  className?: string
}

export function OrganizationSwitcher({ className }: OrganizationSwitcherProps) {
  const router = useRouter()
  const {
    organizations,
    activeOrganization,
    setActiveOrganization,
    createOrganization,
    isLoading,
  } = useOrganization()

  const [open, setOpen] = useState(false)
  const [showNewOrgDialog, setShowNewOrgDialog] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleSelect = (org: Organization) => {
    setActiveOrganization(org)
    setOpen(false)
  }

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return

    setIsCreating(true)
    const org = await createOrganization(newOrgName.trim())
    setIsCreating(false)

    if (org) {
      setNewOrgName("")
      setShowNewOrgDialog(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default"
      case "admin":
        return "secondary"
      default:
        return "outline"
    }
  }

  if (isLoading) {
    return (
      <Button
        variant="outline"
        className={cn("justify-between", className)}
        disabled
      >
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Loading...
        </span>
      </Button>
    )
  }

  if (organizations.length === 0) {
    return (
      <>
        <Button
          variant="outline"
          className={cn("justify-between", className)}
          onClick={() => setShowNewOrgDialog(true)}
        >
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Organization
          </span>
        </Button>

        <Dialog open={showNewOrgDialog} onOpenChange={setShowNewOrgDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Create a new organization to manage your assistants, knowledge base, and team members.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Organization name</Label>
                <Input
                  id="name"
                  placeholder="My Organization"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateOrg()
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewOrgDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrg} disabled={!newOrgName.trim() || isCreating}>
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select organization"
            className={cn("justify-between", className)}
          >
            <span className="flex items-center gap-2 truncate">
              {activeOrganization?.logoUrl ? (
                <img
                  src={activeOrganization.logoUrl}
                  alt=""
                  className="h-4 w-4 rounded object-cover"
                />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{activeOrganization?.name || "Select organization"}</span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search organization..." />
            <CommandList>
              <CommandEmpty>No organization found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                {organizations.map((org) => (
                  <CommandItem
                    key={org.id}
                    onSelect={() => handleSelect(org)}
                    className="flex items-center gap-2"
                  >
                    {org.logoUrl ? (
                      <img
                        src={org.logoUrl}
                        alt=""
                        className="h-4 w-4 rounded object-cover"
                      />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    <span className="flex-1 truncate">{org.name}</span>
                    <Badge variant={getRoleBadgeVariant(org.role)} className="text-[10px] px-1 py-0">
                      {org.role}
                    </Badge>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        activeOrganization?.id === org.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    setShowNewOrgDialog(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </CommandItem>
                {activeOrganization && (
                  <CommandItem
                    onSelect={() => {
                      setOpen(false)
                      router.push("/dashboard/settings/organization")
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Organization Settings
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showNewOrgDialog} onOpenChange={setShowNewOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage your assistants, knowledge base, and team members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                placeholder="My Organization"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOrg()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOrgDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrg} disabled={!newOrgName.trim() || isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
