"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check } from "@/lib/icons"
import { useAgentApiKeys } from "@/hooks/use-agent-api-keys"

interface DeployWebSocketSectionProps {
  agentId: string
}

export function DeployWebSocketSection({ agentId }: DeployWebSocketSectionProps) {
  const { keys } = useAgentApiKeys(agentId)
  const [copiedExample, setCopiedExample] = useState<string | null>(null)

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"
  const exampleKey = keys[0]?.key || "rantai_sk_your_api_key_here"

  const copyExample = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedExample(id)
    setTimeout(() => setCopiedExample(null), 2000)
  }

  const jsExample = `import { io } from "socket.io-client";

const socket = io("${baseUrl}", {
  path: "/api/socket",
  auth: { apiKey: "${exampleKey}" },
});

socket.on("connect", () => {
  console.log("Connected!");

  // Send a message
  socket.emit("api:chat", {
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  });
});

// Receive streamed chunks
socket.on("api:chunk", (data) => {
  const content = data.choices?.[0]?.delta?.content;
  if (content) process.stdout.write(content);
});

// Stream complete
socket.on("api:done", () => {
  console.log("\\nDone!");
});

socket.on("api:error", (err) => {
  console.error("Error:", err);
});`

  const pythonExample = `import socketio

sio = socketio.Client()

sio.connect(
    "${baseUrl}",
    socketio_path="/api/socket",
    auth={"apiKey": "${exampleKey}"},
)

@sio.on("api:chunk")
def on_chunk(data):
    content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
    print(content, end="", flush=True)

@sio.on("api:done")
def on_done():
    print("\\nDone!")

@sio.on("api:error")
def on_error(data):
    print(f"Error: {data}")

# Send a message
sio.emit("api:chat", {
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": True,
})

sio.wait()`

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Connect via WebSocket for real-time streaming. Uses the same API keys as the REST API.
        {keys.length === 0 && " Create an API key in the REST API tab first."}
      </p>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Connection Examples</h4>
        <Tabs defaultValue="javascript">
          <TabsList className="h-8">
            <TabsTrigger value="javascript" className="text-xs px-3 h-7">JavaScript</TabsTrigger>
            <TabsTrigger value="python" className="text-xs px-3 h-7">Python</TabsTrigger>
          </TabsList>
          {[
            { id: "javascript", code: jsExample },
            { id: "python", code: pythonExample },
          ].map(({ id, code }) => (
            <TabsContent key={id} value={id}>
              <div className="relative">
                <pre className="rounded-lg border bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {code}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => copyExample(id, code)}
                >
                  {copiedExample === id ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Events reference */}
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">Events Reference</p>
        <p><strong>Emit:</strong> <code>api:chat</code> — Send <code>{`{ messages, stream }`}</code></p>
        <p><strong>Listen:</strong> <code>api:chunk</code> — Streamed token (OpenAI delta format)</p>
        <p><strong>Listen:</strong> <code>api:done</code> — Stream complete</p>
        <p><strong>Listen:</strong> <code>api:response</code> — Full response (non-streaming)</p>
        <p><strong>Listen:</strong> <code>api:error</code> — Error object</p>
      </div>
    </div>
  )
}
