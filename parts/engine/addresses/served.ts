import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { bounded } from '../bounded.ts'
import type { Address } from '../door/address.ts'
import { logCall } from '../door/failure.ts'
import { counted, countedFor } from '../door/rate.ts'
import { keyIn } from '../keys/caller.ts'
import { holdsRight } from '../keys/rights.ts'
import type { Opened } from '../opened.ts'
import type { Served } from '../served.ts'
import { servedAt } from '../served.ts'
import { visit } from '../visit.ts'
import { tooLarge } from '../web/body.ts'
import type { About } from '../web/proxy.ts'
import { plainAddress } from '../web/proxy.ts'
import { errorAnswer } from '../wire.ts'

// The names by which this computer reaches itself, whose requests need no secure connection.
const ownNames = ['localhost', '127.0.0.1', '[::1]']

/**
 * Whether a request may reach addresses of a program: over a secure connection, from this computer by one of its
 * own names, or where the app was told `insecure`. This computer is where the request came from, as a named proxy
 * says it, and never the host it states: a proxy names `localhost` as its host for whoever it serves.
 */
function reachable(o: Opened, about: About): boolean {
  const host = about.host.toLowerCase().replace(/:\d+$/, '')
  const from = plainAddress(about.from)
  const here = from === '::1' || /^127\.\d+\.\d+\.\d+$/.test(from)
  return about.scheme === 'https' || (here && ownNames.includes(host)) || o.machine.insecure
}

/** The failure of a request whose key holds none of the rights an address asks for: T9104, which names them. */
const noRight = (path: string, rights: string[]): TentError =>
  new TentError('T9104', `${path} needs a key with the right ${rights.map((one) => `\`${one}\``).join(' or ')}.`, {
    fields: { right: rights.join(',') },
    fix: 'Make a key with that right on the server, with `tent access key add <name> --right <right>`, and keep it with `tent login`.',
  })

/** The failure of a handler that worked past the time its program stated: T0008. */
const tooLong = (path: string, time: number): TentError =>
  new TentError('T0008', `${path} took more than ${time} ms.`, { fix: 'Send less in one request.' })

/** Carries the door's part out for a request to an address that a program serves, and has the program answer it. */
async function answered(o: Opened, request: Request, about: About, served: Served, began: number): Promise<Response> {
  const path = new URL(request.url).pathname
  let caller: Caller = { kind: 'nobody' }
  try {
    const size = served.o.size(request)
    if (Number(request.headers.get('content-length') ?? 0) > size) throw tooLarge(size)
    const found = keyIn(o, request)
    const asked = served.o.right(request)
    const rights = found?.key.rights
    if (!found || !rights || !holdsRight(rights, asked)) {
      // A request with no right is counted for its address, as one of nobody is.
      counted(o, { kind: 'nobody' }, about.from)
      throw noRight(path, asked)
    }
    caller = found.caller
    if (!countedFor(o, `served:${found.key.id}`, served.o.perMinute))
      throw new TentError('T0005', `More than ${served.o.perMinute} requests in a minute came with one key.`, {
        fix: 'Send fewer requests.',
      })
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, refuse) => {
      timer = setTimeout(() => refuse(tooLong(path, served.o.time)), served.o.time)
    })
    try {
      const answer = await Promise.race([
        served.handler({
          request: bounded(request, size),
          key: { id: found.key.id, rights },
          about: { from: about.from, origin: about.origin },
          mode: o.mode,
        }),
        late,
      ])
      logCall(o, { name: path, kind: 'served', caller, began })
      return answer
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    logCall(o, { name: path, kind: 'served', caller, began, error })
    return errorAnswer(o, path, error)
  }
}

/**
 * The addresses that a program serves for an app with `engine.serve`. The door does its part for them: steps 1 and
 * 2 with the size that the program states for the request, the key of step 3, which must hold one of the rights
 * the program asks for that request, the count of step 4 by the program's own number, and the row of the log of
 * step 10. Over a connection that is not secure they are not found, but from this computer's own names and in an
 * app that was told `insecure`.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const o = visit()?.app
    const path = new URL(request.url).pathname
    return o !== undefined && path.startsWith('/_t/') && servedAt(o, path) !== undefined && { name: path }
  },
  steps: [1],
  async handle({ app, request, about, began }) {
    const path = new URL(request.url).pathname
    const served = servedAt(app, path)
    if (!reachable(app, about) || !served)
      return errorAnswer(
        app,
        'door',
        new TentError('T0001', `Nothing answers ${request.method} ${path.slice(0, 120)}.`),
      )
    return answered(app, request, about, served, began)
  },
}
