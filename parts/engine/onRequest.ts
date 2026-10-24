import { TentError } from '../core/index.ts'
import type { CallContext, Work } from './context.ts'
import { within } from './context.ts'
import { limitOf } from './limits.ts'
import type { Opened } from './opened.ts'
import { projectCode } from './ownCode.ts'
import { callIn } from './rooms/calls.ts'
import { operated } from './addresses/operated.ts'
import { sentKey } from './keys/form.ts'
import type { About } from './web/proxy.ts'

/** Hands a request on, and answers a promise of what it was answered. */
type Next = (request: Request) => Promise<Response>

/** The function that every request is handed first: of a project, or of a program that holds apps. */
export type OnRequest = (
  request: Request,
  next: Next,
  about: { from: string; origin: string },
) => Response | Promise<Response>

// The addresses that the code of a builder is never handed: the commands of this computer, the link between a
// writer and its readers, and the link of a worker.
const never = ['/_t/admin', '/_t/copy', '/_t/work']

/** Whether a request is one that `onRequest` is called for, by its address. */
export function isHanded(request: Request): boolean {
  const { pathname } = new URL(request.url)
  // The run commands and the log asked with a key of the right `operate` pass the door as every request does.
  if (operated.some((name) => pathname === `/_t/admin/${name}`) && sentKey(request) !== undefined) return true
  return !never.some((one) => pathname === one || pathname.startsWith(`${one}/`))
}

// The requests whose answering `onRequest` handed on under another address than the one asked, by what the
// engine knows of each, with the path that was asked: a page drawn for one is told it, and is kept for nobody.
const handedOn = new WeakMap<About, string>()

/** The path that was asked, where `onRequest` handed the answering of a request on under another address. */
export const askedBefore = (about: About): string | undefined => handedOn.get(about)

/** What the door answered, with headers that the code of a builder may change. */
const open = (answer: Response): Response =>
  new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: new Headers(answer.headers),
  })

/**
 * Takes the function of a builder, a request, what the engine knows of it, the most time that the function may
 * take, and what hands a request on to the door. Calls the function, and answers the response that it answers:
 * the one that `next` gave, changed or not, or one of its own. An answer to a request that was handed on under
 * another address than the one asked is kept by no cache. Throws T0008 where the function passes its time, and
 * T0009 where it answers what is no response.
 */
export async function handedFirst(
  own: OnRequest,
  request: Request,
  about: About,
  time: number,
  door: Next,
): Promise<Response> {
  const asked = new URL(request.url)
  const next: Next = async (handed) => {
    if (!(handed instanceof Request))
      throw new TentError('T0013', '`next` of `onRequest` takes the request to hand on.', {
        fix: 'Hand `next` the request that was asked, or a `Request` of another address.',
      })
    const to = new URL(handed.url)
    const elsewhere = to.pathname !== asked.pathname || to.search !== asked.search
    if (elsewhere) handedOn.set(about, asked.pathname)
    const answer = open(await door(handed))
    // What answers one address with another is true of that one request alone.
    if (elsewhere) answer.headers.set('cache-control', 'no-store')
    return answer
  }
  let timer: NodeJS.Timeout | undefined
  const timeUp = new Promise<never>((_, refuse) => {
    timer = setTimeout(
      () =>
        refuse(
          new TentError('T0008', '`onRequest` worked past the time of a call, `limits.actionTime` of the project.', {
            fix: 'Do less for each request, or raise `actionTime` in `project.limits`.',
          }),
        ),
      time,
    )
    timer.unref()
  })
  try {
    const answer = await Promise.race([
      (async () => own(request, next, { from: about.from, origin: about.origin }))(),
      timeUp,
    ])
    if (!(answer instanceof Response))
      throw new TentError('T0009', '`onRequest` answered what is no response.', {
        fix: 'Answer what `next(request)` gave, or a `Response` of your own.',
      })
    // An answer that leaves with a cookie, as the code of the builder may add one, is kept by no cache.
    if (!answer.headers.has('set-cookie') || answer.headers.get('cache-control') === 'no-store') return answer
    const kept = open(answer)
    kept.headers.set('cache-control', 'no-store')
    return kept
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Takes an app, a request after step 1 of the door, what the engine knows of it, and what hands a request on to
 * the door. Where the project of the running version states `onRequest`, and the request is one that it is called
 * for, has that function answer, with a call under way, so that it reads the settings and the secrets and writes
 * to the log. Answers what the door answers otherwise.
 */
export function throughOwn(o: Opened, request: Request, about: About, door: Next): Promise<Response> {
  const own = projectCode(o, 'onRequest')
  if (!own || !isHanded(request)) return door(request)
  const time = limitOf(o.description, 'actionTime')
  const work: Work = {
    name: 'onRequest',
    kind: 'action',
    depth: 1,
    now: new Date(o.clock.now()),
    ends: performance.now() + time,
  }
  const cx: CallContext = {
    app: o,
    version: o.version,
    caller: { kind: 'nobody' },
    made: 0,
    signal: new AbortController().signal,
    work,
  }
  const asked: OnRequest = async (...handed) => {
    const answer = await callIn(cx, o.room, own, handed, false, false)
    if (!(answer instanceof Response)) throw new TentError('T0009', '`onRequest` answered what is no response.')
    return answer
  }
  return within(cx, () => handedFirst(asked, request, about, time, door))
}

/**
 * Takes an app, the request that opens its live connection, what the engine knows of it, and the function of the
 * program that holds the app, where it has one. Each function that there is is asked, the program's first: it lets
 * the opening pass by handing the request on, and refuses it by answering itself. It cannot change the answer.
 * Throws T3101 for an opening that one of them refused.
 */
export async function liveAsked(o: Opened, request: Request, about: About, program?: OnRequest): Promise<void> {
  if (!program && !projectCode(o, 'onRequest')) return
  let passed = false
  const app: Next = (handed) =>
    throughOwn(o, handed, about, async () => {
      passed = true
      return new Response(null)
    })
  await (program ? handedFirst(program, request, about, limitOf(o.description, 'actionTime'), app) : app(request))
  if (!passed)
    throw new TentError('T3101', 'The opening of the live connection was refused by `onRequest`.', {
      fix: 'Hand the request of `/_t/live` on with `next(request)`.',
    })
}
