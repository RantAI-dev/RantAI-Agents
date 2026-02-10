"use client"

import { useMemo } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import {
  NodeType,
  getNodeCategory,
  NODE_CATEGORIES,
  type WorkflowNodeData,
  type AgentNodeData,
  type LlmNodeData,
  type ToolNodeData,
  type CodeNodeData,
  type HttpNodeData,
  type ConditionNodeData,
  type LoopNodeData,
  type HumanInputNodeData,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
  type RagSearchNodeData,
  type TriggerNodeData,
  type MergeNodeData,
} from "@/lib/workflow/types"

export function PropertiesPanel() {
  const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId)
  const nodes = useWorkflowEditor((s) => s.nodes)
  const updateNodeData = useWorkflowEditor((s) => s.updateNodeData)
  const selectNode = useWorkflowEditor((s) => s.selectNode)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  )

  if (!selectedNode || !selectedNodeId) {
    return (
      <div className="w-[280px] shrink-0 border-l bg-background flex items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Select a node to edit its properties
        </p>
      </div>
    )
  }

  const data = selectedNode.data as WorkflowNodeData
  const category = getNodeCategory(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[category]

  const update = (partial: Partial<WorkflowNodeData>) => {
    updateNodeData(selectedNodeId, partial)
  }

  return (
    <div className="w-[280px] shrink-0 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: categoryMeta.headerColor }}
        />
        <span className="text-xs font-semibold flex-1 truncate">{data.label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => selectNode(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Common: Label */}
        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={data.label}
            onChange={(e) => update({ label: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        {/* Common: Description */}
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={data.description || ""}
            onChange={(e) => update({ description: e.target.value })}
            className="h-7 text-xs"
            placeholder="Optional description"
          />
        </div>

        {/* Node-specific fields */}
        <NodeSpecificFields data={data} update={update} />
      </div>
    </div>
  )
}

function NodeSpecificFields({
  data,
  update,
}: {
  data: WorkflowNodeData
  update: (partial: Partial<WorkflowNodeData>) => void
}) {
  switch (data.nodeType) {
    case NodeType.TRIGGER_MANUAL:
    case NodeType.TRIGGER_WEBHOOK:
    case NodeType.TRIGGER_SCHEDULE:
    case NodeType.TRIGGER_EVENT: {
      const td = data as TriggerNodeData
      return (
        <>
          {td.nodeType === NodeType.TRIGGER_SCHEDULE && (
            <div className="space-y-1">
              <Label className="text-xs">Cron Schedule</Label>
              <Input
                value={td.config?.schedule || ""}
                onChange={(e) =>
                  update({ config: { ...td.config, schedule: e.target.value } } as Partial<TriggerNodeData>)
                }
                className="h-7 text-xs"
                placeholder="0 * * * *"
              />
            </div>
          )}
          {td.nodeType === NodeType.TRIGGER_WEBHOOK && (
            <div className="space-y-1">
              <Label className="text-xs">Webhook Path</Label>
              <Input
                value={td.config?.webhookPath || ""}
                onChange={(e) =>
                  update({ config: { ...td.config, webhookPath: e.target.value } } as Partial<TriggerNodeData>)
                }
                className="h-7 text-xs"
                placeholder="/webhook/my-workflow"
              />
            </div>
          )}
          {td.nodeType === NodeType.TRIGGER_EVENT && (
            <div className="space-y-1">
              <Label className="text-xs">Event Name</Label>
              <Input
                value={td.config?.eventName || ""}
                onChange={(e) =>
                  update({ config: { ...td.config, eventName: e.target.value } } as Partial<TriggerNodeData>)
                }
                className="h-7 text-xs"
                placeholder="user.created"
              />
            </div>
          )}
        </>
      )
    }

    case NodeType.AGENT: {
      const ad = data as AgentNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Assistant ID</Label>
            <Input
              value={ad.assistantId}
              onChange={(e) => update({ assistantId: e.target.value } as Partial<AgentNodeData>)}
              className="h-7 text-xs"
              placeholder="Paste assistant ID"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Steps</Label>
            <Input
              type="number"
              value={ad.maxSteps || 5}
              onChange={(e) =>
                update({ maxSteps: parseInt(e.target.value) || 5 } as Partial<AgentNodeData>)
              }
              className="h-7 text-xs"
              min={1}
              max={20}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prompt Template</Label>
            <Textarea
              value={ad.promptTemplate || ""}
              onChange={(e) =>
                update({ promptTemplate: e.target.value } as Partial<AgentNodeData>)
              }
              className="text-xs min-h-[60px]"
              placeholder="Optional override prompt"
            />
          </div>
        </>
      )
    }

    case NodeType.LLM:
    case NodeType.PROMPT: {
      const ld = data as LlmNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Model</Label>
            <Input
              value={ld.model}
              onChange={(e) => update({ model: e.target.value } as Partial<LlmNodeData>)}
              className="h-7 text-xs"
              placeholder="openai/gpt-4o"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">System Prompt</Label>
            <Textarea
              value={ld.systemPrompt || ""}
              onChange={(e) =>
                update({ systemPrompt: e.target.value } as Partial<LlmNodeData>)
              }
              className="text-xs min-h-[80px]"
              placeholder="You are a helpful assistant..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Temperature: {ld.temperature?.toFixed(1) ?? "0.7"}
            </Label>
            <Slider
              value={[ld.temperature ?? 0.7]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={([v]) =>
                update({ temperature: v } as Partial<LlmNodeData>)
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Tokens</Label>
            <Input
              type="number"
              value={ld.maxTokens || ""}
              onChange={(e) =>
                update({
                  maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
                } as Partial<LlmNodeData>)
              }
              className="h-7 text-xs"
              placeholder="Auto"
            />
          </div>
        </>
      )
    }

    case NodeType.TOOL:
    case NodeType.MCP_TOOL: {
      const td = data as ToolNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Tool ID</Label>
            <Input
              value={td.toolId}
              onChange={(e) => update({ toolId: e.target.value } as Partial<ToolNodeData>)}
              className="h-7 text-xs"
              placeholder="tool_id"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tool Name</Label>
            <Input
              value={td.toolName}
              onChange={(e) =>
                update({ toolName: e.target.value } as Partial<ToolNodeData>)
              }
              className="h-7 text-xs"
            />
          </div>
        </>
      )
    }

    case NodeType.CODE: {
      const cd = data as CodeNodeData
      return (
        <div className="space-y-1">
          <Label className="text-xs">Code (JavaScript)</Label>
          <Textarea
            value={cd.code}
            onChange={(e) => update({ code: e.target.value } as Partial<CodeNodeData>)}
            className="text-xs min-h-[120px] font-mono"
            placeholder="// input is available\nreturn { data: input };"
          />
        </div>
      )
    }

    case NodeType.HTTP: {
      const hd = data as HttpNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Method</Label>
            <Select
              value={hd.method}
              onValueChange={(v) =>
                update({ method: v } as Partial<HttpNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input
              value={hd.url}
              onChange={(e) => update({ url: e.target.value } as Partial<HttpNodeData>)}
              className="h-7 text-xs"
              placeholder="https://api.example.com/..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={hd.body || ""}
              onChange={(e) => update({ body: e.target.value } as Partial<HttpNodeData>)}
              className="text-xs min-h-[60px] font-mono"
              placeholder="{}"
            />
          </div>
        </>
      )
    }

    case NodeType.CONDITION: {
      const cd = data as ConditionNodeData
      return (
        <div className="space-y-2">
          <Label className="text-xs">Branches</Label>
          {cd.conditions.map((c, i) => (
            <div key={c.id} className="space-y-1 p-2 bg-muted/50 rounded">
              <Input
                value={c.label}
                onChange={(e) => {
                  const newConditions = [...cd.conditions]
                  newConditions[i] = { ...c, label: e.target.value }
                  update({ conditions: newConditions } as Partial<ConditionNodeData>)
                }}
                className="h-7 text-xs"
                placeholder="Branch label"
              />
              <Input
                value={c.expression}
                onChange={(e) => {
                  const newConditions = [...cd.conditions]
                  newConditions[i] = { ...c, expression: e.target.value }
                  update({ conditions: newConditions } as Partial<ConditionNodeData>)
                }}
                className="h-7 text-xs font-mono"
                placeholder="Expression"
              />
            </div>
          ))}
        </div>
      )
    }

    case NodeType.LOOP: {
      const ld = data as LoopNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Loop Type</Label>
            <Select
              value={ld.loopType}
              onValueChange={(v) =>
                update({ loopType: v } as Partial<LoopNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="foreach" className="text-xs">For Each</SelectItem>
                <SelectItem value="dowhile" className="text-xs">Do While</SelectItem>
                <SelectItem value="dountil" className="text-xs">Do Until</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ld.loopType !== "foreach" && (
            <div className="space-y-1">
              <Label className="text-xs">Condition</Label>
              <Input
                value={ld.condition || ""}
                onChange={(e) =>
                  update({ condition: e.target.value } as Partial<LoopNodeData>)
                }
                className="h-7 text-xs font-mono"
                placeholder="Expression"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Concurrency</Label>
            <Input
              type="number"
              value={ld.concurrency || 1}
              onChange={(e) =>
                update({ concurrency: parseInt(e.target.value) || 1 } as Partial<LoopNodeData>)
              }
              className="h-7 text-xs"
              min={1}
            />
          </div>
        </>
      )
    }

    case NodeType.MERGE: {
      const md = data as MergeNodeData
      return (
        <div className="space-y-1">
          <Label className="text-xs">Merge Strategy</Label>
          <Select
            value={md.mergeStrategy}
            onValueChange={(v) =>
              update({ mergeStrategy: v } as Partial<MergeNodeData>)
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Wait for All</SelectItem>
              <SelectItem value="any" className="text-xs">Wait for Any</SelectItem>
              <SelectItem value="first" className="text-xs">First Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )
    }

    case NodeType.HUMAN_INPUT:
    case NodeType.APPROVAL:
    case NodeType.HANDOFF: {
      const hd = data as HumanInputNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Prompt</Label>
            <Textarea
              value={hd.prompt}
              onChange={(e) =>
                update({ prompt: e.target.value } as Partial<HumanInputNodeData>)
              }
              className="text-xs min-h-[60px]"
              placeholder="What should the human do?"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assign To</Label>
            <Input
              value={hd.assignTo || ""}
              onChange={(e) =>
                update({ assignTo: e.target.value } as Partial<HumanInputNodeData>)
              }
              className="h-7 text-xs"
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Timeout (seconds)</Label>
            <Input
              type="number"
              value={hd.timeout || ""}
              onChange={(e) =>
                update({
                  timeout: e.target.value ? parseInt(e.target.value) : undefined,
                } as Partial<HumanInputNodeData>)
              }
              className="h-7 text-xs"
              placeholder="No timeout"
            />
          </div>
        </>
      )
    }

    case NodeType.TRANSFORM: {
      const td = data as TransformNodeData
      return (
        <div className="space-y-1">
          <Label className="text-xs">Expression</Label>
          <Textarea
            value={td.expression}
            onChange={(e) =>
              update({ expression: e.target.value } as Partial<TransformNodeData>)
            }
            className="text-xs min-h-[80px] font-mono"
            placeholder="return input;"
          />
        </div>
      )
    }

    case NodeType.FILTER: {
      const fd = data as FilterNodeData
      return (
        <div className="space-y-1">
          <Label className="text-xs">Filter Condition</Label>
          <Textarea
            value={fd.condition}
            onChange={(e) =>
              update({ condition: e.target.value } as Partial<FilterNodeData>)
            }
            className="text-xs min-h-[60px] font-mono"
            placeholder="return true;"
          />
        </div>
      )
    }

    case NodeType.AGGREGATE: {
      const ad = data as AggregateNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select
              value={ad.operation}
              onValueChange={(v) =>
                update({ operation: v } as Partial<AggregateNodeData>)
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concat" className="text-xs">Concat</SelectItem>
                <SelectItem value="sum" className="text-xs">Sum</SelectItem>
                <SelectItem value="count" className="text-xs">Count</SelectItem>
                <SelectItem value="merge" className="text-xs">Merge</SelectItem>
                <SelectItem value="custom" className="text-xs">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ad.operation === "custom" && (
            <div className="space-y-1">
              <Label className="text-xs">Expression</Label>
              <Textarea
                value={ad.expression || ""}
                onChange={(e) =>
                  update({ expression: e.target.value } as Partial<AggregateNodeData>)
                }
                className="text-xs min-h-[60px] font-mono"
              />
            </div>
          )}
        </>
      )
    }

    case NodeType.RAG_SEARCH: {
      const rd = data as RagSearchNodeData
      return (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Top K Results</Label>
            <Input
              type="number"
              value={rd.topK || 5}
              onChange={(e) =>
                update({ topK: parseInt(e.target.value) || 5 } as Partial<RagSearchNodeData>)
              }
              className="h-7 text-xs"
              min={1}
              max={50}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Query Template</Label>
            <Textarea
              value={rd.queryTemplate || ""}
              onChange={(e) =>
                update({ queryTemplate: e.target.value } as Partial<RagSearchNodeData>)
              }
              className="text-xs min-h-[60px]"
              placeholder="{{input.query}}"
            />
          </div>
        </>
      )
    }

    default:
      return (
        <p className="text-xs text-muted-foreground italic">
          No additional configuration for this node type.
        </p>
      )
  }
}
