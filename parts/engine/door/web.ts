import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { list } from '../addresses/list.ts'
import { answering } from '../answering.ts'
import { bounded } from '../bounded.ts'
import type { Taken } from '../copy/door.ts'
import { limitOf, storedLimit } from '../limits.ts'
import { passedWithNoCookie } from '../mcp/framePass.ts'
import { throughOwn } from '../onRequest.ts'
import type { Opened } from '../opened.ts'
import { projectCode } from '../ownCode.ts'
import { routeAt, routeSize } from '../routes.ts'
import { servedAt } from '../served.ts'
import type { Visit } from '../visit.ts'
import { visiting } from '../visit.ts'
import { tooLarge } from '../web/body.ts'
import type { Addressed } from '../web/server.ts'
import type { About } from '../web/proxy.ts'
import { errorAnswer } from '../wire.ts'
import type { Address } from './address.ts'
import { asPage, mayBePage } from '../pages/asPage.ts'
import { namedCaller } from './caller.ts'
import { refusedCall } from './failure.ts'
import { counted } from './rate.ts'
import { toFrame, toSite } from './sites.ts'
import { adminCaller, withoutAdmin } from './adminCaller.ts'
import { countedAnswer, countedName, countedRequest } from '../counts/door.ts'
import { asPiece } from '../counts/cpu.ts'
import { doorEnded, doorSpan, nameDoor } from '../trace/door.ts'
import { insideSpan } from '../trace/span.ts'

// The addresses of the door, each with its name, in the order in which they are tried: loaded when the first
// request arrives.
let addresses: Promise<{ address: Address; named: string }[]> | undefined

const inOrder = (): Promise<{ address: Address; named: string }[]> => {
  addresses ??= Promise.all(list.map(async (one) => ({ address: (await one.load()).address, named: one.name }))).then(
    (loaded) => loaded.sort((a, b) => a.address.order - b.address.order),
  )
  return addresses
}

/** The error of a request for a name that is none of the app's own. */
export const wrongName = (host: string): TentError =>
  new TentError(
    'T0017',
    `The request names the host ${JSON.stringify(host).slice(0, 80)}, which is none of the names of this app.`,
    {
      fix: 'Reach the app by a name it was given: `address` of `engine.open`, or this computer where it was given none.',
    },
  )

/** Step 1 of the door: the request without every header that starts with `x-tent-`, which no part ever reads from a request. */
export function withoutOurs(request: Request): Request {
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('x-tent-')) headers.delete(name)
  return new Request(request, { headers })
}

/** Whether two origins are one: the same scheme, host and port, however each was written. */
export function sameOrigin(one: string, other: string): boolean {
  try {
    return new URL(one).origin === new URL(other).origin
  } catch {
    return false
  }
}

/** Whether an origin is the one a request was sent to, or one that `api.origins` of the project lists. */
export function ownOrListed(o: Opened, origin: string, about: About): boolean {
  if (sameOrigin(origin, about.origin)) return true
  const listed: unknown = Reflect.get(Object(o.description.project.api), 'origins')
  return Array.isArray(listed) && listed.some((one) => typeof one === 'string' && sameOrigin(origin, one))
}

/** Whether what is asked is an upload, whose bytes are handed on as they arrive. */
export const isUpload = (asked: Addressed): boolean =>
  asked.method === 'POST' && asked.path.split('?')[0] === '/_t/files'

/**
 * The most bytes that the body of a request may hold, by the address that was asked: `uploadSize` for the address
 * of an upload, and `callSize` for every other.
 */
export function sizeTaken(o: Opened, asked: Addressed, headers?: Headers): number {
  if (isUpload(asked)) return storedLimit(o.description, 'uploadSize')
  // An address that a program serves takes what the program states for the request, by its headers.
  const served = servedAt(o, asked.path.split('?')[0])
  if (served) return served.o.size(new Request(`http://served${asked.path}`, { headers: headers ?? new Headers() }))
  // A route that states a size of its own is sent that much, by the address that was asked.
  const route = routeAt(o, asked.method, asked.path.split('?')[0])
  return route ? routeSize(o, route.record) : limitOf(o.description, 'callSize')
}

/**
 * Step 2 of the door: the size limit and the origin. A body may not pass `callSize`. A request that changes
 * something, and carries an `Origin`, must name the scheme, the host and the port it was sent to, or an entry of
 * `api.origins`: `Origin: null` names no host and is refused. Throws T0003 and T0004.
 */
function sizeAndOrigin(o: Opened, request: Request, about: About, own?: ReturnType<NonNullable<Address['own']>>): void {
  const size = own?.size ?? sizeTaken(o, { method: request.method, path: new URL(request.url).pathname })
  if (Number(request.headers.get('content-length') ?? 0) > size) throw tooLarge(size)
  if (request.method === 'GET' || request.method === 'HEAD') return
  const origin = request.headers.get('origin')
  if (origin === null || ownOrListed(o, origin, about)) return
  // A pass of a frame is no cookie: no other site can send it, so a request with one and no cookie is let through.
  if (passedWithNoCookie(o, request)) return
  // The sites that the address itself names: `'null'` is one only where it is listed as such.
  if (
    own?.sites === 'any' ||
    (Array.isArray(own?.sites) && own.sites.some((one) => one === origin || sameOrigin(origin, one)))
  )
    return
  throw new TentError(
    'T0004',
    `The request came from ${JSON.stringify(origin).slice(0, 80)}, which is another site than ${about.origin}.`,
    {
      fix: 'Call the app from its own pages, or list the site in `api.origins` of the project.',
    },
  )
}

/** The address that a request is for, with what it read of the request and the caller of the request. */
interface Found {
  address: Address
  matched: object
  caller: Caller
}

/**
 * Takes an app, a request, and what the engine knows of it. Passes the request through the door: a request that
 * names a host which is none of the app's own is refused with T0017 before anything else is looked at; step 1
 * takes the `x-tent-` headers out; the address is found, and what no address names is not found; and the steps
 * of the web that the address passes are carried out, 2 to 4, before the address answers. A refusal is answered
 * in the wire form with its status, and for an address that passes step 10 it is written into the log. While it
 * is answered the request is held as under way, so that the live hub lets it go first.
 */
export function answerRequest(o: Opened, asked: Request, came: About): Promise<Response> {
  // A request is a piece of the door until it reaches a definition, which takes its place.
  const answered = answering(o, () => asPiece(o, 'door', undefined, () => throughDoor(o, asked, came), { weak: true }))
  // A person who opens an address that is refused on live data is shown a page of the engine, and no JSON.
  return mayBePage(o, asked) ? answered.then((answer) => asPage(o, asked, answer)) : answered
}

async function throughDoor(o: Opened, asked: Request, came: About): Promise<Response> {
  const began = performance.now()
  // What a reader added to a request it handed on is read and taken out before anything else is handed the request.
  let taken: Taken
  try {
    taken = o.machine.taken(asked, came)
  } catch (error) {
    return errorAnswer(o, 'door', o.web.names(came.host, came.scheme) ? error : wrongName(came.host))
  }
  // The handling of the request is the first span of its trace on this machine, or continues the trace it names.
  const span = doorSpan(o, taken.request, taken.about, taken.key === undefined ? undefined : (taken.trace ?? ''))
  const answer = await insideSpan(span, () => passedDoor(o, asked, taken, began))
  doorEnded(span, answer)
  return answer
}

/** The door past the headers of a reader: the name, the steps of the web, the address and its answer. */
async function passedDoor(o: Opened, asked: Request, taken: Taken, began: number): Promise<Response> {
  const { about } = taken
  // A request that a reader handed on, and one that carries a reader's key, was held to a name by the reader, or
  // names the address that the readers dial.
  const named = o.web.names(about.host, about.scheme) || taken.key !== undefined
  if (!named && !(o.web.own(about.host, about.scheme) && o.machine.carries(asked)))
    return errorAnswer(o, 'door', wrongName(about.host))
  // The bytes that the engine reads of the request are counted as they pass.
  let read = 0
  const first = countedRequest(withoutOurs(taken.request), (bytes) => {
    read = bytes
  })
  const here: Visit = { app: o, request: first, about, cookies: [], changed: false, answered: false }
  // The command line of this computer names its caller beside the admin token: the first way of step 3.
  let admin: Caller | undefined
  try {
    admin = adminCaller(o, first, about)
  } catch (error) {
    return errorAnswer(o, 'door', error)
  }
  /** Finds the address of a request and carries out the steps of the web that it passes, 2 to 4. */
  const passes = async (clean: Request): Promise<Found | Response> => {
    const { pathname } = new URL(clean.url)
    let found: { address: Address; matched: object; kind: string } | undefined
    for (const { address, named: kind } of await inOrder()) {
      const matched = address.match(clean)
      if (matched === false) continue
      found = { address, matched, kind }
      // What the bytes of the request are counted under, which a screen names once it knows its own.
      here.counted = { name: countedName(o, kind, matched) }
      break
    }
    if (!found)
      return errorAnswer(
        o,
        'door',
        new TentError('T0001', `Nothing answers ${clean.method} ${pathname.slice(0, 120)}.`, {
          fix: 'A call is a `POST` of JSON to `/_t/call/<name>`.',
        }),
      )
    const { address, matched } = found
    const told: unknown = Reflect.get(matched, 'name')
    const name = typeof told === 'string' ? told : pathname
    // The span of the door is named by the address it found, never by the path, which may hold values.
    nameDoor(found.kind)
    here.request = clean
    // Step 2 comes before the caller is told apart: a request that the origin rule refuses asks no code of the
    // builder and moves no session on.
    try {
      if (address.steps.includes(2)) sizeAndOrigin(o, clean, about, address.own?.(o, matched))
    } catch (error) {
      if (address.steps.includes(10)) refusedCall(o, name, { kind: 'nobody' }, began, error)
      // A request that the door refused before it reached a definition is the door's.
      here.counted = { name: 'door' }
      return (address.refused ?? errorAnswer)(o, name, error)
    }
    // Step 3: the first way of telling who calls that names one, for an address that passes it alone: a file of the
    // bundle, the health of the app and a command ask no way at all.
    let caller: Caller = { kind: 'nobody' }
    try {
      const who = !address.steps.includes(3)
        ? undefined
        : admin
          ? { caller: admin, by: 'admin' }
          : await namedCaller(o, clean, about)
      if (who) caller = who.caller
      if (who?.by !== undefined) here.by = who.by
    } catch (error) {
      if (address.steps.includes(10)) refusedCall(o, name, { kind: 'nobody' }, began, error)
      // A request that the door refused before it reached a definition is the door's.
      here.counted = { name: 'door' }
      return (address.refused ?? errorAnswer)(o, name, error)
    }
    try {
      if (address.steps.includes(4)) counted(o, caller, about.from)
    } catch (error) {
      if (address.steps.includes(10)) refusedCall(o, name, caller, began, error)
      // A request that the door refused before it reached a definition is the door's.
      here.counted = { name: 'door' }
      return (address.refused ?? errorAnswer)(o, name, error)
    }
    if (here.counted) here.counted.caller = caller
    return { address, matched, caller }
  }
  const answers = (clean: Request, { address, matched, caller }: Found): Promise<Response> =>
    address.handle({ app: o, request: clean, matched, about, caller, began })
  const door = (handed: Request): Promise<Response> =>
    visiting(here, () => o.machine.answered(withoutOurs(handed), about, began, taken, { passes, answers }))
  // A request that a reader handed on was handed to the code of the builder by the reader.
  const direct = taken.key !== undefined
  let answer: Response
  try {
    if (direct || !projectCode(o, 'onRequest')) answer = await door(first)
    else {
      // The size of a body is held before the code of the builder is handed the request, and while it reads one.
      const size = sizeTaken(o, { method: first.method, path: new URL(first.url).pathname })
      if (Number(first.headers.get('content-length') ?? 0) > size) throw tooLarge(size)
      // The builder's code is handed no admin token and no `Tent-Caller`, so it cannot send them on.
      const own = admin ? withoutAdmin(first) : first
      answer = await visiting(here, () => throughOwn(o, bounded(own, size), about, door))
    }
  } catch (error) {
    refusedCall(o, 'onRequest', { kind: 'nobody' }, began, error)
    answer = errorAnswer(o, 'onRequest', error)
  }
  here.answered = true
  // Every answer to a page of a site that `api.origins` lists names that site the same way.
  answer = toFrame(o, first, toSite(o, first, about, answer))
  const told = here.cookies.length ? withCookies(answer, here.cookies) : answer
  return countedAnswer(o, here, () => read, told)
}

/**
 * Answers a response with the cookies that the answering of its request set. An answer that leaves with a cookie
 * set on it is kept by no cache.
 */
function withCookies(answer: Response, cookies: string[]): Response {
  const headers = new Headers(answer.headers)
  for (const line of cookies) headers.append('set-cookie', line)
  headers.set('cache-control', 'no-store')
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}
