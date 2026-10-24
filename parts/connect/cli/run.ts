import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Terminal } from '../../core/index.ts'
import { coreVersion, isStored } from '../../core/internal.ts'
import type { Reach } from '../env.ts'
import type { Wire } from './asked.ts'
import { asked, fileIdOf, sentFile } from './asked.ts'
import { commandRan, keptIn } from './commandRun.ts'
import { followed } from './followed.ts'
import { flagOf, readFlags, Unrunnable, withFlags } from './flags.ts'
import type { CommandList, ListedCommand } from './listed.ts'
import { appHelp, commandHelp } from './help.ts'
import { keptKey, serverOf } from './keys.ts'
import { heldList } from './listed.ts'
import type { SignIn } from './browserLogin.ts'
import { ownWord } from './own.ts'
import { tokenReach } from './tokens.ts'
import { errorText, jsonLine, nearest, printedOf, safe } from './printed.ts'

/** What the runner is handed: the words, the terminal, how it reaches the app, its folder, the target and the environment. */
export interface CommandLine {
  words: string[]
  terminal: Terminal
  reach: Reach
  home: string
  target: { address?: string; local: boolean; as?: string; data?: string }
  env: Record<string, string | undefined>
  // Ends when the person stops the command.
  signal?: AbortSignal
  // Opens the browser for a `login` with no flag, and waits for the code.
  signIn?: SignIn
}

/** The key that is sent to a server: `TENT_KEY` for the address that `TENT_AT` names, or the one `login` kept. */
function keyFor(o: CommandLine): string | undefined {
  const address = o.target.address ?? ''
  const { TENT_KEY: key, TENT_AT: at } = o.env
  if (key && at) {
    try {
      if (serverOf(at) === serverOf(address)) return key
    } catch {
      // A `TENT_AT` that is no address names no server.
    }
  }
  return keptKey(o.home, address)
}

/** A reach that adds the key to each request that names no sign-in of its own, and to the live connection. */
function keyed(reach: Reach, key: string | undefined): Reach {
  if (!key) return reach
  const signed = (request: Request): Request => {
    if (request.headers.has('authorization')) return request
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${key}`)
    return new Request(request, { headers })
  }
  return { request: (request) => reach.request(signed(request)), live: (request) => reach.live(signed(request)) }
}

/**
 * The commands of the app, as `/_t/cli` answers them. Of a server the record is kept by its version, and asked for
 * again with `?have=`: so after a new version the runner asks for the commands again. Prints the refusal, and
 * answers nothing, where the app answers none.
 */
async function listOf(reach: Reach, o: CommandLine): Promise<CommandList | undefined> {
  const file = o.target.address ? join(keptIn(o.home, o.target), 'record.json') : undefined
  let kept: CommandList | undefined
  try {
    kept = file ? Object(JSON.parse(readFileSync(file, 'utf8'))) : undefined
  } catch {
    kept = undefined
  }
  const listed = await asked(reach, `/_t/cli${kept?.version ? `?have=${encodeURIComponent(kept.version)}` : ''}`)
  if (!listed.ok || !isStored(listed.value)) {
    o.terminal.error(errorText(listed.error ?? { code: 'T0009', name: 'internal', message: 'No list of commands.' }))
    if (listed.error?.code === 'T0006' && o.target.address)
      o.terminal.error(`Log in first: tent cli ${o.target.address} login --key\n`)
    return undefined
  }
  if (listed.value.same === true && kept) return heldList(kept)
  const list = heldList(listed.value)
  if (file) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(list))
  }
  return list
}

/** The runner's own flags, read from wherever they stand, and the words that are left. */
function ownFlags(words: string[]): {
  json: boolean
  help: boolean
  input?: string
  yes: boolean
  version: boolean
  rest: string[]
} {
  const rest: string[] = []
  let input: string | undefined
  let [json, help, yes, version, word] = [false, false, false, false, false]
  for (let k = 0; k < words.length; k++) {
    const one = words[k]
    if (one === '--json') json = true
    else if (one === '--help') help = true
    else if (one === '--input' || one.startsWith('--input=')) {
      input = one === '--input' ? words[++k] : one.slice('--input='.length)
      if (input === undefined) throw new Unrunnable('--input needs a value: JSON, or - to read it from the input.')
    } else if (!word && one === '--yes') yes = true
    else if (!word && one === '--version') version = true
    else {
      if (!one.startsWith('--')) word = true
      rest.push(one)
    }
  }
  return { json, help, yes, version, rest, ...(input === undefined ? {} : { input }) }
}

/**
 * Follows the run of an agent that a command started, and prints its text as it is written, then a line feed.
 * Answers how the command ends: 0 where the run is done, and 1 where it failed or was stopped, with what it says.
 */
async function printedRun(reach: Reach, run: string, terminal: Terminal): Promise<number> {
  let written = ''
  for await (const part of followed(reach, run)) {
    const kind: unknown = Reflect.get(part, 'kind')
    const text: unknown = Reflect.get(part, 'text')
    if (kind === 'text' && typeof text === 'string') {
      terminal.write(safe(text))
      written += text
    } else if (kind === 'again') written = ''
    else if (kind === 'done') {
      // A run that ended before the text was followed is printed whole.
      if (typeof text === 'string' && !written) terminal.write(safe(text))
      terminal.write('\n')
      return 0
    } else if (kind === 'failed') {
      terminal.error(errorText(Object(Reflect.get(part, 'error'))))
      return 1
    } else if (kind === 'stopped') {
      terminal.error('Stopped.\n')
      return 1
    } else if (kind === 'run') {
      const state: unknown = Reflect.get(part, 'state')
      const now: unknown = Reflect.get(Object(Reflect.get(part, 'text')), 'text')
      if (typeof now === 'string' && now) {
        terminal.write(safe(now))
        written = now
      }
      if (state === 'done') {
        terminal.write('\n')
        return 0
      }
    }
  }
  return 0
}

/** The text of `--input`: as it was typed, or every line of the input for `-`. */
async function inputText(written: string, terminal: Terminal): Promise<unknown> {
  let text = written
  if (written === '-') {
    const lines: string[] = []
    for (let line = await terminal.line(); line !== undefined; line = await terminal.line()) lines.push(line)
    text = lines.join('\n')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Unrunnable('`--input` is one JSON object.')
  }
}

/** Uploads a file of this computer for a field of a function, and answers its id. */
async function uploaded(reach: Reach, entry: ListedCommand, field: string, path: string): Promise<string> {
  let bytes: Buffer
  try {
    if (!statSync(path).isFile()) throw new Unrunnable(`--${field} names ${path}, which is no file.`)
    bytes = readFileSync(path)
  } catch (error) {
    if (error instanceof Unrunnable) throw error
    throw new Unrunnable(`--${field} names ${path}, which cannot be read.`)
  }
  const id = fileIdOf(await sentFile(reach, bytes, { name: basename(path), for: entry.definition, field }))
  if (id === undefined) throw new Unrunnable(`The upload of ${path} was refused.`)
  return id
}

/** The question that a function which asks a person puts: the command, each flag with its value, a secret as `[secret]`. */
function question(list: CommandList, word: string, entry: ListedCommand, input: Record<string, unknown>): string {
  const flags = Object.entries(input).map(([field, value]) => {
    const secret = Reflect.get(Object(entry.input[field]), 'secret') === true
    const shown = secret ? '[secret]' : typeof value === 'string' ? value : JSON.stringify(value)
    return `--${flagOf(field)} ${shown}`
  })
  return safe(`${list.name} ${word} ${flags.join(' ')}`.trimEnd())
}

/**
 * Takes the words that were typed after the target, the terminal, how the app is reached, the runner's folder, the
 * target and the environment. Asks the app for its commands, turns the words into the call of one, carries it out
 * through the door, and prints what it answered. Answers how the command ends: 0 when it worked, 1 when the call
 * failed, and 2 when the command itself could not be carried out.
 */
export async function runCommandLine(o: CommandLine): Promise<number> {
  const { terminal } = o
  // A key that is kept or named for the server is sent as it is; the tokens of a `login` in the browser are renewed.
  const key = o.target.address ? keyFor(o) : undefined
  const reach = !o.target.address ? o.reach : key ? keyed(o.reach, key) : tokenReach(o.reach, o.home, o.target.address)
  let json = false
  try {
    const own = ownFlags(o.words)
    json = own.json
    const [first, ...after] = own.rest
    if (first !== undefined) {
      const ended = await ownWord(first, {
        words: after,
        terminal,
        reach,
        raw: o.reach,
        home: o.home,
        yes: own.yes,
        ...(o.target.address ? { address: o.target.address } : {}),
        ...(o.signIn ? { signIn: o.signIn } : {}),
        ...(o.signal ? { signal: o.signal } : {}),
      })
      if (ended !== undefined) return ended
    }
    const list = await listOf(reach, o)
    if (!list) return 2
    if (own.version) {
      terminal.write(safe(`${list.name} ${list.version} (runner ${coreVersion})\n`))
      return 0
    }
    const [word, ...words] = own.rest
    if (word === undefined || word.startsWith('--')) {
      if (word !== undefined) throw new Unrunnable(`The command line takes no ${word.slice(0, 40)} before a command.`)
      terminal.write(json ? `${jsonLine({ ok: true, value: list })}\n` : appHelp(list))
      return 0
    }
    const entry = Object.hasOwn(list.commands, word) ? list.commands[word] : undefined
    if (!entry) {
      const near = nearest(word, Object.keys(list.commands))
      throw new Unrunnable(`${list.name} has no command ${word.slice(0, 40)}.${near ? ` Did you mean ${near}?` : ''}`)
    }
    if (own.help) {
      terminal.write(json ? `${jsonLine({ ok: true, value: entry })}\n` : commandHelp(list, word))
      return 0
    }
    // A command written in code runs at the person's side, from its module.
    if (entry.kind === 'command')
      return await commandRan({
        list,
        entry,
        words,
        terminal,
        reach,
        home: o.home,
        target: o.target,
        ...(o.signal ? { signal: o.signal } : {}),
      })
    const read = readFlags(entry.input, words)
    const input = withFlags(own.input === undefined ? undefined : await inputText(own.input, terminal), read)
    for (const file of read.files) input[file.field] = await uploaded(reach, entry, file.field, file.path)
    const path = `/_t/${entry.at === 'read' ? 'read' : 'call'}/${encodeURIComponent(entry.definition)}`
    const stop = o.signal
    let run: string | undefined
    /**
     * Calls the function, with the lines of a yes, and asks again with `{ run }` while its run outlasts the call.
     * Answers its answer, or nothing where the person stopped the command, which stops a run under way with it.
     */
    const carried = async (headers: Record<string, string>): Promise<Wire | undefined> => {
      try {
        let answer = await asked(reach, path, { body: { input }, headers, ...(stop ? { signal: stop } : {}) })
        for (
          let named: unknown = Reflect.get(Object(answer.error?.fields), 'run');
          !answer.ok && answer.error?.code === 'T0008' && typeof named === 'string';
          named = Reflect.get(Object(answer.error?.fields), 'run')
        ) {
          run = named
          answer = await asked(reach, path, { body: { input: { run } }, ...(stop ? { signal: stop } : {}) })
        }
        return answer
      } catch (error) {
        if (!stop?.aborted) throw error
        if (run !== undefined) await asked(reach, path, { body: { input: { run, stop: true } } }).catch(() => undefined)
        return undefined
      }
    }
    let answer = await carried({})
    if (answer && !answer.ok && answer.error?.code === 'T7120') {
      const agreed = String(Reflect.get(Object(answer.error.fields), 'ask'))
      if (!own.yes) {
        terminal.error(`${question(list, word, entry, input)}\n`)
        if (!terminal.interactive) {
          terminal.error('No person is here to answer. Type --yes before the command to run it all the same.\n')
          return 2
        }
        terminal.error('Run it? (y/n) ')
        const said = (await terminal.line())?.trim() ?? ''
        if (!/^(y|yes)$/i.test(said)) return 1
      }
      answer = await carried({ 'tent-agreed': agreed })
    }
    if (!answer) {
      terminal.error('Stopped.\n')
      return 1
    }
    // An agent answers the run it started: its text is printed as it is written, and its end.
    const started: unknown = answer.ok && entry.kind === 'agent' ? Reflect.get(Object(answer.value), 'run') : undefined
    if (typeof started === 'string' && !json) return await printedRun(reach, started, terminal)
    if (json) terminal.write(`${jsonLine(answer)}\n`)
    else if (answer.ok) {
      const printed = printedOf(answer.value)
      if (printed !== '') terminal.write(`${printed}\n`)
    } else terminal.error(errorText(answer.error ?? {}))
    return answer.ok ? 0 : 1
  } catch (error) {
    if (!(error instanceof Unrunnable)) throw error
    terminal.error(`${safe(error.message)}\n`)
    return 2
  }
}
