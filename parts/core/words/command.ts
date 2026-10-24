import type { Definition } from '../definition.ts'
import { record } from '../definition.ts'
import type { Rule } from '../helpers/rules.ts'
import type { HandedFields, None, Type } from '../type.ts'

/** A backend definition as a command file is handed it: its name and its kind, typed by the real definition. */
export type Stub<_Input = unknown, _Output = unknown> = { definition: string; kind: string }

/** One part of a run that is followed. */
export type RunPart = object

/** The terminal that a command is handed. */
export interface Terminal {
  write(text: string): void
  error(text: string): void
  raw(text: string): void
  line(o?: { hidden?: boolean }): Promise<string | undefined>
  keys(): AsyncIterable<{ name: string; text: string; ctrl: boolean; alt: boolean; shift: boolean }>
  size(): { columns: number; rows: number }
  onResize(fn: () => void): () => void
  interactive: boolean
  color: boolean
}

/** What the `run` of a command is handed. */
export interface CommandRun<Args> {
  args: Args
  rest: string[]
  terminal: Terminal
  user?: { id: string; roles: string[] }
  signal: AbortSignal
  call<I, O>(what: Stub<I, O>, input: I, o?: { agreed?: string }): Promise<O>
  read<I, O>(what: Stub<I, O>, input: I): Promise<O>
  watch<I, O>(query: Stub<I, O>, input: I, on: (value: O) => void): () => void
  follow(run: string): AsyncIterable<RunPart>
  upload(path: string, o?: { for?: Stub<unknown, unknown>; field?: string }): Promise<string>
  download(id: string, path: string): Promise<void>
}

/** The options of `command`. */
interface CommandOptions<Args> {
  about?: string
  run: (o: CommandRun<HandedFields<Args>>) => number | undefined | Promise<number | undefined>
  access?: Rule
  args?: Args
  was?: string | readonly string[]
}

/** What `command` returns: a record that carries its options. */
type CommandDefinition<Name extends string, Args> = Definition<'command', Name, CommandOptions<Args>>

/**
 * Takes the name of a command of the app's own command line and its options, of which `run` is required. Answers
 * the definition, which only records them.
 */
export function command<const Name extends string, const Args extends { readonly [name: string]: Type } = None>(
  name: Name,
  o: CommandOptions<Args>,
): CommandDefinition<Name, Args>
export function command(name: string, o: object): object {
  return record('command', name, o)
}
