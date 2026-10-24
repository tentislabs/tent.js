import type { LocalTool } from '../connect/index.ts'
import type { Finding } from '../core/index.ts'
import { object, TentError } from '../core/index.ts'
import { checkValue } from '../core/internal.ts'
import type { Command } from './command.ts'
import { list } from './commands/list.ts'

/** The commands that `tent mcp` offers, each by the name of its tool, with what its tool is told it is for. */
const offered: { tool: string; command: string; about: string }[] = [
  { tool: 'tent_map', command: 'map', about: 'The whole app as a short outline: tables, functions and flows.' },
  { tool: 'tent_docs', command: 'docs', about: 'A page of the docs of Tent.js, or the list of the pages.' },
  { tool: 'tent_check', command: 'check', about: 'Checks the project, and answers every finding with its fix.' },
  {
    tool: 'tent_run',
    command: 'run',
    about: 'Calls a function of the app as the user that `as` names, as `nobody`, or as the system where none is.',
  },
  { tool: 'tent_rows', command: 'data/rows', about: 'Every row of a table of the app, with full access.' },
  { tool: 'tent_logs', command: 'logs', about: 'The newest calls, errors and slow queries of the log of the app.' },
  { tool: 'tent_shot', command: 'shot', about: 'A picture of a screen of the app that runs, taken by a browser.' },
  { tool: 'tent_history', command: 'history/history', about: 'The points of the history of the project.' },
]

/** What a command prints with `--json`: whether it holds no error, its value and its findings. */
const printed = (made: { value?: unknown; findings?: Finding[] }): object => {
  const findings = made.findings ?? []
  return { ok: !findings.some((one) => one.level === 'error'), value: made.value ?? null, findings }
}

/** The tool of one command: its options as its input, held to their types, and what it prints with `--json`. */
function toolOf(tool: string, about: string, command: Command, folder: string): LocalTool | undefined {
  if (command.raw) return undefined
  return {
    name: tool,
    title: `tent ${command.name}`,
    about,
    input: command.args,
    reads: tool !== 'tent_run',
    async run(input) {
      const args: Record<string, unknown> = Object(input)
      const misses = checkValue(object(command.args), args)
      if (misses.length)
        throw new TentError('T0002', `The input of ${tool} does not fit: ${misses[0].message}`, {
          fields: Object.fromEntries(misses.flatMap((one) => Object.entries(one.fields ?? {}))),
        })
      return printed(await command.run({ args, folder }))
    },
  }
}

/** Takes the folder of a project. Answers the eight tools of `tent mcp`, each a command of the project. */
export async function localTools(folder: string): Promise<LocalTool[]> {
  const tools: LocalTool[] = []
  for (const one of offered) {
    const listed = list.find((entry) => entry.name === one.command)
    if (!listed) continue
    const { command } = await listed.load()
    const tool = toolOf(one.tool, one.about, command, folder)
    if (tool) tools.push(tool)
  }
  return tools
}
