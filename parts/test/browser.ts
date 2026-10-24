import type { Caller } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { drivenSession } from '../engine/index.ts'
import type { Fn, TestCaller } from './as.ts'

/** What a call, a read or an upload of a test browser answers: the wire form, whole. */
export interface WireAnswer {
  ok: boolean
  value?: unknown
  error?: { code: string; name: string; message: string; fields?: Record<string, string>; fix?: string }
  // `'changed'` where the call started or ended a session, or the caller is no longer the one the page names.
  caller?: string
}

/** What `app.browser` takes. */
export interface BrowserOptions {
  /** A user that this browser is from its first request, by a session made as `app.session` makes one: a caller, or the id of one. */
  as?: TestCaller
  /** The scheme and the name it reaches the app by: `http://localhost` where none is given. */
  origin?: string
  /** The address its requests come from: this computer where none is given. */
  from?: string
  /** The site that its requests say they come from, in `Origin`: its own where none is given. */
  site?: string
}

/**
 * A caller that is a browser: it keeps the cookies it is handed, has an address, and each request of it passes
 * every step of the door, in the program and with no network.
 */
export interface TestBrowser {
  /** Calls a function at `/_t/call/`, as a press of a page does. `as` states another user than the one of its last page. */
  call(fn: Fn, input?: unknown, o?: { as?: string }): Promise<WireAnswer>
  /** Reads a query or an action at `/_t/read/`, as a page asks it again. */
  read(fn: Fn, input?: unknown, o?: { as?: string }): Promise<WireAnswer>
  /** A request for a screen: its status, its headers and its HTML. The browser keeps the user that the page was drawn for. */
  page(path: string): Promise<{ status: number; headers: Record<string, string>; html: string }>
  /** Uploads a file at `/_t/files`, with the bytes as the body. */
  upload(
    bytes: Uint8Array<ArrayBuffer> | string,
    o: { name: string; kind?: string; for?: Fn; field?: string },
  ): Promise<WireAnswer>
  /** Any request: answers the standard response. */
  request(
    method: string,
    path: string,
    o?: { headers?: Record<string, string>; body?: string | Uint8Array<ArrayBuffer> },
  ): Promise<Response>
}

const nameOf = (fn: Fn): string => (typeof fn === 'string' ? fn : fn.definition)

/** The id of the user that a test named, or nothing for one that is no user. */
function userOf(named: TestCaller): string | undefined {
  if (typeof named === 'string') return named === 'nobody' || named === 'system' ? undefined : named
  const caller: Caller = named
  return caller.kind === 'user' ? caller.user?.id : undefined
}

/**
 * The prefix of the name of a cookie of the engine for a browser that reaches the app by that origin: over https a
 * browser takes it from this very site alone, and from the names of one parent where the project states a domain.
 */
function prefixOf(app: App, origin: string): string {
  if (!origin.startsWith('https:')) return ''
  const domain: unknown = Reflect.get(Object(app.description.project.cookies), 'domain')
  return typeof domain === 'string' && domain !== '' ? '__Secure-' : '__Host-'
}

/**
 * `app.browser(o)`: takes the test app, and the app as the engine holds it now, on which the session of `as` is made.
 * Answers a caller that is a browser. It is how a sign-in, a route and an upload are tested: what `app.as` hands
 * straight to step 5 of the door, a browser sends through steps 1 to 4 first.
 */
export const browser =
  (app: App, held: () => App) =>
  (o: BrowserOptions = {}): TestBrowser => {
    const origin = o.origin ?? 'http://localhost'
    const cookies = new Map<string, string>()
    // The user that its last page was drawn for, which a call and a read state as `as`.
    let drawnFor: string | undefined
    let shown = '/'
    // The session of `as` is made before the first request, and its cookie kept as the browser keeps any.
    let ready: Promise<void> | undefined

    /** Keeps what an answer set: a cookie with no life left is dropped. */
    const keep = (answer: Response): void => {
      for (const line of answer.headers.getSetCookie()) {
        const [pair, ...marks] = line.split(';').map((part) => part.trim())
        const at = pair.indexOf('=')
        const [name, value] = [pair.slice(0, at), pair.slice(at + 1)]
        if (marks.some((mark) => /^max-age=0$/i.test(mark)) || value === '') cookies.delete(name)
        else cookies.set(name, value)
      }
    }

    const send = async (
      method: string,
      path: string,
      more: { headers?: Record<string, string>; body?: string | Uint8Array<ArrayBuffer> } = {},
    ): Promise<Response> => {
      const headers = new Headers(more.headers)
      if (cookies.size && !headers.has('cookie'))
        headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
      // A browser says where a request that changes something comes from.
      if (method !== 'GET' && method !== 'HEAD' && !headers.has('origin')) headers.set('origin', o.site ?? origin)
      const body = more.body === undefined ? {} : { body: more.body }
      const request = new Request(new URL(path, origin), { method, headers, redirect: 'manual', ...body })
      const answer = await app.request(request, o.from === undefined ? undefined : { from: o.from })
      keep(answer)
      return answer
    }

    /** What the record of a page says of the user that it was drawn for. */
    const userIn = (record: unknown): string | undefined => {
      const id: unknown = Reflect.get(Object(Reflect.get(Object(record), 'user')), 'id')
      return typeof id === 'string' ? id : undefined
    }

    /** The record of a page that its HTML holds, where it holds one. */
    const recordIn = (html: string): unknown => {
      const record = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)?.[1]
      return record === undefined ? undefined : JSON.parse(record)
    }

    /** Asks for the screen that the browser shows again, as a page does whose caller changed, and keeps its user. */
    const again = async (): Promise<void> => {
      let path = shown
      // Where the screen sends the new caller on, as to the sign-in, the browser follows, as a page does.
      for (let hop = 0; hop < 5; hop++) {
        const answer = await send('GET', `/_t/screen?path=${encodeURIComponent(path)}`)
        const wire: unknown = await answer.json().catch(() => undefined)
        const value: unknown = Reflect.get(Object(wire), 'value')
        if (Reflect.get(Object(wire), 'ok') !== true) return
        const goTo: unknown = Reflect.get(Object(value), 'goTo')
        const leave: unknown = Reflect.get(Object(value), 'leave')
        // An address that the page loads whole shows the user of the page it is answered, and nobody without one:
        // an address outside the app holds no page of it.
        if (typeof leave === 'string') {
          const ours = leave.startsWith('/') && !leave.startsWith('//')
          const record = ours ? recordIn(await (await send('GET', leave)).text()) : undefined
          drawnFor = userIn(record)
          if (record !== undefined) shown = leave
          return
        }
        if (typeof goTo !== 'string') {
          if (Reflect.get(Object(value), 'screen') !== undefined) [shown, drawnFor] = [path, userIn(value)]
          return
        }
        path = goTo
      }
    }

    const opened = (): Promise<void> => {
      ready ??= (async () => {
        if (o.as === undefined) return
        const user = userOf(o.as)
        if (user === undefined) return
        // A session of a browser that the program drives: it ends no session of the user's own, and ends with the app.
        const { cookie } = drivenSession(held(), user)
        const split = cookie.indexOf('=')
        cookies.set(`${prefixOf(app, origin)}${cookie.slice(0, split)}`, cookie.slice(split + 1))
        drawnFor = user
      })()
      return ready
    }

    const asked = async (address: string, fn: Fn, input: unknown, how?: { as?: string }): Promise<WireAnswer> => {
      await opened()
      const as = how?.as ?? drawnFor
      const answer = await send('POST', `${address}${encodeURIComponent(nameOf(fn))}`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: input ?? {}, ...(as === undefined ? {} : { as }) }),
      })
      const wire: WireAnswer = await answer.json()
      if (wire.caller === 'changed') await again()
      return wire
    }

    return {
      call: (fn, input, how) => asked('/_t/call/', fn, input, how),
      read: (fn, input, how) => asked('/_t/read/', fn, input, how),
      async page(path) {
        await opened()
        const answer = await send('GET', path)
        const html = await answer.text()
        if (answer.status === 200) {
          shown = path
          drawnFor = userIn(recordIn(html))
        }
        return { status: answer.status, headers: Object.fromEntries(answer.headers), html }
      },
      async upload(bytes, how) {
        await opened()
        const asks = new URLSearchParams({ name: how.name })
        if (how.for !== undefined) asks.set('for', nameOf(how.for))
        if (how.field !== undefined) asks.set('field', how.field)
        const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
        const answer = await send('POST', `/_t/files?${asks}`, {
          headers: {
            'content-type': how.kind ?? 'application/octet-stream',
            'content-length': String(body.length),
          },
          body,
        })
        return answer.json()
      },
      async request(method, path, more) {
        await opened()
        return send(method, path, more)
      },
    }
  }
