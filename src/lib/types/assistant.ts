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
  /**
   * Canvas mode this agent enables by default in the composer:
   * "auto" | an artifact type id (e.g. "application/mermaid"). Lets seeded
   * canvas agents produce their artifact on the first message.
   */
  defaultCanvasMode?: string
  /**
   * Design system this agent steers generated visual artifacts toward
   * (an id from the design-system registry, e.g. "rantai"). Falls back to the
   * house style when unset. Reserved for a future per-agent / "Design" picker.
   */
  designSystemId?: string
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
  tags?: string[]
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
  tags?: string[]
}
