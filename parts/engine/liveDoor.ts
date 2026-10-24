import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { caller as identify } from './callers/identify.ts'
import { adminCaller } from './door/adminCaller.ts'
import { counted } from './door/rate.ts'
import { appTokenIn } from './grants/caller.ts'
import { keyIn } from './keys/caller.ts'
import { framePassIn, passedCaller } from './mcp/framePass.ts'
import { ownOrListed, withoutOurs, wrongName } from './door/web.ts'
import type { Hub } from './hub/hub.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { projectCode } from './ownCode.ts'
import { callerWritten } from './program.ts'
import { visitorIn } from './visitor.ts'
import { carriesEngineCookie } from './cookies.ts'
import { sessionCaller } from './sessions.ts'
import { countedAs } from './web/names.ts'
import type { About } from './web/proxy.ts'

/** An opening of `/_t/live` that passed the door: the request as the steps left it, and who it is from. */
export interface LiveOpened {
  request: Request
  about: About
  // The user that the page says it was drawn for, where it names one.
  as: string | undefined
  // In development: the version that the page says it was drawn by.
  version?: string
  // Answers the caller of the request as they are now: a user who lost a role is the user without it.
  caller(): Caller
  // Gives up the place that the connection holds among those of its address. It is called once it is closed.
  release(): void
  // The fingerprint of the session that the connection was opened with: it is closed when that session ends.
  session?: string
  // The moment at which the connection is closed, where the project's own code named its caller.
  until?: number
  // Is settled once the caller is known, where the project's own code is asked for it: refused where that fails.
  named?: Promise<void>
  // The queries that a connection opened with the pass of a frame may watch: those its screen's answer read.
  only?: string[]
}

/** The caller that the admin token and `Tent-Caller` name, as a key answers one; nothing for any other request. */
function adminOf(o: Opened, request: Request, about: About): { caller: Caller } | undefined {
  try {
    const caller = adminCaller(o, request, about)
    return caller ? { caller } : undefined
  } catch {
    return undefined
  }
}

// How many live connections each address holds, for each app that has one.
const held = new WeakMap<Opened, Map<string, number>>()

/**
 * Takes one of the connections that an address may hold at once, for a live connection and for a kept stream of
 * MCP alike. Answers what gives it up again, once. Throws T0005 for one more than `liveConnections`.
 */
export function heldPlace(o: Opened, from: string): () => void {
  const limit = storedLimit(o.description, 'liveConnections')
  const address = countedAs(from)
  const counts = held.get(o) ?? new Map<string, number>()
  held.set(o, counts)
  const open = counts.get(address) ?? 0
  if (open >= limit)
    throw new TentError(
      'T0005',
      `The address ${address} holds ${limit} live connections at once, and asked for one more.`,
      {
        fix: 'Close a page, or raise `liveConnections` in `project.limits`.',
      },
    )
  counts.set(address, open + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (counts.get(address) ?? 1) - 1
    if (left > 0) counts.set(address, left)
    else counts.delete(address)
  }
}

/**
 * Takes an app, the request that asks for `/_t/live`, and what the engine knows of it. Passes it through steps 1
 * to 4 of the door, with the `Origin` checked whatever the request is: it must name the host it was sent to, or a
 * site that `api.origins` lists, but for a key on a request with no `Origin` and no cookie of the engine. Answers the opening, which holds one of the connections that its address may
 * hold. Throws T0017 for a host that is none of the app's, T0004 for another site and for no `Origin` at all,
 * and T0005 for one request, or one connection, more than the caller and the address may have.
 */
export function liveOpened(o: Opened, asked: Request, came: About): LiveOpened {
  let taken: ReturnType<Opened['machine']['taken']>
  try {
    taken = o.machine.taken(asked, came)
  } catch (error) {
    throw o.web.names(came.host, came.scheme) ? error : wrongName(came.host)
  }
  const { about } = taken
  if (!o.web.names(about.host, about.scheme) && taken.key === undefined) throw wrongName(about.host)
  // A watch cannot be handed to the writer, so a reader that may not answer by itself takes no live connection.
  const { reader } = o.machine
  if (reader && !(reader.whole() && reader.current()))
    throw new TentError('T0029', 'This machine opens no live connection for now: it is a reader that is not current.', {
      fix: 'Ask again in a moment, or ask the writer.',
    })
  const request = withoutOurs(taken.request)
  // A browser does not hold a WebSocket to the rule that keeps one site's pages from reading another's: this does.
  const origin = request.headers.get('origin')
  // A program is the exception: a key, on a request that carries no `Origin` and no cookie of the engine.
  const program =
    origin === null && !carriesEngineCookie(request)
      ? (keyIn(o, request) ?? appTokenIn(o, request, about.origin) ?? adminOf(o, request, about))
      : undefined
  // A pass of a frame of a chat app is no cookie either: no other site can send it, so its frame may be of any.
  const framed = !carriesEngineCookie(request) ? framePassIn(o, request) : undefined
  if (!program && !framed && (origin === null || !ownOrListed(o, origin, about)))
    throw new TentError(
      'T0004',
      origin === null
        ? 'The live connection was asked for with no `Origin`, as no page of the app asks for it.'
        : `The live connection was asked for from ${JSON.stringify(origin).slice(0, 80)}, which is another site than ${about.origin}.`,
      { fix: 'Open the live connection from a page of the app, or list the site in `api.origins` of the project.' },
    )
  // Step 3. A session names the caller at once. Where none does and there is an `identify`, the caller is known
  // once that code has answered: the connection is served from then on.
  let identified: string | undefined
  const caller = (): Caller => {
    // A key is read again each time: one that was removed or has ended is nobody from then on.
    if (program)
      return (
        (keyIn(o, request) ?? appTokenIn(o, request, about.origin) ?? adminOf(o, request, about))?.caller ?? {
          kind: 'nobody',
        }
      )
    // A pass is read again each time too: one past its time is nobody from then on.
    if (framed) {
      const pass = framePassIn(o, request)
      return (pass && passedCaller(o, pass)) ?? { kind: 'nobody' }
    }
    const found = sessionCaller(o, request, about)?.caller
    // A caller who is nobody keeps the visitor of their cookie, as at the door, so they follow their own runs.
    const visitor = visitorIn(o, request, about)
    const nobody: Caller = { kind: 'nobody', ...(visitor === undefined ? {} : { visitor }) }
    if (found || identified === undefined) return found ?? nobody
    try {
      return callerWritten(o, identified)
    } catch {
      return { kind: 'nobody' }
    }
  }
  const first = caller()
  const session = sessionCaller(o, request, about)?.session
  // The `identify` of the program that holds the app is asked in place of the project's, as at the door.
  const asks = first.kind === 'nobody' && (o.identify !== undefined || projectCode(o, 'identify') !== undefined)
  if (!asks) counted(o, first, about.from)
  const release = heldPlace(o, about.from)
  const opened: LiveOpened = {
    request,
    about,
    as: new URL(request.url).searchParams.get('as') ?? undefined,
    ...(new URL(request.url).searchParams.has('version')
      ? { version: String(new URL(request.url).searchParams.get('version')) }
      : {}),
    caller,
    release,
    ...(session === undefined ? {} : { session }),
    ...(framed ? { only: framed.reads } : {}),
  }
  if (asks)
    opened.named = Promise.resolve(identify.find(request, o, about)).then((found) => {
      identified = found?.user?.id
      // A login that ended elsewhere ends here too: the connection is closed after a while, and asked for anew.
      if (found) opened.until = o.clock.now() + storedLimit(o.description, 'identifyKept')
      counted(o, caller(), about.from)
    })
  return opened
}

// The hub of each app that a live connection was opened to: its code is loaded with the first one.
const hubs = new WeakMap<Opened, Promise<Hub>>()

/** Answers the live hub of an app, which is made, and its code loaded, when the first live connection asks for it. */
export function hubOf(o: Opened): Promise<Hub> {
  let hub = hubs.get(o)
  if (!hub) {
    hub = import('./hub/hub.ts').then(({ makeHub }) => makeHub(o))
    hubs.set(o, hub)
  }
  return hub
}
