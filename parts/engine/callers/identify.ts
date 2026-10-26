import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { createDb } from '../../data/index.ts'
import type { CallContext, Work } from '../context.ts'
import { underWay, within } from '../context.ts'
import { called } from '../door/call.ts'
import { countedFor } from '../door/rate.ts'
import { limitOf, storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { projectCode } from '../ownCode.ts'
import { callIn } from '../rooms/calls.ts'
import { callerWritten } from '../program.ts'
import { sealed } from '../values/seal.ts'
import { countedAs } from '../web/names.ts'
import type { About } from '../web/proxy.ts'

const system: Caller = { kind: 'system' }

/**
 * Asks `identify` of the project who a request is from. It is handed the request without its body, what the
 * engine knows of it, a `db` that reads with full access and answers promises, and `call`, which calls a function
 * as the system. It is held to `actionTime`, and what it throws fails the request. Answers the id it named.
 */
async function asked(o: Opened, arrow: (...handed: unknown[]) => unknown, request: Request, about: About) {
  const ends = new AbortController()
  const time = limitOf(o.description, 'actionTime')
  const work: Work = {
    name: 'identify',
    kind: 'action',
    depth: 0,
    now: new Date(o.clock.now()),
    ends: performance.now() + time,
  }
  const cx: CallContext = { app: o, version: o.version, caller: system, made: 0, signal: ends.signal, work }
  const db = createDb(o.files ?? o.store, o.description, system, 'async', o.rules, {
    system: true,
    now: () => o.clock.now(),
    ids: o.ids,
    ...sealed(o),
  })
  const handed = {
    request: new Request(request.url, { method: request.method, headers: request.headers }),
    about: { from: about.from, origin: about.origin },
    db: o.tenantFiles ? o.tenantFiles.waiting(db) : db,
    call: (fn: unknown, input?: unknown): unknown =>
      called(o, String(Reflect.get(Object(fn), 'definition')), input, { caller: system, parent: cx }),
  }
  let timer: NodeJS.Timeout | undefined
  const timeUp = new Promise<never>((_, refuse) => {
    timer = setTimeout(() => {
      ends.abort()
      refuse(
        new TentError('T0008', '`identify` worked past the time of a call, `limits.actionTime` of the project.', {
          fix: 'Ask the login that names the caller for less, or raise the limit in `project.limits`.',
        }),
      )
    }, time)
    timer.unref()
  })
  try {
    return await Promise.race([within(cx, async () => arrow(handed)), timeUp])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The way of telling who calls that is the project's own: asked last, where nothing before it named a caller. The
 * requests of one address that reach it are held to `limits.identifyPerMinute` before the code of the builder is
 * called: one more is T0005. An id that names no row of `users` is nobody. An error in it is T0009.
 */
export const caller = {
  order: 6,
  async find(request: Request, app: Opened, about: About): Promise<Caller | undefined> {
    // The program that holds the app may name its callers in place of the project: a product for its workspaces.
    const given = app.identify
    const own = given ? undefined : projectCode(app, 'identify')
    const arrow = given
      ? (handed: unknown) => Reflect.apply(given, undefined, [handed])
      : own && ((handed: unknown) => callIn(underWay(), app.room, own, [handed], false, false))
    if (!arrow) return undefined
    const limit = storedLimit(app.description, 'identifyPerMinute')
    if (!countedFor(app, `identify:${countedAs(about.from)}`, limit))
      throw new TentError('T0005', `More than ${limit} requests in a minute from one address asked who they are.`, {
        fix: 'Send fewer requests, or raise `identifyPerMinute` in `project.limits`.',
      })
    let named: unknown
    try {
      named = await asked(app, arrow, request, about)
    } catch (error) {
      if (error instanceof TentError && error.code === 'T0008') throw error
      // Whatever the code of the builder threw, a failure of ours among it, is an error of the app for this request.
      const failed = new TentError('T0009', `\`identify\` failed: ${error instanceof Error ? error.message : error}`, {
        fix: 'Mend `identify` of the project: it answers the id of a user, or nothing.',
      })
      failed.cause = error
      throw failed
    }
    if (typeof named !== 'string' || named === '' || named === 'system' || named === 'nobody') return undefined
    try {
      return callerWritten(app, named)
    } catch {
      return undefined
    }
  },
}
