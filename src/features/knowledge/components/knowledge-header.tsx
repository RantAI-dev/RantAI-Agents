"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreHorizontal, Pencil, Trash2, Folder, BookOpen, Database } from "@/lib/icons"
import { BlurText } from "@/components/reactbits/blur-text"
import { CountUp } from "@/components/reactbits/count-up"

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
}

export interface KnowledgeBaseHeader {
  id: string
  name: string
  color: string | null
}

interface KnowledgeHeaderProps {
  selectedKB: KnowledgeBaseHeader | null
  documentCount: number
  knowledgeBaseCount: number
  onAddDocument?: () => void
  onEditKB?: () => void
  onDeleteKB?: () => void
}

export function KnowledgeHeader({
  selectedKB,
  documentCount,
  knowledgeBaseCount,
  onAddDocument,
  onEditKB,
  onDeleteKB,
}: KnowledgeHeaderProps) {
  const title = selectedKB ? selectedKB.name : "Files"
  const subtitle = selectedKB
    ? `${documentCount} document${documentCount !== 1 ? "s" : ""} in this knowledge base`
    : "Manage your files and knowledge bases"

  return (
    <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="flex items-center gap-3">
          {selectedKB && (
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: selectedKB.color ?? "var(--chart-3)" }}
              aria-hidden
            >
              <Folder className="h-5 w-5 text-white" />
            </div>
          )}
          <BlurText
            text={title}
            className="text-3xl font-bold tracking-tight"
            delay={40}
          />
        </motion.div>
        <motion.p
          className="text-sm text-muted-foreground"
          variants={fadeUp}
        >
          {subtitle}
        </motion.p>
        <motion.div
          className="flex items-center gap-4 text-sm text-muted-foreground"
          variants={fadeUp}
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <CountUp to={documentCount} duration={1.2} />
            <span>documents</span>
          </span>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            <CountUp to={knowledgeBaseCount} duration={1.2} />
            <span>knowledge bases</span>
          </span>
        </motion.div>
      </motion.div>

      <div className="flex items-center gap-2 shrink-0 pt-1">
        {selectedKB && (onEditKB || onDeleteKB) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Knowledge base options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEditKB && (
                <DropdownMenuItem onClick={onEditKB}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Knowledge Base
                </DropdownMenuItem>
              )}
              {onDeleteKB && (
                <DropdownMenuItem
                  onClick={onDeleteKB}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Knowledge Base
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {onAddDocument && (
          <Button onClick={onAddDocument} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Document
          </Button>
        )}
      </div>
    </div>
  )
}
