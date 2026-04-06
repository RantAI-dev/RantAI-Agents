import { handleMcpOptionsRequest, handleMcpRequest } from "@/features/platform-routes/mcp/service"

export async function POST(req: Request) {
  return handleMcpRequest(req)
}

export async function GET(req: Request) {
  return handleMcpRequest(req)
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req)
}

export async function OPTIONS() {
  return handleMcpOptionsRequest()
}
