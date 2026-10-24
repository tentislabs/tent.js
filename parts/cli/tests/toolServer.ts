import { createServer } from 'node:http'
import type { TestContext } from 'node:test'

/** A tool of a stand-in server, as it lists it. */
export interface ListedTool {
  name: string
  description: string
  inputSchema: object
}

/** A stand-in for an outside MCP server that lists its tools: its address, its tools, and what it was asked. */
export interface ToolServer {
  origin: string
  tools: ListedTool[]
  asked: { method: string; headers: Record<string, string> }[]
}

/**
 * Starts a stand-in for an outside MCP server on this computer, in the newest form of the standard, which lists the
 * tools it holds now. It is closed when the test ends.
 */
export async function toolServer(t: TestContext, tools: ListedTool[]): Promise<ToolServer> {
  const held: ToolServer = { origin: '', tools, asked: [] }
  const server = createServer((request, response) => {
    const pieces: Buffer[] = []
    request.on('data', (piece: Buffer) => pieces.push(piece))
    request.on('end', () => {
      const message: Record<string, unknown> = Object(JSON.parse(Buffer.concat(pieces).toString('utf8') || '{}'))
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(request.headers)) headers[name] = String(value)
      held.asked.push({ method: String(message.method), headers })
      const result =
        message.method === 'tools/list'
          ? { tools: held.tools }
          : {
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: {} },
              serverInfo: { name: 'stand', version: '1' },
            }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
  )
  const at = server.address()
  held.origin = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}`
  return held
}
