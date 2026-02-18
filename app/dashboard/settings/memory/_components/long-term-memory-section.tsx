"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Trash2, UserCircle } from "lucide-react"
import type { MemoryItem } from "@/hooks/use-memory"
import type { UserProfile } from "@/lib/memory/types"

interface LongTermMemorySectionProps {
  memories: MemoryItem[]
  onDelete: (id: string) => void
  onClearAll: () => void
}

export function LongTermMemorySection({
  memories,
  onDelete,
  onClearAll,
}: LongTermMemorySectionProps) {
  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="rounded-full bg-violet-500/10 p-3 mb-3">
          <UserCircle className="h-6 w-6 text-violet-500/40" />
        </div>
        <p className="text-sm font-medium">No long-term memory entries</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Long-term memory builds a profile over multiple conversations
        </p>
      </div>
    )
  }

  // Find the user_profile entry
  const profileMemory = memories.find((m) => m.key === "user_profile")
  const profile = profileMemory?.value as unknown as UserProfile | null
  const otherMemories = memories.filter((m) => m.key !== "user_profile")

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Clear Profile
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Long-term Memory?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your user profile including all
                stored facts and preferences. The AI will no longer remember
                information about you across conversations. This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onClearAll}>
                Clear Profile
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {profile && (
        <div className="space-y-4">
          {/* Interaction Summary */}
          {profile.interactionSummary && (
            <Card className="border-l-2 border-l-violet-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-violet-600 dark:text-violet-400">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {profile.interactionSummary}
                </p>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span>
                    Total conversations: <span className="font-mono font-medium text-violet-600 dark:text-violet-400">{profile.totalConversations ?? 0}</span>
                  </span>
                  {profile.lastInteractionAt && (
                    <span>
                      Last:{" "}
                      <span className="font-mono">
                        {new Date(profile.lastInteractionAt).toLocaleDateString()}
                      </span>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Facts */}
          {profile.facts && profile.facts.length > 0 && (
            <Card className="border-l-2 border-l-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Known Facts ({profile.facts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Predicate</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead className="text-right">Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.facts.map((fact, i) => {
                      const confidence = (fact.confidence ?? 0) * 100
                      return (
                        <TableRow key={i} className="hover:bg-violet-500/5">
                          <TableCell className="font-medium">
                            {fact.predicate}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{fact.object}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-violet-500/60"
                                  style={{ width: `${confidence}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs w-8 text-right">
                                {confidence.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Preferences */}
          {profile.preferences && profile.preferences.length > 0 && (
            <Card className="border-l-2 border-l-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Preferences ({profile.preferences.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.preferences.map((pref, i) => (
                      <TableRow key={i} className="hover:bg-violet-500/5">
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {pref.category}
                        </TableCell>
                        <TableCell className="font-medium">
                          {pref.key}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{pref.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Other long-term memory entries */}
      {otherMemories.map((memory) => (
        <Card key={memory.id} className="border-l-2 border-l-violet-500/20 transition-all duration-200 hover:border-l-violet-500/40 hover:shadow-md">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{memory.key}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {JSON.stringify(memory.value).slice(0, 200)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onDelete(memory.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
