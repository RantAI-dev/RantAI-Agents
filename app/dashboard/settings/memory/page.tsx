"use client"

import { DashboardPageHeader } from "../../_components/dashboard-page-header"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Brain, Cpu, Search, UserCircle } from "lucide-react"
import { useMemory } from "@/hooks/use-memory"
import { WorkingMemorySection } from "./_components/working-memory-section"
import { SemanticMemorySection } from "./_components/semantic-memory-section"
import { LongTermMemorySection } from "./_components/long-term-memory-section"
import { cn } from "@/lib/utils"

type MemoryColor = "amber" | "cyan" | "violet" | "primary"

const colorStyles: Record<MemoryColor, {
  border: string
  bg: string
  icon: string
  text: string
}> = {
  amber: {
    border: "border-l-amber-500/30",
    bg: "bg-amber-500/5",
    icon: "text-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  cyan: {
    border: "border-l-cyan-500/30",
    bg: "bg-cyan-500/5",
    icon: "text-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  violet: {
    border: "border-l-violet-500/30",
    bg: "bg-violet-500/5",
    icon: "text-violet-500",
    text: "text-violet-600 dark:text-violet-400",
  },
  primary: {
    border: "border-l-primary/30",
    bg: "bg-primary/5",
    icon: "text-primary",
    text: "text-foreground",
  },
}

function StatBadge({
  icon: Icon,
  label,
  count,
  color = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  color?: MemoryColor
}) {
  const styles = colorStyles[color]
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border border-l-2 px-3 py-2.5 transition-all duration-200 hover:shadow-md animate-fade-in-up",
      styles.border,
      styles.bg
    )}>
      <div className={cn("rounded-lg p-1.5", `${styles.bg}`)}>
        <Icon className={cn("h-4 w-4", styles.icon)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("font-mono text-lg font-bold tracking-tight", styles.text)}>{count}</p>
      </div>
    </div>
  )
}

export default function MemorySettingsPage() {
  const { memories, stats, isLoading, deleteMemory, clearByType } = useMemory()

  const workingMemories = memories.filter((m) => m.type === "WORKING")
  const semanticMemories = memories.filter((m) => m.type === "SEMANTIC")
  const longTermMemories = memories.filter((m) => m.type === "LONG_TERM")

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Memory"
        subtitle="View and manage what the AI remembers"
      />

      <div className="flex-1 overflow-auto p-6 dot-grid-bg">
        {isLoading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
            <div className="h-[400px] bg-muted rounded-lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4 stagger-grid">
              <StatBadge icon={Cpu} label="Working" count={stats.working} color="amber" />
              <StatBadge icon={Search} label="Semantic" count={stats.semantic} color="cyan" />
              <StatBadge icon={UserCircle} label="Long-term" count={stats.longTerm} color="violet" />
              <StatBadge icon={Brain} label="Total" count={stats.total} color="primary" />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="working" className="space-y-4">
              <TabsList>
                <TabsTrigger value="working" className="data-[state=active]:border-b-2 data-[state=active]:border-b-amber-500 data-[state=active]:shadow-none">
                  <Cpu className="h-3.5 w-3.5 mr-1.5" />
                  Working ({stats.working})
                </TabsTrigger>
                <TabsTrigger value="semantic" className="data-[state=active]:border-b-2 data-[state=active]:border-b-cyan-500 data-[state=active]:shadow-none">
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Semantic ({stats.semantic})
                </TabsTrigger>
                <TabsTrigger value="longterm" className="data-[state=active]:border-b-2 data-[state=active]:border-b-violet-500 data-[state=active]:shadow-none">
                  <UserCircle className="h-3.5 w-3.5 mr-1.5" />
                  Long-term ({stats.longTerm})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="working">
                <WorkingMemorySection
                  memories={workingMemories}
                  onDelete={deleteMemory}
                  onClearAll={() => clearByType("WORKING")}
                />
              </TabsContent>

              <TabsContent value="semantic">
                <SemanticMemorySection
                  memories={semanticMemories}
                  onDelete={deleteMemory}
                  onClearAll={() => clearByType("SEMANTIC")}
                />
              </TabsContent>

              <TabsContent value="longterm">
                <LongTermMemorySection
                  memories={longTermMemories}
                  onDelete={deleteMemory}
                  onClearAll={() => clearByType("LONG_TERM")}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
