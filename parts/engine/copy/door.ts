import { TentError } from '../../core/index.ts'
import { bearerOf } from '../bearer.ts'
import type { Answering } from '../door/address.ts'
import { logName, newRef } from '../door/failure.ts'
import { handed, notHanded, saysMore, withoutHanded } from '../door/handed.ts'
import { isUpload } from '../door/web.ts'
import { countedFor } from '../door/rate.ts'
import { callerOf } from '../door/rule.ts'
import { epochNumber, manyLimit, newer } from '../held.ts'
import type { Opened } from '../opened.ts'
import { carriesPass } from '../mcp/framePass.ts'
import { pageKind } from '../pages/reader.ts'
import { routeAt } from '../routes.ts'
import { visit } from '../visit.ts'
import type { About } from '../web/proxy.ts'
import { errorAnswer } from '../wire.ts'
import type { Underway } from './asked.ts'
import { asAsked, isNeedsWriter, newAsked } from './asked.ts'
import type { ReaderKey } from './keys.ts'
import { readerKeyIn } from './keys.ts'
import type { Mark } from './marks.ts'
import { joinMarks, markOf, markText, neededBy, tablesRead, wroteMark } from './marks.ts'
import { notReached } from './reach.ts'
import { notWriting } from './writerState.ts'
import { readerCarries } from '../onlyReads.ts'
import { apiNameOf, offeredToApi } from '../../core/internal.ts'
import { readerJoins } from '../keys/readerKeys.ts'
import { parentHeader } from '../trace/ids.ts'
import { parentNow } from '../trace/span.ts'

// The headers of a request that whoever sends it on sets itself.
const perHop = ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']

/** What a machine took from a request before any other code was handed it. */
export interface Taken {
  request: Request
  about: About
  // The reader that handed the request on, by its key.
  key?: ReaderKey
  // The ref under which the reader logs the request.
  ref?: string
  // The span of the reader that the request was handed on under, as a `traceparent` names one: a word of the link.
  trace?: string
}

/** The error of a request that was handed to a machine which is not the writer, or under another epoch than the writer's. */
const notTheWriter = (writer: string | undefined): TentError =>
  new TentError('T0030', 'This request was handed on to a machine that is not its writer, or under another epoch.', {
    fix: `Reach the writer${writer ? ` at ${writer}` : ''}.`,
  })

/**
 * Takes an app, a request and what the engine knows of it. Reads the headers that a reader adds to a request it
 * hands on, and takes them out, before any other code is handed the request. A writer believes a request whose
 * `Tent-Reader` names the key of a reader as coming from the address, by the scheme and under the name that
 * `Tent-For` states, and counts it for that key. Throws T0001 for such a header with no key behind it, T0030 for
 * a request that was handed on under another epoch or to a machine that is not the writer, and T0005 for one
 * request more than a reader's key may hand on in a minute.
 */
export function takerOf(o: Opened, request: Request, about: About): Taken {
  if (!handed.some((name) => request.headers.has(name))) return { request, about }
  const { clean, sent } = withoutHanded(request)
  const { writer, reader, keys } = o.machine
  const named = sent['tent-reader']
  // The key of a reader is one that `readers` of `open` names, or a row of the keys of the right `copy` or `far`.
  const key =
    named === null
      ? undefined
      : (readerKeyIn(keys, named) ??
        readerJoins(o, new Request('http://reader.invalid/', { headers: { authorization: `Bearer ${named}` } })))
  if (reader || !writer) {
    // A reader that was dialled as the writer says where the writer is: anything else is its sender's own request.
    if (key) throw notTheWriter(reader?.writer())
    return { request: clean, about }
  }
  if (!key) {
    if (!saysMore(sent)) return { request: clean, about }
    throw notHanded()
  }
  const epoch = sent['tent-epoch'] ?? ''
  if (epoch !== writer.epoch()) {
    if (newer(epoch, writer.epoch())) writer.heard(epoch)
    throw notTheWriter(undefined)
  }
  const limit = manyLimit(o.description, 'handedPerMinute')
  if (!countedFor(o, `handed:${key.id}`, limit))
    throw new TentError('T0005', `A reader handed more than ${limit} requests on in a minute.`, {
      fix: 'Raise `handedPerMinute` in `project.limits`, or run more readers.',
    })
  const [from, scheme, host] = (sent['tent-for'] ?? '').split(';').map((part) => part.trim())
  const believed: About =
    from && (scheme === 'http' || scheme === 'https') && host
      ? { from, scheme, host, origin: `${scheme}://${host}`, proxied: true }
      : { ...about, proxied: true }
  const ref = /^[0-9a-z]{8}$/.test(sent['tent-ref'] ?? '') ? String(sent['tent-ref']) : undefined
  const trace = sent['tent-trace'] ?? undefined
  return {
    request: clean,
    about: believed,
    key,
    ...(ref ? { ref } : {}),
    ...(trace ? { trace } : {}),
  }
}

/** Whether a request carries the key of a reader, as an address of the link is asked with one. */
export const carriesKey = (o: Opened, request: Request): boolean =>
  readerKeyIn(o.machine.keys, bearerOf(request)) !== undefined || readerJoins(o, request) !== undefined

/** The function that an address of the API reaches, by its own name or by the one `api.names` gives it. */
function apiFunction(o: Opened, pathname: string): string | undefined {
  let name = pathname.slice('/api/'.length)
  try {
    name = decodeURIComponent(name)
  } catch {
    return undefined
  }
  return offeredToApi(o.description).find((one) => apiNameOf(o.description, one.name) === name)?.name
}

/** What a machine is asked for, as far as it decides who answers. */
type Kind = 'own' | 'health' | 'reads' | 'writes'

/** Says what a request asks for: an address that each machine answers itself, a read that a reader answers, or anything else. */
function kindOf(o: Opened, request: Request): { kind: Kind; name?: string } {
  const { pathname } = new URL(request.url)
  if (pathname === '/_t/copy' || pathname.startsWith('/_t/copy/') || /^\/_t\/admin(\/|$)/.test(pathname))
    return { kind: 'own' }
  if (pathname === '/_t/health') return { kind: 'health' }
  // The pass of a frame opens only on the machine that made it, and that is the writer, which answers `/mcp`.
  if (carriesPass(request)) return { kind: 'writes' }
  // A route is the writer's: its code runs there alone, whatever method it states.
  if (routeAt(o, request.method, pathname)) return { kind: 'writes' }
  // A page: a screen, a read from one, and a file of the bundle.
  const page = pageKind(o, request)
  if (page) return page
  // A function of the API is read where it only reads, as at `/_t/call/`.
  if ((request.method === 'GET' || request.method === 'POST') && pathname.startsWith('/api/')) {
    const asked = apiFunction(o, pathname)
    if (asked) return { kind: readerCarries(o, asked) ? 'reads' : 'writes', name: asked }
  }
  if (request.method !== 'POST' || !pathname.startsWith('/_t/call/')) return { kind: 'writes' }
  let name = pathname.slice('/_t/call/'.length)
  try {
    name = decodeURIComponent(name)
  } catch {
    // A name that does not read names no function, and the writer says so.
  }
  return { kind: readerCarries(o, name) ? 'reads' : 'writes', name }
}

const cookieName = (o: Opened): string => `tent_wrote.${o.name}`

/** The mark that a request names: its cookie, its `Tent-After`, or both joined. */
function markIn(o: Opened, request: Request): Mark | undefined {
  const cookies = request.headers.get('cookie') ?? ''
  const cookie = cookies
    .split(';')
    .map((one) => one.trim())
    .find((one) => one.startsWith(`${cookieName(o)}=`))
  return joinMarks(markOf(cookie?.slice(cookieName(o).length + 1)), markOf(request.headers.get('tent-after')))
}

/** Adds to an answer where it stands, and the mark of what its request wrote, with the cookie while a far reader is joined. */
function marked(o: Opened, answer: Response, at: number, asked: Underway, request: Request, about: About): Response {
  const headers = new Headers(answer.headers)
  const epoch = epochNumber(o.machine.at().epoch)
  headers.set('tent-at', `${epoch}.${at}`)
  const wrote = wroteMark(epoch, asked.commits)
  if (wrote) {
    headers.set('tent-wrote', markText(wrote))
    if (o.machine.writer?.farJoined()) {
      const joined = joinMarks(markIn(o, request), wrote) ?? wrote
      const seconds = Math.ceil(manyLimit(o.description, 'behind') / 1000)
      const secure = about.scheme === 'https' ? '; Secure' : ''
      headers.append(
        'set-cookie',
        `${cookieName(o)}=${markText(joined)}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Lax${secure}`,
      )
    }
  }
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}

/** The code of the error that an answer holds in the wire form, or nothing. */
async function codeIn(answer: Response): Promise<unknown> {
  const body: unknown = await answer.json().catch(() => undefined)
  return Reflect.get(Object(Reflect.get(Object(body), 'error')), 'code')
}

/** Has a promise answered within a length of time on the clock of the app, or refused with what `late` makes. */
function within<Answer>(o: Opened, ms: number, work: Promise<Answer>, late: () => Error): Promise<Answer> {
  return new Promise((done, failed) => {
    const cancel = o.clock.setTimer(o.clock.now() + ms, () => failed(late()))
    work.then(
      (answer) => {
        cancel()
        done(answer)
      },
      (error) => {
        cancel()
        failed(error)
      },
    )
  })
}

const isNotReached = (error: unknown): error is TentError => error instanceof TentError && error.code === 'T0029'

// What the system says of a connection that was never taken: the request did not leave this machine.
const notTaken = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL']

/** Whether a request that failed never left this machine: no connection was taken for it. */
function neverLeft(error: unknown): boolean {
  const cause: unknown = Reflect.get(Object(error), 'cause')
  const code: unknown = Reflect.get(Object(cause), 'code')
  return typeof code === 'string' && (notTaken.includes(code) || code === 'UND_ERR_CONNECT_TIMEOUT')
}

/**
 * Takes a reader, a request with its body, and what the engine knows of it. Hands the request to the writer, as
 * it came, with the reader's own five headers, and passes the answer back once it has arrived whole. A far reader holds an
 * answer that names what it wrote until it has applied that write itself, for a moment at most. Answers T0029
 * where the writer cannot be reached, and where its answer did not arrive whole.
 */
async function handOn(
  o: Opened,
  request: Request,
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array> | null,
  about: About,
  began: number,
): Promise<Response> {
  const reader = o.machine.reader
  const { pathname, search } = new URL(request.url)
  if (!reader) return errorAnswer(o, pathname, notHanded())
  const address = reader.writer()
  const ref = newRef()
  const headers = new Headers(request.headers)
  for (const name of [...handed, ...perHop]) headers.delete(name)
  headers.set('tent-reader', reader.reads.key)
  headers.set('tent-epoch', reader.linked() ?? reader.epoch())
  headers.set('tent-for', `${about.from}; ${about.scheme}; ${about.host}`)
  headers.set('tent-ref', ref)
  // The writer's spans of the request stand in the trace of this machine's, under its span of the door.
  const parent = parentNow()
  if (parent) headers.set('tent-trace', parentHeader(parent))
  const carries =
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    body !== null &&
    !(body instanceof Uint8Array && !body.length)
  // The length of a body that was read is the reader's to state; an upload goes on as it arrives, at the length it states.
  const stated = request.headers.get('content-length')
  if (body instanceof Uint8Array && carries) headers.set('content-length', String(body.length))
  else if (carries && stated !== null) headers.set('content-length', stated)
  // An upload goes on as it arrives: the writer's `behind` counts from the moment its last byte was sent on.
  const sentWhole = Promise.withResolvers<void>()
  const streamed =
    carries && body instanceof ReadableStream
      ? body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ flush: () => sentWhole.resolve() }))
      : undefined
  if (!streamed) sentWhole.resolve()
  const how: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    ...(carries ? { body: streamed ?? body, duplex: 'half' } : {}),
  }
  const sent = new Request(`${address}${pathname}${search}`, how)
  const logged = (ok: boolean, code?: string): void =>
    void o.log.write('calls', {
      at: o.clock.now(),
      app: o.name,
      name: logName(o, pathname),
      kind: 'handed',
      ...callerOf({ kind: 'nobody' }),
      ms: Math.round(performance.now() - began),
      ok,
      ...(code ? { code } : {}),
      ref,
    })
  let answer: Response
  try {
    const behind = manyLimit(o.description, 'behind')
    const asking = o.machine.reached(address).request(sent)
    // How long a sender takes is bounded by `web.bodySpeed` at the door, and the writer may answer before the last byte.
    await Promise.race([asking, sentWhole.promise])
    // From here on the request may have left this machine: an answer that is late or broken says so.
    const head = await within(o, behind, asking, () => notReached(address, 'it did not answer in time', true))
    const body = await within(o, behind, head.arrayBuffer(), () =>
      notReached(address, 'its answer did not arrive whole in time', true),
    ).catch((error: unknown) => {
      throw isNotReached(error) ? error : notReached(address, `its answer did not arrive whole: ${String(error)}`, true)
    })
    const { status, statusText, headers: answered } = head
    answer = new Response(body.byteLength ? body : null, { status, statusText, headers: answered })
  } catch (error) {
    logged(false, 'T0029')
    // A request that this machine refused to send, and one whose connection was never taken, did not leave it.
    const failed = isNotReached(error)
      ? error
      : notReached(address, String(error), !(error instanceof TentError) && !neverLeft(error))
    return errorAnswer(o, pathname, failed)
  }
  logged(answer.ok)
  // A machine that says it is not the writer, or not under that epoch, was dialled wrongly: the caller may ask again.
  if (answer.status === 409 && (await codeIn(answer.clone())) === 'T0030')
    return errorAnswer(o, pathname, notReached(address, 'it is not the writer, or stands in another epoch'))
  const wrote = markOf(answer.headers.get('tent-wrote'))
  if (reader.reads.far && wrote) {
    const within = manyLimit(o.description, 'catchUp')
    await reader.untilApplied(Math.max(wrote.n ?? 0, ...(wrote.tables?.values() ?? [])), within)
    // A page that watches here is sent what the write changed no later than the answer of its call.
    await o.hub?.idle(within)
  }
  return answer
}

/**
 * Takes a reader, what a live connection was opened with, and a query with its input. Asks the writer for the
 * answer, as the read that a page of that connection sends, `POST /_t/read/<name>`, handed on under the cookies
 * and the key of the opening. Answers the value, and throws the error that the writer answered.
 */
export async function readOnWriter(
  o: Opened,
  opened: { request: Request; about: About; as?: string | undefined },
  query: string,
  input: unknown,
): Promise<unknown> {
  const { origin } = new URL(opened.request.url)
  const body = new Uint8Array(Buffer.from(JSON.stringify({ input, ...(opened.as ? { as: opened.as } : {}) })))
  const headers = new Headers({
    'content-type': 'application/json',
    origin: opened.request.headers.get('origin') ?? origin,
  })
  for (const name of ['cookie', 'authorization']) {
    const value = opened.request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  const request = new Request(`${origin}/_t/read/${encodeURIComponent(query)}`, { method: 'POST', headers, body })
  const answer = await handOn(o, request, body, opened.about, performance.now())
  const wire: Record<string, unknown> = Object(await answer.json())
  if (wire.ok === true) return wire.value
  const told: Record<string, unknown> = Object(wire.error)
  throw new TentError(
    typeof told.code === 'string' ? told.code : 'T0009',
    typeof told.message === 'string' ? told.message : 'The writer did not answer the read.',
  )
}

/** The bytes of the body of a request, so that the request can be carried out here and handed on after. */
const bodyBytes = async (request: Request): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await request.arrayBuffer())

/**
 * Takes an app, a request that passed the first steps of the door, what the engine knows of it, when it arrived,
 * and what answers it on this machine. Answers the request as the machines of the app answer it. An app on one
 * machine answers it at once. A writer answers once the writes that the answer rests on are settled, and says
 * where the answer stands. A reader answers what only reads, while it is current and holds what the request must
 * see, and hands everything else to the writer before any of it has run, and what met the writer's work after all.
 */
export async function answeredByMachines<Passed extends object>(
  o: Opened,
  request: Request,
  about: About,
  began: number,
  taken: Pick<Taken, 'key' | 'ref'>,
  door: Answering<Passed>,
): Promise<Response> {
  const { machine } = o
  const handle = async (asked: Request): Promise<Response> => {
    const passed = await door.passes(asked)
    return passed instanceof Response ? passed : door.answers(asked, passed)
  }
  if (machine.writer?.leases()) await machine.writer.ready()
  if (!machine.many()) return handle(request)
  const { kind, name } = kindOf(o, request)
  if (kind === 'own') return handle(request)
  const { pathname } = new URL(request.url)
  const { reader, writer } = machine
  if (writer) {
    await writer.ready()
    const state = writer.state()
    if (state !== 'writes')
      return marked(
        o,
        errorAnswer(o, name ?? pathname, notWriting(state, kind === 'writes', machine.own)),
        writer.n(),
        newAsked(),
        request,
        about,
      )
    const asked = newAsked(taken.ref)
    // The log of the writer holds whom a handed-on request came from, under the ref of the reader's own line.
    if (taken.key)
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'info',
        message: 'A reader handed a request on.',
        data: JSON.stringify({ from: about.from, reader: taken.key.id, ref: taken.ref }),
      })
    const answer = await asAsked(asked, () => handle(request))
    const at = writer.n()
    try {
      await machine.leaves(asked)
    } catch (error) {
      return marked(o, errorAnswer(o, name ?? pathname, error), at, asked, request, about)
    }
    return marked(o, answer, at, asked, request, about)
  }
  if (!reader) return handle(request)
  const epoch = epochNumber(reader.epoch())
  if (!reader.whole() || kind === 'health') {
    if (reader.whole() && reader.current())
      return marked(o, await handle(request), reader.applied(), newAsked(), request, about)
    const why = new TentError('T0029', 'This machine cannot answer for now: it is a reader that is not current.', {
      fix: 'Ask again in a moment, or ask the writer.',
    })
    return marked(o, errorAnswer(o, name ?? pathname, why), reader.applied(), newAsked(), request, about)
  }
  // The bytes of an upload are never held here: a reader makes no file, and hands the upload on as it arrives.
  const upload = isUpload({ method: request.method, path: new URL(request.url).pathname })
  const body = upload ? undefined : await bodyBytes(request)
  const fresh = (): Request =>
    new Request(request.url, { method: request.method, headers: request.headers, ...(body?.length ? { body } : {}) })
  // A reader passes steps 2 to 4 of the door itself, and counts the request in its own rates, before it answers
  // it or hands it on: what it refuses never crosses to the writer.
  const passed = await door.passes(fresh())
  if (passed instanceof Response) return passed
  const on = (): Promise<Response> => handOn(o, request, body ?? request.body, about, began)
  // A session that is due to be moved on is moved by the writer, for a request that a reader got.
  if (kind !== 'reads' || !reader.current() || visit()?.due) return on()
  // A read that names a mark waits a moment for the write it must see, and is handed to the writer where it does not arrive.
  const needed = neededBy(markIn(o, request), epoch, name === undefined ? undefined : tablesRead(o.description, name))
  if (needed > reader.applied() && !(await reader.untilApplied(needed, manyLimit(o.description, 'catchUp'))))
    return on()
  const asked = newAsked()
  const answer = await asAsked(asked, () => door.answers(fresh(), passed))
  const at = reader.applied()
  if (asked.needs) return on()
  try {
    await machine.leaves(asked)
  } catch (error) {
    if (isNeedsWriter(error)) return on()
    return marked(o, errorAnswer(o, name ?? pathname, error), at, asked, request, about)
  }
  return marked(o, answer, at, asked, request, about)
}
