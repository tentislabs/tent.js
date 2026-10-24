import { createInterface } from 'node:readline'
import { TentError } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { localTools } from '../../localTools.ts'
import { dataFolderOf, engineAt } from '../../reach.ts'

// What `tent mcp` says when it starts beside an engine on live data: what its tools do there is done to that data.
const onLive =
  'An engine runs on live data beside this project: tent_run acts there, as the caller its `as` names, and as the system where none is named.'

/** The answer to a line that is no JSON, as the message format of the standard writes one. */
const unread = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The line is no JSON.' } }

/**
 * `tent mcp`: a server of MCP on this computer, in the standard's form for a program that its client starts. It
 * reads one message from each line of its input and writes each answer as a line of its output, through
 * `message` of the layer, and needs no sign-in. It offers the commands of the project as tools, and ends with 0
 * when its input ends.
 */
export const command: Command = {
  name: 'mcp',
  args: {},
  needs: 'project',
  raw: true,
  async run({ words, folder }) {
    const at = words.indexOf('--data')
    const data = at >= 0 ? words[at + 1] : undefined
    const running = await engineAt(dataFolderOf({ folder, data })).catch(() => undefined)
    if (running?.mode === 'live') process.stderr.write(`${onLive}\n`)
    // The output holds the standard's messages alone: what a command would print goes to the error output.
    console.log = (...given: unknown[]) => void process.stderr.write(`${given.map(String).join(' ')}\n`)
    const [{ mcpServer }, { describeProject }] = await Promise.all([
      import('../../../connect/index.ts'),
      import('../../../build/index.ts'),
    ])
    const { description } = await describeProject(folder)
    // The layer is handed no function of the app: the commands of the project are its tools.
    const server = mcpServer({
      description: () => description,
      call: () => Promise.reject(new TentError('T0001', 'tent mcp offers no function of the app as a tool.')),
      wire: (error) => ({
        status: 500,
        error: { code: 'T0009', name: 'internal', message: error instanceof Error ? error.message : String(error) },
      }),
      limit: () => 0,
    })
    const tools = await localTools(folder)
    const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
    // The answers leave in the order the messages came, one after the other.
    let last: Promise<void> = Promise.resolve()
    for await (const line of lines) {
      if (line.trim() === '') continue
      last = last.then(async () => {
        let sent: unknown
        try {
          sent = JSON.parse(line)
        } catch {
          process.stdout.write(`${JSON.stringify(unread)}\n`)
          return
        }
        const answer = await server.message(Object(sent), tools)
        if (answer !== undefined) process.stdout.write(`${JSON.stringify(answer)}\n`)
      })
    }
    await last
    return 0
  },
}
