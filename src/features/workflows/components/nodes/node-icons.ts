import {
  Bot,
  Code,
  Plug,
  Globe,
  Database,
  Search,
  Braces,
  Wrench,
  // Workflow-specific icons (each visually distinct)
  WfTriggerManual,
  WfTriggerWebhook,
  WfTriggerSchedule,
  WfTriggerEvent,
  WfLlm,
  WfCondition,
  WfSwitch,
  WfLoop,
  WfParallel,
  WfMerge,
  WfErrorHandler,
  WfHumanInput,
  WfApproval,
  WfHandoff,
  WfTransform,
  WfFilter,
  WfAggregate,
  WfStorage,
  WfStreamOutput,
  Workflow,
  type IconComponent,
} from "@/lib/icons"
import { NodeType } from "@/lib/workflow/types"

export const NODE_ICON_MAP: Record<string, IconComponent> = {
  // Triggers — each has a unique icon
  [NodeType.TRIGGER_MANUAL]: WfTriggerManual,       // Play button
  [NodeType.TRIGGER_WEBHOOK]: WfTriggerWebhook,     // Link/hook
  [NodeType.TRIGGER_SCHEDULE]: WfTriggerSchedule,    // Alarm clock
  [NodeType.TRIGGER_EVENT]: WfTriggerEvent,          // Broadcast tower

  // AI
  [NodeType.AGENT]: Bot,                             // Robot/bricks
  [NodeType.LLM]: WfLlm,                            // Light bulb

  // Tools — already distinct
  [NodeType.TOOL]: Wrench,                           // Hammer/wrench
  [NodeType.MCP_TOOL]: Plug,                         // Plug
  [NodeType.CODE]: Code,                             // Code brackets
  [NodeType.HTTP]: Globe,                            // Globe

  // Flow Control — each has a unique icon
  [NodeType.CONDITION]: WfCondition,                 // Hierarchy/tree
  [NodeType.SWITCH]: WfSwitch,                       // Bidirectional arrows
  [NodeType.LOOP]: WfLoop,                           // Circular refresh
  [NodeType.PARALLEL]: WfParallel,                   // Parallel nodes
  [NodeType.MERGE]: WfMerge,                         // Merging nodes
  [NodeType.ERROR_HANDLER]: WfErrorHandler,          // Bug
  [NodeType.SUB_WORKFLOW]: Workflow,                  // Route/workflow

  // Human — each has a unique icon
  [NodeType.HUMAN_INPUT]: WfHumanInput,              // Hand with mic
  [NodeType.APPROVAL]: WfApproval,                   // Stamp
  [NodeType.HANDOFF]: WfHandoff,                     // Handshake

  // Data
  [NodeType.TRANSFORM]: WfTransform,                 // Shuffle
  [NodeType.FILTER]: WfFilter,                       // Funnel
  [NodeType.AGGREGATE]: WfAggregate,                 // Stacked layers
  [NodeType.OUTPUT_PARSER]: Braces,                  // Code braces

  // Integration
  [NodeType.RAG_SEARCH]: Search,                     // Magnifying glass
  [NodeType.DATABASE]: Database,                     // Database
  [NodeType.STORAGE]: WfStorage,                     // HDD

  // Output
  [NodeType.STREAM_OUTPUT]: WfStreamOutput,          // Stream direction
}
