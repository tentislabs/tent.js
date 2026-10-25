// Stand-in MCP servers of a mail box and a calendar, for `tent mcp approve` and for trying the app by hand.
// Start them with `node fakes/tools.ts`: the mail on port 7811, the calendar on 7812, each at /mcp.
import { createServer } from 'node:http'

type Tool = { name: string; description: string; inputSchema: object; run: (input: Record<string, unknown>) => unknown }

export const mailTools: Tool[] = [
  {
    name: 'searchMail',
    description: 'Finds the mails whose words hold the search, the newest first',
    inputSchema: {
      type: 'object',
      properties: { words: { type: 'string' }, limit: { type: 'number' } },
      required: ['words'],
    },
    run: ({ words }) => ({
      mails: [
        {
          id: 'm1',
          from: 'ada@example.com',
          subject: 'A call this week?',
          text: `Can we talk about ${String(words)}?`,
        },
        { id: 'm2', from: 'news@example.com', subject: 'The weekly news', text: 'Three things happened.' },
      ],
    }),
  },
  {
    name: 'readMail',
    description: 'Reads one mail whole, by its id',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: ({ id }) => ({ id, from: 'ada@example.com', subject: 'A call this week?', text: 'Can we talk on Thursday?' }),
  },
]

export const calendarTools: Tool[] = [
  {
    name: 'findTimes',
    description: 'Finds free times for a call with the people named, on one day',
    inputSchema: {
      type: 'object',
      properties: { with: { type: 'array', items: { type: 'string' } }, day: { type: 'string' } },
      required: ['with', 'day'],
    },
    run: ({ day }) => ({ times: [`${String(day)}T10:00:00Z`, `${String(day)}T15:30:00Z`] }),
  },
  {
    name: 'createEvent',
    description: 'Puts a call into the calendar and sends its invitation to the people named',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        with: { type: 'array', items: { type: 'string' } },
        at: { type: 'string' },
        minutes: { type: 'number' },
      },
      required: ['title', 'with', 'at', 'minutes'],
    },
    run: ({ title }) => ({ id: `e-${Date.now()}`, title, sent: true }),
  },
]

const serve = (port: number, name: string, tools: Tool[]) =>
  createServer(async (request, response) => {
    let body = ''
    for await (const part of request) body += part
    const message = body ? JSON.parse(body) : {}
    const answer = (result: unknown) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    }
    if (message.id === undefined) {
      response.writeHead(202)
      response.end()
      return
    }
    if (message.method === 'initialize')
      return answer({
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name, version: '1.0.0' },
      })
    if (message.method === 'tools/list')
      return answer({
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })
    if (message.method === 'tools/call') {
      const tool = tools.find((one) => one.name === message.params?.name)
      if (!tool) return answer({ isError: true, content: [{ type: 'text', text: 'No such tool.' }] })
      const value = tool.run(message.params?.arguments ?? {})
      return answer({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not known.' } }))
  }).listen(port, '127.0.0.1')

if (import.meta.main) {
  serve(7811, 'mail', mailTools)
  serve(7812, 'calendar', calendarTools)
}
