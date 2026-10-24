import type { CommandList, ListedCommand } from '../../connect/index.ts'
import type { Description } from '../../core/internal.ts'
import { appCommand, isStored, startTypes } from '../../core/internal.ts'

/** A name as a command writes it: a hyphen and a small letter where the name has a capital. */
const wordOf = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/** The word of a definition: what `cli.names` of the project gives it, or its own name turned. */
function commandWord(description: Description, name: string): string {
  const names: unknown = Reflect.get(Object(description.project.cli), 'names')
  const given: unknown = isStored(names) && Object.hasOwn(names, name) ? names[name] : undefined
  return typeof given === 'string' ? given : wordOf(name)
}

/** The functions and flows that state `offer: ['cli']`, and the commands written in code. */
function entriesOf(description: Description): [string, ListedCommand][] {
  const found: [string, ListedCommand][] = []
  const offered = (record: Record<string, unknown>): boolean =>
    Array.isArray(record.offer) && record.offer.includes('cli')
  const common = (name: string, record: Record<string, unknown>) => ({
    definition: name,
    ...(typeof record.about === 'string' ? { about: record.about } : {}),
    input: isStored(record.input) ? record.input : {},
    ...(record.danger === 'ask' ? { danger: 'ask' as const } : {}),
    ...(typeof record.deprecated === 'string' ? { deprecated: record.deprecated } : {}),
  })
  for (const [name, record] of Object.entries(description.functions))
    if (offered(record))
      found.push([
        commandWord(description, name),
        { ...common(name, record), kind: 'function', at: record.kind === 'query' ? 'read' : 'call' },
      ])
  for (const [name, record] of Object.entries(description.flows))
    if (offered(record))
      found.push([
        commandWord(description, name),
        {
          ...common(name, record),
          // An agent takes what a start of it takes: a message, above all.
          ...(record.agent === undefined ? {} : { input: startTypes }),
          kind: record.agent === undefined ? 'flow' : 'agent',
          at: 'call',
        },
      ])
  for (const [name, record] of Object.entries(description.commands))
    found.push([
      commandWord(description, name),
      {
        definition: name,
        kind: 'command',
        at: 'call',
        ...(typeof record.about === 'string' ? { about: record.about } : {}),
        input: isStored(record.args) ? record.args : {},
        ...(record.access === undefined ? {} : { access: record.access }),
        ...(typeof record.module === 'string' ? { module: record.module } : {}),
        ...(typeof record.export === 'string' ? { export: record.export } : {}),
      },
    ])
  return found.sort(([a], [b]) => (a < b ? -1 : 1))
}

/** Whether an app has a command line at all: something offered to it, or a command written in code. */
export const hasCommands = (description: Description): boolean => entriesOf(description).length > 0

/**
 * Takes a description and the id of its version. Answers what the runner knows of the app: the name of its
 * command, which is `cli.name` of the project or the name of the project turned, and each command by its word.
 */
export function commandList(description: Description, version: string): CommandList {
  return {
    app: description.app.name,
    name: appCommand(description.app.name, description.project.cli),
    version,
    needsEngine: description.app.needsEngine,
    commands: Object.fromEntries(entriesOf(description)),
  }
}
