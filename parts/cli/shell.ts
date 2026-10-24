import { resolve } from 'node:path'
import type { Finding, Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { nearest, safe } from '../connect/index.ts'
import { checkValue, finding } from '../core/internal.ts'
import { shippedRelease } from '../engine/index.ts'
import { askFirst } from './askFirst.ts'
import type { Command } from './command.ts'
import { list } from './commands/list.ts'
import { firstStart, handedOver, handsOver, inTheInstall, lacksTools } from './launch.ts'
import { noticed } from './notices.ts'
import { findingText, valueText } from './print.ts'
import { projectOf } from './projectOf.ts'

/** Where a command was typed, and where what it prints goes. */
export interface Typed {
  folder?: string
  out?(text: string): void
}

/** One command of a list, as the list of the folder of the commands holds it: a command of a folder as `<folder>/<file>`. */
interface Listed {
  name: string
  load(): Promise<{ command: Command }>
}

/**
 * Thrown where a command was typed with a word, a flag or a value it does not take, or without one it needs: T0038.
 * Its fix is how the command is typed, after the nearest real word where one is near.
 */
class Mistyped extends Error {
  fix: string
  constructor(message: string, usage: string, near?: string) {
    super(message)
    this.fix = `${near === undefined ? '' : `Did you mean ${near}? `}It is typed: ${usage}`
  }
}

/**
 * How a listed command is typed. The file of a folder that carries the name of the folder is the command itself,
 * typed with that name alone. Every other file of a folder is typed as two words, the folder and the file.
 */
function typedAs(listed: string): string {
  const [folder, file] = listed.split('/')
  return file === undefined || file === folder ? folder : `${folder} ${file}`
}

/** What `tent` alone and `tent --help` print: how a command is typed, and every command. */
const helpOf = (names: string[]): string => `tent <command>, one of: ${names.join(', ')}. Every command takes --json.`

/** A flag of a command as it is typed, from its type: in brackets where it may be left out, as the reference writes it. */
function flagOf(name: string, type: Type): string {
  const value =
    type.kind === 'boolean'
      ? `--${name}`
      : type.kind === 'list'
        ? `--${name} <${type.of.kind}> ...`
        : `--${name} <${type.kind === 'choice' ? type.values.join('|') : type.kind}>`
  const optional = type.optional === true || type.kind === 'boolean' || Reflect.get(type, 'default') !== undefined
  return optional ? `[${value}]` : value
}

/** How a command is typed: `tent`, its name, and each flag that its `args` state, as the reference writes its line. */
const usageOf = (command: Command): string =>
  ['tent', command.name, ...Object.entries(command.args).map(([name, type]) => flagOf(name, type))].join(' ')

/**
 * Takes the commands of a list and the words that were typed. Answers the command that the first two words name,
 * or else the first alone, with the words that follow its name.
 */
function commandOf(commands: Listed[], words: string[]): { listed: Listed; rest: string[] } {
  const [first, second] = words
  const typed = (name: string) => (name.includes('/') ? undefined : commands.find((one) => typedAs(one.name) === name))
  const two = second === undefined || second.includes('/') ? undefined : typed(`${first} ${second}`)
  if (two) return { listed: two, rest: words.slice(2) }
  const single = first.includes(' ') ? undefined : typed(first)
  if (single) return { listed: single, rest: words.slice(1) }
  const files = commands.filter((one) => one.name.startsWith(`${first}/`)).map((one) => one.name.split('/')[1])
  if (files.length) {
    const near = second === undefined ? undefined : nearest(second, files)
    throw new Mistyped(
      `tent ${first} needs one of: ${files.join(', ')}.`,
      `tent ${first} <${files.join('|')}>`,
      near === undefined ? undefined : `tent ${first} ${near}`,
    )
  }
  const names = commands.map((one) => typedAs(one.name))
  const near = nearest(first, names)
  throw new Mistyped(
    `tent has no command "${first}". It has: ${names.join(', ')}.`,
    helpOf(names),
    near === undefined ? undefined : `tent ${near}`,
  )
}

/**
 * Takes work. Carries it out with what is written to the standard output sent to the standard error, and gives the
 * standard output back once it has ended, also where it threw. Answers what the work answered.
 */
async function toErrors<T>(work: () => Promise<T>): Promise<T> {
  const own = Object.getOwnPropertyDescriptor(process.stdout, 'write')
  Reflect.set(process.stdout, 'write', process.stderr.write.bind(process.stderr))
  try {
    return await work()
  } finally {
    if (own) Object.defineProperty(process.stdout, 'write', own)
    else Reflect.deleteProperty(process.stdout, 'write')
  }
}

/** Reads one written value by the type that takes it. */
function read(type: Type, written: string): unknown {
  if (type.kind === 'number' && written.trim() !== '' && !Number.isNaN(Number(written))) return Number(written)
  return type.kind === 'boolean' ? written !== 'false' : written
}

/** The values that a flag of a choice takes, as the words of a refusal end with them, or nothing for another type. */
const valuesOf = (type: Type): string => (type.kind === 'choice' ? `: ${type.values.join(', ')}` : '')

/** Reads the words after the name of a command into what the command takes, by name. Throws Mistyped for a word it does not take. */
function argsOf(command: Command, words: string[]): Record<string, unknown> {
  const usage = usageOf(command)
  const args: Record<string, unknown> = {}
  const loose: string[] = []
  // A flag whose type is a list may be given several times, and holds each value. Any other holds one.
  const give = (name: string, written: string): void => {
    const type = command.args[name]
    const held = Object.hasOwn(args, name) ? args[name] : undefined
    args[name] =
      type.kind === 'list' ? [...(Array.isArray(held) ? held : []), read(type.of, written)] : read(type, written)
  }
  for (let k = 0; k < words.length; k++) {
    const word = words[k]
    if (!word.startsWith('--')) loose.push(word)
    else {
      const [name, given] = word.slice(2).split(/=(.*)/s)
      if (!Object.hasOwn(command.args, name)) {
        const near = nearest(name, Object.keys(command.args))
        throw new Mistyped(
          `tent ${command.name} takes no --${name}.`,
          usage,
          near === undefined ? undefined : `--${near}`,
        )
      }
      if (command.args[name].kind === 'boolean') give(name, given ?? 'true')
      else if (given !== undefined) give(name, given)
      else if (k + 1 < words.length) give(name, words[++k])
      else throw new Mistyped(`--${name} of tent ${command.name} needs a value${valuesOf(command.args[name])}.`, usage)
    }
  }
  // A word that is no flag fills what takes one value and was not given by a flag, in the order the command lists it.
  const open = Object.keys(command.args).filter(
    (name) => !Object.hasOwn(args, name) && !['boolean', 'list'].includes(command.args[name].kind),
  )
  if (loose.length > open.length)
    throw new Mistyped(`tent ${command.name} does not take "${loose[open.length]}".`, usage)
  for (const [k, word] of loose.entries()) give(open[k], word)
  for (const [name, type] of Object.entries(command.args))
    if (
      !Object.hasOwn(args, name) &&
      type.optional !== true &&
      Reflect.get(type, 'default') === undefined &&
      type.kind !== 'boolean'
    )
      throw new Mistyped(`tent ${command.name} needs <${name}>${valuesOf(type)}.`, usage)
  // A value is held to the type of its flag, as a number or one of the values of a choice.
  for (const [name, given] of Object.entries(args))
    if (checkValue(command.args[name], given).length)
      throw new Mistyped(
        `--${name} of tent ${command.name} does not take ${JSON.stringify(Array.isArray(given) ? given.join(' ') : String(given))}${valuesOf(command.args[name])}.`,
        usage,
      )
  return args
}

/**
 * Takes the commands of a list, the words that were typed after `tent`, and where they were typed. Carries the
 * command out and prints what it answers: as text, or with `--json` as `{ "ok", "value", "findings" }`. Answers the
 * number that the program ends with: 0 when there is no error, 1 when there is, 2 when the command itself failed.
 * Of a command that states `raw` it prints nothing, and answers the number that the command answers.
 */
export async function carryOut(commands: Listed[], words: string[], typed: Typed = {}): Promise<number> {
  const out = typed.out ?? ((text: string) => console.log(text))
  const json = words.includes('--json')
  const plain = words.filter((word) => word !== '--json')
  const answer = (value: unknown, findings: Finding[], failed: boolean): number => {
    const ok = !failed && !findings.some((one) => one.level === 'error')
    // JSON leaves DEL and the controls of U+0080 to U+009F as they are, which drive a terminal of 8 bits.
    if (json) out(safe(JSON.stringify({ ok, value: value ?? null, findings }, null, 2)))
    else {
      const text = [...findings.map(findingText), valueText(value)].filter((one) => one !== '').join('\n\n')
      if (text !== '') out(text)
    }
    // A command that answers that it was typed with what it does not take ends as one that the shell refused.
    return failed || findings.some((one) => one.code === 'T0038') ? 2 : ok ? 0 : 1
  }
  try {
    // The first start of what an installer unpacked holds it to our signature, before anything of it runs.
    const unsigned = firstStart()
    if (unsigned) return answer(undefined, [finding('T0026', unsigned, { fix: 'Install Tent.js again.' })], true)
    // An install on the list of known problems says so in every command, in one line beside what it prints.
    noticed((line) => console.error(line))
    const names = commands.map((one) => typedAs(one.name))
    if (!plain.length || plain[0] === 'help' || plain[0] === '--help') return answer(helpOf(names), [], false)
    // A person and a program ask a command line its version by these two, as of every widely used one.
    if (plain[0] === '--version' || plain[0] === '-v')
      return answer(
        shippedRelease()?.version ?? 'This framework runs from its own sources, which have no version.',
        [],
        false,
      )
    const { listed, rest } = commandOf(commands, plain)
    // A command of the build tools is not loaded where the install holds the player alone: it says what brings it.
    const lacking = lacksTools(typedAs(listed.name))
    if (lacking) return answer(undefined, [finding('T0013', lacking, { fix: 'Type tent update --build-tools.' })], true)
    const { command } = await listed.load()
    const here = resolve(typed.folder ?? process.cwd())
    const project = command.needs === 'nothing' ? undefined : projectOf(here)
    const homeless = project === undefined ? undefined : inTheInstall(project)
    if (homeless) throw new Error(homeless)
    // A project is worked on by the version of the framework that it holds.
    const handed = handsOver(command) ? handedOver(here, words, (line) => console.error(line)) : undefined
    if (handed !== undefined) return handed
    const none = (): never => {
      throw new Error(`No project is here: no folder from ${here} upward holds a tent.ts.`)
    }
    if (command.raw) {
      // The words after the name stand as they were typed, a `--json` among them: the name ends where as many
      // words that are not `--json` have passed as the name has.
      let left = plain.length - rest.length
      const after = words.findIndex((word) => word !== '--json' && --left === 0) + 1
      // What names the engine is among its words, which the command reads itself: only a project is asked here.
      return await command.run({
        words: words.slice(after),
        folder: project ?? (command.needs === 'project' ? none() : here),
      })
    }
    const args = argsOf(command, rest)
    // A command that needs the engine finds it through `--data`, through `--at` on a server, or through the `.tent/`
    // of the project.
    const far = command.needs === 'engine' && (typeof args.data === 'string' || typeof args.at === 'string')
    const folder = project ?? (command.needs === 'nothing' || far ? here : none())
    // With `--json` a program reads the standard output as one answer: what else is printed meanwhile, as by a
    // plugin of the build, goes to the standard error.
    const made =
      json && typed.out === undefined
        ? await toErrors(() => command.run({ args, folder }))
        : await command.run({ args, folder })
    return answer(made.value, made.findings ?? [], false)
  } catch (error) {
    // What a command throws is a failure of the command itself, and is printed as a finding of its own.
    const words = error instanceof Error ? error.message : String(error)
    if (error instanceof Mistyped) return answer(undefined, [finding('T0038', words, { fix: error.fix })], true)
    const code = error instanceof TentError ? error.code : 'T0009'
    return answer(
      undefined,
      [finding(code, words, { fix: 'See `tent docs` for the commands and what each takes.' })],
      true,
    )
  }
}

/**
 * Takes the words that were typed after `tent`, and where they were typed. Carries the command out among the
 * commands of the framework, as `carryOut` does, and answers the number that the program ends with.
 */
export const tent = (words: string[], typed: Typed = {}): Promise<number> => carryOut(list, words, typed)

if (import.meta.main) {
  askFirst(process.argv.slice(2))
  process.exitCode = await tent(process.argv.slice(2))
}
