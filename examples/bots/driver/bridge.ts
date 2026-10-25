// A small MCP server on this computer, open for one turn, through which Claude Code reaches the app's own tools.
// Each call is made by the driver in the call context of the run, so every tool keeps its rule.
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

export interface BridgeTool {
  name: string
  about: string
  schema: object
  call: (input: unknown) => Promise<unknown>
}

export interface Bridge {
  url: string
  token: string
  close: () => Promise<void>
}

export const openBridge = (tools: BridgeTool[]): Promise<Bridge> =>
  new Promise((ready) => {
    const token = randomBytes(24).toString('base64url')
    const server = createServer(async (request, response) => {
      const send = (status: number, body?: object) => {
        response.writeHead(status, body ? { 'content-type': 'application/json' } : {})
        response.end(body ? JSON.stringify(body) : undefined)
      }
      if (request.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' })
      if (request.method !== 'POST') return send(405)
      let body = ''
      for await (const part of request) body += part
      let message: {
        id?: unknown
        method?: string
        params?: { name?: string; arguments?: unknown; protocolVersion?: string }
      }
      try {
        message = JSON.parse(body)
      } catch {
        return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'No JSON.' } })
      }
      if (message.id === undefined) return send(202)
      const answer = (result: object) => send(200, { jsonrpc: '2.0', id: message.id, result })
      if (message.method === 'initialize')
        return answer({
          protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'bots', version: '1.0.0' },
        })
      if (message.method === 'ping') return answer({})
      if (message.method === 'tools/list')
        return answer({
          tools: tools.map((one) => ({ name: one.name, description: one.about, inputSchema: one.schema })),
        })
      if (message.method === 'tools/call') {
        const tool = tools.find((one) => one.name === message.params?.name)
        if (!tool) return answer({ isError: true, content: [{ type: 'text', text: 'There is no such tool.' }] })
        try {
          const value = await tool.call(message.params?.arguments ?? {})
          return answer({ content: [{ type: 'text', text: JSON.stringify(value ?? null) }] })
        } catch (error) {
          const code = Object(error).code
          const words = error instanceof Error ? error.message : String(error)
          return answer({ isError: true, content: [{ type: 'text', text: `Error ${code ?? ''}: ${words}`.trim() }] })
        }
      }
      return send(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not known.' } })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address && typeof address === 'object' ? address.port : 0
      ready({
        url: `http://127.0.0.1:${port}/mcp`,
        token,
        close: () => new Promise((closed) => server.close(() => closed())),
      })
    })
  })
