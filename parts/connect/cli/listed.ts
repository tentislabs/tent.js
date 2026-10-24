import { coreVersion, isStored } from '../../core/internal.ts'
import { Unrunnable } from './flags.ts'

/** One command of an app, by its word, as `GET /_t/cli` answers it: the engine writes it and the runner reads it. */
export interface ListedCommand {
  definition: string
  kind: 'function' | 'flow' | 'agent' | 'command'
  at: 'call' | 'read'
  about?: string
  input: Record<string, unknown>
  danger?: 'ask'
  deprecated?: string
  access?: unknown
  module?: string
  export?: string
}

/** What the runner knows of an app, as `GET /_t/cli` answers it: its name, its command, its version, its commands. */
export interface CommandList {
  app: string
  name: string
  version: string
  needsEngine: string
  commands: Record<string, ListedCommand>
}

// The words that are the runner's own: an app's command of one of those names would take the person's key.
const ownWords = new Set(['login', 'logout', 'whoami', 'help', 'file'])

// The form of a command's word: small letters, digits and hyphens, which holds no control character.
const wordForm = /^[a-z0-9][a-z0-9-]*$/

/** Whether a value read from JSON holds a key `__proto__` anywhere inside it. */
function holdsProto(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsProto)
  if (!isStored(value)) return false
  return Object.keys(value).some((key) => key === '__proto__' || holdsProto(value[key]))
}

/** The major and the minor number of a version written as text, or nothing for a text of no such form. */
function numbersOf(version: string): [number, number] | undefined {
  const found = /^(\d+)\.(\d+)/.exec(version)
  return found ? [Number(found[1]), Number(found[2])] : undefined
}

/**
 * Takes the list of an app's commands and a command written in code of it. Throws `Unrunnable` with the fix where
 * the modules of the list need a newer engine than this runner: a function's command runs no code here, and runs.
 */
export function refuseNewerEngine(list: CommandList, command: string): void {
  const needs = numbersOf(String(list.needsEngine ?? ''))
  const runs = numbersOf(coreVersion)
  if (needs && runs && (needs[0] > runs[0] || (needs[0] === runs[0] && needs[1] > runs[1])))
    throw new Unrunnable(
      `The command ${command} of ${String(list.name).slice(0, 40)} needs an engine ${list.needsEngine}, and this runner is ${coreVersion}. Update the player first: tent update`,
    )
}

/**
 * Takes what an app answered for its list of commands. Answers the list as the runner takes it: a command whose
 * word is one of the runner's own, or of no form of a word, is left out. Throws `Unrunnable` with T0002 for a key
 * `__proto__`.
 */
export function heldList(value: unknown): CommandList {
  if (holdsProto(value)) throw new Unrunnable('error T0002 bad-input: the list of commands holds a key __proto__.')
  const list: CommandList = Object(value)
  const commands: unknown = list.commands
  const kept: CommandList['commands'] = {}
  if (isStored(commands))
    for (const [word, entry] of Object.entries(commands))
      if (wordForm.test(word) && !ownWords.has(word) && isStored(entry)) kept[word] = Object(entry)
  return { ...list, commands: kept }
}
