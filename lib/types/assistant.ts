export interface MemoryConfig {
  enabled: boolean
  workingMemory: boolean
  semanticRecall: boolean
  longTermProfile: boolean
  memoryInstructions?: string
}

export interface ModelConfig {
  temperature?: number        // 0-2
  topP?: number              // 0-1
  maxTokens?: number         // model-dependent
  presencePenalty?: number   // -2 to 2
  frequencyPenalty?: number  // -2 to 2
  reasoningEffort?: "low" | "medium" | "high"
  responseFormat?: "default" | "json" | "markdown" | "concise" | "detailed"
}

export interface ChatConfig {
  autoCreateTopic?: boolean
  messageThreshold?: number   // auto-create topic after N messages
  limitHistory?: boolean
  historyCount?: number       // number of messages to carry
  autoSummary?: boolean
  autoScroll?: boolean
}

export interface GuardRailsConfig {
  blockedTopics?: string[]
  safetyInstructions?: string
  maxResponseLength?: number
  requireCitations?: boolean
}

export interface Assistant {
  id: string
  name: string
  description: string
  emoji: string
  systemPrompt: string
  model?: string
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds?: string[]
  liveChatEnabled?: boolean
  avatarS3Key?: string
  modelConfig?: ModelConfig
  openingMessage?: string
  openingQuestions?: string[]
  chatConfig?: ChatConfig
  guardRails?: GuardRailsConfig
  memoryConfig?: MemoryConfig
  isDefault?: boolean
  isEditable?: boolean
  toolCount?: number
  skillCount?: number
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
  avatarS3Key?: string
  modelConfig?: ModelConfig
  openingMessage?: string
  openingQuestions?: string[]
  chatConfig?: ChatConfig
  guardRails?: GuardRailsConfig
  memoryConfig?: MemoryConfig
}
