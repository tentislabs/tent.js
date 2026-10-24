// A stand-in for an outside MCP server that is a program: it reads one message from each line of its input and
// writes each answer as a line of its output. Each start adds a line to the file its first word names. The tool
// `quit` ends the program, as a program that falls over does.
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [marks] = process.argv.slice(2)
if (marks) appendFileSync(marks, `started ${process.pid}\n`)

const tools = [
  {
    name: 'echo',
    description: 'Answers what it is handed',
    inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
  },
  { name: 'quit', description: 'Ends the program', inputSchema: { type: 'object', properties: {} } },
]

const write = (message: object): void => void process.stdout.write(`${JSON.stringify(message)}\n`)

for await (const line of createInterface({ input: process.stdin })) {
  let message: Record<string, unknown>
  try {
    message = Object(JSON.parse(line))
  } catch {
    continue
  }
  if (message.id === undefined) continue
  const params: Record<string, unknown> = Object(message.params)
  const reply = (result: object): void => write({ jsonrpc: '2.0', id: message.id, result })
  if (message.method === 'server/discover')
    reply({
      supportedVersions: ['2026-07-28'],
      capabilities: { tools: {} },
      serverInfo: { name: 'program', version: '1' },
    })
  else if (message.method === 'tools/list') reply({ tools })
  else if (message.method === 'tools/call' && params.name === 'quit') process.exit(1)
  else if (message.method === 'tools/call')
    reply({ content: [{ type: 'text', text: `echo: ${String(Object(params.arguments).words)} from ${process.pid}` }] })
  else write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
}
