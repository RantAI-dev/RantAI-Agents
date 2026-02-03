export interface Assistant {
  id: string
  name: string
  description: string
  emoji: string
  systemPrompt: string
  model?: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds?: string[]  // Filter RAG to specific groups
  isDefault?: boolean
  isEditable?: boolean
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
}
