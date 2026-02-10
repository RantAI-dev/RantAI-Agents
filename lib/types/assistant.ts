export interface MemoryConfig {
  enabled: boolean
  workingMemory: boolean
  semanticRecall: boolean
  longTermProfile: boolean
  memoryInstructions?: string
}

export interface Assistant {
  id: string
  name: string
  description: string
  emoji: string
  systemPrompt: string
  model?: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds?: string[]  // Filter RAG to specific groups
  liveChatEnabled?: boolean
  memoryConfig?: MemoryConfig
  isDefault?: boolean
  isEditable?: boolean
  toolCount?: number
  createdAt: Date
}

export interface AssistantInput {
  name: string
  description: string
  emoji: string
  systemPrompt: string
  model?: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds?: string[]
  liveChatEnabled?: boolean
  memoryConfig?: MemoryConfig
}
