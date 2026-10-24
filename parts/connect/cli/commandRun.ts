import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandRun, Terminal } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { fingerprintOf, isStored } from '../../core/internal.ts'
import type { Reach } from '../env.ts'
import type { Wire } from './asked.ts'
import { asked, base, fileIdOf, sentFile, wireError } from './asked.ts'
import { answerSize, boundedBytes } from './bounded.ts'
import { followed } from './followed.ts'
import { written } from './downloaded.ts'
import { readFlags, Unrunnable } from './flags.ts'
import { safe } from './printed.ts'
import type { CommandList, ListedCommand } from './listed.ts'
import { refuseNewerEngine } from './listed.ts'
import { watched } from './watched.ts'

// A module of a command names the entry of a command file by its import: the runner answers it with its own.
const entry = new URL('../cliEntry.ts', import.meta.url).href
let hooked = false
const hookEntry = (): void => {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve: (name, context, next) =>
      name === 'tentjs/cli' ? { url: entry, shortCircuit: true } : next(name, context),
  })
}

/** Who the caller is, as `/_t/cli/me` answers it. */
interface Me {
  user?: { id: string; roles: string[] }
  key?: { id: string; name: string; roles: string[] }
  system?: true
}

/** Asks the app in the wire form. Answers its answer where it worked, or throws the error it answered. */
async function worked(reach: Reach, path: string, o: { body?: unknown; agreed?: string } = {}): Promise<Wire> {
  const answer = await asked(reach, path, {
    ...(o.body === undefined ? {} : { body: o.body }),
    ...(o.agreed === undefined ? {} : { headers: { 'tent-agreed': o.agreed } }),
  })
  if (!answer.ok) throw wireError(answer.error)
  return answer
}

/** Whether the `access` of a command fits the caller: the system passes every rule. */
function fits(access: unknown, me: Me): boolean {
  if (me.system) return true
  const rule: Record<string, unknown> = isStored(access) ? access : { rule: 'anyone' }
  const roles = me.key?.roles ?? me.user?.roles ?? []
  if (rule.rule === 'anyone') return true
  if (rule.rule === 'signedIn') return me.user !== undefined || me.key !== undefined
  if (rule.rule === 'role') return roles.includes(String(rule.role))
  return false
}

/**
 * The place the runner keeps the modules of an app under: `cli/<host>/` of its folder, and for the app of this
 * computer `cli/local-<the first 12 characters of the fingerprint of its data folder's path>/`.
 */
export const keptIn = (home: string, target: { address?: string; data?: string }): string => {
  // A host of IPv6 holds colons as the one before a port does, and no folder of Windows takes one.
  const host = target.address
    ? new URL(target.address).host.replaceAll(':', '-')
    : `local-${fingerprintOf(new TextEncoder().encode(target.data ?? home)).slice(0, 12)}`
  return join(home, 'cli', host)
}

// A module is asked for by its bare name alone: one that leads out of `/_t/b/cli/` is no name the runner takes.
const moduleForm = /^[A-Za-z0-9][A-Za-z0-9.-]*\.[0-9a-f]{12}\.js$/

/**
 * Takes the module of a command by its name in the bundle: fetched through the reach from `/_t/b/cli/<name>`,
 * kept under the runner's folder by its name, and thrown away where its bytes do not fit the fingerprint the
 * name holds. Answers where it lies.
 */
async function moduleOf(
  reach: Reach,
  home: string,
  target: { address?: string; data?: string },
  module: string,
): Promise<string> {
  const name = module.startsWith('cli/') ? module.slice('cli/'.length) : module
  if (!moduleForm.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)\./i.test(name))
    throw new Unrunnable(`The module ${safe(name.slice(0, 60))} of the command has no name the runner takes.`)
  const folder = keptIn(home, target)
  const lies = join(folder, name)
  try {
    if (fingerprintOf(readFileSync(lies)).slice(0, 12) === name.split('.').at(-2)) return lies
  } catch {
    // Not kept yet: it is fetched.
  }
  const answer = await reach.request(new Request(`${base}/_t/b/cli/${name}`))
  const bytes = await boundedBytes(answer, answerSize, `The module ${name}`)
  if (!answer.ok || fingerprintOf(bytes).slice(0, 12) !== name.split('.').at(-2))
    throw new Unrunnable(`The module ${name} of the command does not fit its name, and is thrown away.`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(lies, bytes)
  return lies
}

/**
 * Carries out a command written in code: refuses it where the app needs a newer engine than the runner, asks who
 * the caller is and refuses before `run` where its `access` does not fit, loads its module, and hands `run` the flags, the words after `--`, the terminal, and calls that pass the
 * door as the caller. Answers how it ends: what `run` answered, 0 for nothing, and 1 for an error it let out.
 */
export async function commandRan(o: {
  list: CommandList
  entry: ListedCommand
  words: string[]
  terminal: Terminal
  reach: Reach
  home: string
  target: { address?: string; data?: string }
  // Ends when the person stops the command: the `signal` that `run` is handed ends with it.
  signal?: AbortSignal
}): Promise<number> {
  const { reach, terminal, entry } = o
  refuseNewerEngine(o.list, entry.definition)
  const me: Me = Object((await worked(reach, '/_t/cli/me')).value)
  if (!fits(entry.access, me)) {
    const code = me.user || me.key ? 'T3101' : 'T0006'
    terminal.error(safe(`error ${code}: the command ${entry.definition} is not for this caller.\n`))
    return 1
  }
  if (!entry.module || !entry.export) throw new Unrunnable(`The command ${entry.definition} names no module.`)
  // The code of a server runs on this computer only once the person added its address.
  if (o.target.address && !existsSync(join(keptIn(o.home, o.target), 'added.json')))
    throw new Unrunnable(
      `The command ${entry.definition} is code of ${o.target.address}, which runs here only once you add it: tent cli add ${o.target.address}`,
    )
  const split = o.words.indexOf('--')
  const flags = split < 0 ? o.words : o.words.slice(0, split)
  const rest = split < 0 ? [] : o.words.slice(split + 1)
  const read = readFlags(entry.input, flags)
  const args: Record<string, unknown> = {}
  for (const [field, type] of Object.entries(entry.input)) {
    const fallback: unknown = Reflect.get(Object(type), 'default')
    if (fallback !== undefined) args[field] = fallback
  }
  Object.assign(args, read.input)
  hookEntry()
  const lies = await moduleOf(reach, o.home, o.target, entry.module)
  const loaded: Record<string, unknown> = { ...(await import(pathToFileURL(lies).href)) }
  const run: unknown = Reflect.get(Object(Reflect.get(Object(loaded[entry.export]), 'options')), 'run')
  if (typeof run !== 'function') throw new Unrunnable(`The module of ${entry.definition} holds no command.`)
  const named = (what: unknown): string => String(Reflect.get(Object(what), 'definition'))
  const ends = new AbortController()
  const stopped = (): void => ends.abort(o.signal?.reason)
  o.signal?.addEventListener('abort', stopped, { once: true })
  if (o.signal?.aborted) stopped()
  // `write` and `error` are safe by themselves: words that came from a row cannot drive the terminal. `raw` is as it is.
  const safeTerminal: Terminal = {
    ...terminal,
    write: (text) => terminal.write(safe(String(text))),
    error: (text) => terminal.error(safe(String(text))),
  }
  const handed: CommandRun<Record<string, unknown>> = {
    args,
    rest,
    terminal: safeTerminal,
    ...(me.user ? { user: me.user } : {}),
    signal: ends.signal,
    // The value is handed on as the app answered it, read from the record around it: a yes or no, a number and a
    // text stay what they are, where `Object` of the value itself would make each an object.
    call: async (what, input, how) =>
      Object(
        await worked(reach, `/_t/call/${encodeURIComponent(named(what))}`, {
          body: { input },
          ...(how?.agreed ? { agreed: how.agreed } : {}),
        }),
      ).value,
    read: async (what, input) =>
      Object(await worked(reach, `/_t/read/${encodeURIComponent(named(what))}`, { body: { input } })).value,
    watch: (query, input, on) =>
      watched(reach, o.list.version, named(query), input, (value) => on(Object({ value }).value)),
    follow: (run) => followed(reach, run),
    upload: async (path, how) => {
      const answer = await sentFile(reach, readFileSync(path), {
        name: basename(path),
        ...(how?.for ? { for: named(how.for) } : {}),
        ...(how?.field ? { field: how.field } : {}),
      })
      const id = fileIdOf(answer)
      if (id === undefined) throw wireError(answer.error)
      return id
    },
    download: async (id, path) => {
      const answer = await reach.request(new Request(`${base}/_t/files/${encodeURIComponent(id)}`))
      if (!answer.ok) throw new TentError('T0001', `The file ${id} cannot be downloaded.`)
      await written(answer, path)
    },
  }
  try {
    const ended: unknown = await run(handed)
    return typeof ended === 'number' && Number.isInteger(ended) ? ended : 0
  } catch (error) {
    const code = error instanceof TentError ? error.code : 'T0009'
    terminal.error(safe(`error ${code}: ${error instanceof Error ? error.message : String(error)}\n`))
    return 1
  } finally {
    o.signal?.removeEventListener('abort', stopped)
    ends.abort()
  }
}
