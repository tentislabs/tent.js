import { filesIn } from '../stored/holds.ts'
import type { Caller } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { answerOf, isStored } from '../../core/internal.ts'
import type { Page } from '../../screens/draw.ts'
import { grantCaller } from '../grants/caller.ts'
import { grantAt } from '../grants/kept.ts'
import { keyCaller } from '../keys/caller.ts'
import { keyAt } from '../keys/kept.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { callerWritten } from '../program.ts'
import { grantUploads } from '../grants/scoped.ts'
import { keyUploads } from '../keys/files.ts'
import { madeText, readText } from './texts.ts'

/** Whom a pass was made for: the grant of a token, a key, or a user, each read again at every use of the pass. */
interface PassedFor {
  kind: 'mcp' | 'key' | 'user'
  id: string
}

/**
 * What a pass of a frame holds: the caller it was made for, the queries and the files of the screen's answer, and
 * whether the caller it was made for could upload, which a pass can do no more than.
 */
export interface FramePass {
  for: PassedFor
  reads: string[]
  files: string[]
  uploads: boolean
  // The members of an agent, and `working`, that the screen reads or calls: no tool reaches them.
  members: string[]
}

/** The members that a screen's views read or call, however deep, with its layouts, as `helper.stop`. */
function membersOf(description: Description, screen: string): string[] {
  const found = new Set<string>()
  const seen = new Set<string>()
  const named = (value: unknown): void => {
    if (Array.isArray(value)) for (const one of value) named(one)
    if (!isStored(value)) return
    // A member is stored by its owner and its own name: `{ agent: 'helper', member: 'stop' }`.
    const owner = [value.agent, value.flow, value.action].find((one) => typeof one === 'string')
    if (typeof value.member === 'string' && typeof owner === 'string') found.add(`${owner}.${value.member}`)
    for (const one of Object.values(value)) named(one)
  }
  const waiting = [screen]
  for (let one = waiting.shift(); one !== undefined; one = waiting.shift()) {
    if (seen.has(one)) continue
    seen.add(one)
    const stored: unknown = description.screens[one] ?? description.components[one]
    if (!isStored(stored)) continue
    named(stored.data)
    // What the build read of the source of a view that it calls, a member among it.
    if (Array.isArray(stored.calls))
      for (const one of stored.calls) if (String(one).includes('.')) found.add(String(one))
    if (Array.isArray(stored.uses)) waiting.push(...stored.uses.map(String))
    if (typeof stored.layout === 'string') waiting.push(stored.layout)
  }
  return [...found].sort()
}

/** Whether a caller may upload at all: a token needs `write`, and a key the scope `files`. */
function uploadsAs(caller: Caller): boolean {
  try {
    grantUploads(caller)
    keyUploads(caller, null)
    return true
  } catch {
    return false
  }
}

/** Whom a pass is made for, by the caller of the screen's tool: its token, its key, or its user. */
function passedFor(caller: Caller): PassedFor | undefined {
  if (caller.kind === 'mcp' && caller.grant) return { kind: 'mcp', id: caller.grant.id }
  if (caller.kind === 'key' && caller.key) return { kind: 'key', id: caller.key.id }
  return caller.user ? { kind: 'user', id: caller.user.id } : undefined
}

/**
 * The queries and the members that `mcp.only` leaves a pass, as it narrows every caller at `/mcp`: under
 * `'queries'` the members that only read, and under a list the queries it names and the members of what it names.
 */
function narrowedByOnly(o: Opened, reads: string[], members: string[]): { reads: string[]; members: string[] } {
  const only: unknown = Object(o.description.project.mcp).only
  if (only === 'queries') return { reads, members: members.filter((one) => one.endsWith('.working')) }
  if (!Array.isArray(only)) return { reads, members }
  const named = only.map(String)
  return {
    reads: reads.filter((one) => named.includes(one)),
    members: members.filter((one) => named.includes(one.slice(0, one.lastIndexOf('.')))),
  }
}

/**
 * Takes an app and a pass that opened. Answers the caller it was made for, as that caller is now and narrowed by
 * what its token or its key was given. Nothing for a token that was ended, a key that is gone or has ended, and a
 * user whose row is gone.
 */
export function passedCaller(o: Opened, pass: FramePass): Caller | undefined {
  try {
    if (pass.for.kind === 'mcp') {
      const grant = grantAt(o, pass.for.id)
      return grant ? grantCaller(o, grant) : undefined
    }
    if (pass.for.kind === 'key') {
      const key = keyAt(o, pass.for.id)?.key
      if (!key || (key.expiresAt && key.expiresAt.getTime() <= o.clock.now())) return undefined
      return keyCaller(o, key)
    }
    return callerWritten(o, pass.for.id)
  } catch {
    return undefined
  }
}

const kind = 'frame'

// What a pass starts with, which no key, no token and no text of the engine does: so a machine knows one by its form.
const mark = 'pass.'

/**
 * Takes an app, the caller of a screen's tool and the record of the page it was answered. Answers the pass of the
 * frame that shows it: a text that only this engine can make and read, for that caller, the queries that the answer
 * read and the files that their answers name, as `mcp.only` narrows them. Nothing for a caller with no user, who
 * needs none.
 */
export function framePassOf(o: Opened, caller: Caller, page: Page): string | undefined {
  const made = caller.user ? passedFor(caller) : undefined
  if (made === undefined) return undefined
  const asked = [...new Set(page.answers.map((one) => one.what))].sort()
  const files = [
    ...new Set(
      page.answers.flatMap((one) => filesIn(answerOf(o.description, one.what), one.value, '').map((held) => held.id)),
    ),
  ].sort()
  const { reads, members } = narrowedByOnly(o, asked, membersOf(o.description, page.screen))
  return `${mark}${madeText(o, kind, { for: made, reads, files, uploads: uploadsAs(caller), members })}`
}

// The addresses where a browser sets no header of its own, at which a pass is read from the address.
const inAddress = (path: string): boolean =>
  path === '/_t/live' || /^\/_t\/files\/[^/]+$/.test(path) || /^\/_t\/img\/[^/]+$/.test(path)

/**
 * Takes an app and a request. Answers what the pass of a frame that the request carries holds: as
 * `Authorization: Bearer`, or as `?pass=` at a file, at a picture of one and at the live connection. Nothing for
 * a request with no pass, and for one whose pass did not open or is older than `askTime`.
 */
export function framePassIn(o: Opened, request: Request): FramePass | undefined {
  const url = new URL(request.url)
  const line = request.headers.get('authorization')
  const text = line?.startsWith('Bearer ')
    ? line.slice(7)
    : inAddress(url.pathname)
      ? url.searchParams.get('pass')
      : null
  if (!text?.startsWith(mark)) return undefined
  const read = readText(o, kind, text.slice(mark.length), storedLimit(o.description, 'askTime'))
  const made: unknown = read?.for
  if (!read || !isStored(made) || !Array.isArray(read.reads) || !Array.isArray(read.files)) return undefined
  if ((made.kind !== 'mcp' && made.kind !== 'key' && made.kind !== 'user') || typeof made.id !== 'string')
    return undefined
  return {
    for: { kind: made.kind, id: made.id },
    reads: read.reads.map(String),
    files: read.files.map(String),
    uploads: read.uploads === true,
    members: Array.isArray(read.members) ? read.members.map(String) : [],
  }
}

/**
 * Whether a request seems to carry the pass of a frame, by its form alone, as a reader that cannot open one tells it:
 * a bearer that starts as a pass does, or `?pass=` where a pass is read from the address.
 */
export function carriesPass(request: Request): boolean {
  const url = new URL(request.url)
  const line = request.headers.get('authorization')
  if (line?.startsWith(`Bearer ${mark}`)) return true
  return inAddress(url.pathname) && url.searchParams.has('pass')
}

/**
 * Whether a pass lets a request in: a read of a query that the screen's answer read, a read and a call of a member
 * that the screen names, a file and a picture of a file that its answers named, an upload where the caller it was
 * made for could upload, and the live connection. A pass makes no other call.
 */
export function passLets(pass: FramePass, request: Request): boolean {
  const path = new URL(request.url).pathname
  const read = /^\/_t\/(read|call)\/([^/]+)$/.exec(path)
  const name = read ? decodeURIComponent(read[2]) : ''
  if (read && request.method !== 'POST') return false
  if (read) return pass.members.includes(name) || (read[1] === 'read' && pass.reads.includes(name))
  const file = /^\/_t\/(files|img)\/([^/]+)$/.exec(path)
  if (file) return request.method === 'GET' && pass.files.includes(decodeURIComponent(file[2]))
  return path === '/_t/live' || (path === '/_t/files' && request.method === 'POST' && pass.uploads)
}

/** Whether a request carries a pass of a frame and no cookie at all: such a request is not held to the origin rules. */
// A reader cannot open a pass and hands its request on whole: the writer holds the pass to its rules there.
export const passedWithNoCookie = (o: Opened, request: Request): boolean =>
  !request.headers.has('cookie') && (o.machine.reader ? carriesPass(request) : framePassIn(o, request) !== undefined)

/** The part of a screen tool's answer that the frame alone is handed: how often it asks again, and how long its pass is good for. */
export const frameTimes = (o: Opened): Record<string, number> => ({
  ask: storedLimit(o.description, 'frameAsk'),
  life: storedLimit(o.description, 'askTime'),
})
