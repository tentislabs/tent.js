import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { TentError } from '../core/index.ts'
import { fingerprintOf, limitDefaults } from '../core/internal.ts'
import type { Mode } from '../data/index.ts'
import type { PartFile } from './archive/unpack.ts'
import { unpack } from './archive/unpack.ts'
import { underWay } from './context.ts'
import { partsOf } from './parts.ts'

/**
 * One line of the list of the parts that are fetched at their first use: the name of the part, the version it is
 * pinned at, the address its file is fetched from, and the fingerprint of that file: SHA-256 in hex, or SHA-512 in
 * base64 with `sha512-` in front, as the npm registry gives it. `system` is there where the file is that of one
 * system, written as the runtime names it, `win32-x64`, `darwin-arm64`, `linux-x64`. A part that is several files
 * has a line for each. `into` is the folder of the part that the file is laid in, with the first folder of each of
 * its paths left out: a package file of the npm registry holds every path under `package/`.
 */
export interface FetchedPart {
  name: string
  version: string
  system?: string
  from: string
  fingerprint: string
  into?: string
}

/**
 * What `fetchPart` takes beside the name. What is not given is taken from where the call is made. `list` stands
 * in the place of the list that ships. `folder` stands in the place of the runner's folder, in whose `fetched/`
 * the parts lie. `from` is an address of the builder's own that serves every part, as `TENT_PARTS` names one.
 * `mode` is the mode that the fetch is held to: left out, that of the app whose call the fetch is made in, and
 * `'live'` outside a call. `time` is how long a first fetch is waited for, in milliseconds: left out, as long as
 * `limits.fetchTime` of the project of that call says, and two minutes outside a call.
 */
export interface FetchPartOptions {
  list?: readonly FetchedPart[]
  folder?: string
  from?: string
  mode?: Mode
  time?: number
}

// The most bytes that the file of a part may hold: the largest part that is pinned, a browser, is well under it.
const partSize = 512 * 1_048_576

// A folder that a fetch left half-made, as a program that was killed leaves one, is removed after this long.
const leftAfter = 3_600_000

const here = `${process.platform}-${process.arch}`

/**
 * Answers the runner's folder, the one folder of the install for one person: what `TENT_HOME` names, and
 * otherwise `%LOCALAPPDATA%\Tent` on Windows and `~/.tent` on macOS and Linux. It is never a folder of the package.
 */
export function runnerFolder(): string {
  if (process.env.TENT_HOME) return process.env.TENT_HOME
  if (process.platform !== 'win32') return join(homedir(), '.tent')
  return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Tent')
}

const isLine = (line: unknown): line is FetchedPart =>
  ['name', 'version', 'from', 'fingerprint'].every((key) => typeof Reflect.get(Object(line), key) === 'string') &&
  ['undefined', 'string'].includes(typeof Reflect.get(Object(line), 'into'))

/** Whether bytes have the fingerprint of a line, in either form that a line writes it in. */
const hasFingerprint = (bytes: Uint8Array, written: string): boolean =>
  written.startsWith('sha512-')
    ? createHash('sha512').update(bytes).digest('base64') === written.slice('sha512-'.length)
    : fingerprintOf(bytes) === written.toLowerCase()

let shipped: FetchedPart[] | undefined

/** Answers the list that ships with the engine, read once. */
export function shippedList(): FetchedPart[] {
  if (!shipped) {
    const read: unknown = JSON.parse(readFileSync(new URL('./fetched.json', import.meta.url), 'utf8'))
    shipped = Array.isArray(read) ? read.filter(isLine) : []
  }
  return shipped
}

/**
 * Answers what a failure of the disk is told as: the word of the system for it, and not its own message, which
 * holds the paths it failed at.
 */
function toldOf(error: unknown): string {
  const word: unknown = Reflect.get(Object(error), 'code')
  return typeof word === 'string'
    ? `Its place on the disk could not be read or written: the system answered ${word}.`
    : 'Its place on the disk could not be read or written.'
}

/** The error of a part that could not be fetched, which names the part and why. */
function notFetched(name: string, why: string, cause?: unknown): TentError {
  const error = new TentError('T0016', `The part ${name} could not be fetched: ${why}`, {
    fix: 'See that this computer reaches the place the part comes from, or name a place of your own that serves the parts with TENT_PARTS.',
  })
  if (cause !== undefined) error.cause = cause
  return error
}

// The places of the parts that this program found whole: each is asked of the disk once.
const foundWhole = new Set<string>()

/** Whether a link under a folder leads nowhere: asked of the disk, with no link followed into. */
async function leadsNowhere(folder: string): Promise<boolean> {
  for (const name of await readdir(folder)) {
    const at = join(folder, name)
    const what = await lstat(at)
    if (
      what.isSymbolicLink() ? !(await stat(at).catch(() => undefined)) : what.isDirectory() && (await leadsNowhere(at))
    )
      return true
  }
  return false
}

/**
 * Whether the part stands at its place, whole. A part in which a link leads nowhere is none that is there: a
 * junction names its folder by its whole path, so it leads nowhere once the runner's folder was moved. Such a
 * part is removed, so that it is fetched anew.
 */
async function standsWhole(place: string): Promise<boolean> {
  if (!existsSync(place)) return false
  if (foundWhole.has(place)) return true
  if (await leadsNowhere(place)) {
    await rm(place, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    return false
  }
  foundWhole.add(place)
  return true
}

// The fetches that are under way, by what each asks: a second call that asks alike waits for the first.
const fetching = new Map<string, Promise<string>>()

/** Puts a folder that was filled in its place. Where another program was first, its folder stays and this one is removed. */
async function moveIn(filled: string, place: string): Promise<void> {
  for (let tries = 0; ; tries++)
    try {
      return await rename(filled, place)
    } catch (error) {
      if (existsSync(place)) return await rm(filled, { recursive: true, force: true })
      // Windows refuses for a moment while another program still reads a file that was just written.
      if (tries >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(Object(error).code)) throw error
      await new Promise((done) => setTimeout(done, 50 * (tries + 1)))
    }
}

/** Fetches the files of a part, holds each to its fingerprint, lays them all beside the place of the part, and moves the folder in. */
async function fetched(
  name: string,
  lines: FetchedPart[],
  place: string,
  o: { own: string | undefined; mode: Mode; time: number },
): Promise<string> {
  const beside = join(dirname(place), '.tmp')
  await mkdir(beside, { recursive: true })
  const now = performance.timeOrigin + performance.now()
  for (const left of await readdir(beside)) {
    const made = await stat(join(beside, left)).catch(() => undefined)
    if (made && now - made.mtimeMs > leftAfter) await rm(join(beside, left), { recursive: true, force: true })
  }
  const filling = await mkdtemp(join(beside, `${basename(place)}.`))
  try {
    // The first part that is fetched is what first reaches out: nothing of `connect` is loaded before it.
    const { addressOf, guardedFetch, shownOf, typedHosts } = await import('../connect/index.ts')
    const { own } = o
    const ends = performance.now() + o.time
    const files: PartFile[] = []
    for (const line of lines) {
      const listed = addressOf(line.from)
      const address = own ? addressOf(basename(listed.pathname), own.endsWith('/') ? own : `${own}/`) : listed
      // An address that a person typed for the fetching of parts is that person's own word: it counts as listed.
      const typed = own ? typedHosts(address) : []
      const answer = await guardedFetch({ mode: o.mode, privateHosts: typed })(address, {
        size: partSize,
        time: Math.max(1, ends - performance.now()),
      })
      if (!answer.ok) throw new Error(`${shownOf(address)} answered ${answer.status}.`)
      const bytes = new Uint8Array(await answer.arrayBuffer())
      if (!hasFingerprint(bytes, line.fingerprint))
        throw new Error(`What ${shownOf(address)} answered does not have the fingerprint that the list pins.`)
      files.push(line.into === undefined ? { bytes } : { bytes, into: line.into })
    }
    // A part is laid from all its files together, when each of them has its fingerprint.
    await unpack(files, filling, place)
    await moveIn(filling, place)
    return place
  } catch (error) {
    await rm(filling, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    throw notFetched(name, error instanceof Error ? error.message : String(error), error)
  }
}

/**
 * Takes the name of a part that is fetched at its first use, and what the call states of its own. Answers the folder
 * of the part, `fetched/<name>@<version>/` in the runner's folder. Where the part is not there yet, each of its files for this system is downloaded
 * through the guarded fetch, checked against the fingerprint of the list, and unpacked beside its place, and the
 * folder is then renamed into it: so a part is there whole or not at all. Two calls for one part at once share
 * one download where they ask alike: into the same folder, from the same address and in the same mode. Throws T0016, which names the part, where the list holds none of that name for this system, where
 * a file cannot be fetched or does not have its fingerprint, and where an archive holds a path or a link that
 * leaves the folder of the part.
 */
export function fetchPart(name: string, o: FetchPartOptions = {}): Promise<string> {
  const lines = (o.list ?? shippedList()).filter(
    (line) => line.name === name && (line.system === undefined || line.system === here),
  )
  const [first] = lines
  if (!first)
    return Promise.reject(notFetched(name, `The list of the parts holds none of that name for the system ${here}.`))
  // The name and the version become the name of a folder.
  if (!/^[\w.-]+$/.test(`${name}${first.version}`) || lines.some((line) => line.version !== first.version))
    return Promise.reject(notFetched(name, 'Its lines of the list do not name one part at one version.'))
  // What the call does not state is taken from where it is made: the app whose call is under way, if any, and
  // what the program that started its engine said of the parts.
  const app = underWay()?.app
  const told = partsOf(app)
  const place = join(o.folder ?? told.folder ?? runnerFolder(), 'fetched', `${name}@${first.version}`)
  const ofProject: unknown = Reflect.get(Object(app?.description.project.limits), 'fetchTime')
  const asked = {
    own: o.from ?? told.from ?? process.env.TENT_PARTS,
    mode: o.mode ?? app?.mode ?? 'live',
    time: o.time ?? (typeof ofProject === 'number' ? ofProject : Number(limitDefaults.project.fetchTime)),
  }
  // Two calls share a download where they ask alike: into the same folder, from the same address, in the same mode.
  const key = JSON.stringify([place, asked.own ?? '', asked.mode])
  // The wait for a part does not count on the time of the call that needed it. The end of that call is moved by
  // the longest that the fetch is waited for, before the wait, so that the call does not end in the middle of it,
  // and back by what of that time was not needed, once the part is there or the fetch has failed.
  const call = underWay()
  const began = performance.now()
  if (call) call.work.ends += asked.time
  const outOfTime = (work: Promise<string>): Promise<string> =>
    call
      ? work.finally(() => {
          call.work.ends -= Math.max(0, asked.time - (performance.now() - began))
        })
      : work
  const waited = fetching.get(key)
  if (waited) return outOfTime(waited)
  /** Answers the place of the part, fetched where it does not stand there whole. Whatever fails, the call is told T0016. */
  const there = async (): Promise<string> => {
    try {
      return (await standsWhole(place)) ? place : await fetched(name, lines, place, asked)
    } catch (error) {
      throw error instanceof TentError && error.code === 'T0016' ? error : notFetched(name, toldOf(error), error)
    }
  }
  const work = there().finally(() => fetching.delete(key))
  fetching.set(key, work)
  return outOfTime(work)
}
