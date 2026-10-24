import { randomBytes } from 'node:crypto'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { heldPlace } from '../liveDoor.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import type { KeptMcp } from './kept.ts'
import { keptOf } from './kept.ts'
import { grantAt } from '../grants/kept.ts'

// How often a kept stream is sent a sign of life.
const beat = 30_000

/** Who a caller is to a kept stream: the grant of a token, a key, a user, or the kind of a caller with neither. */
export function whoOf(caller: Caller): string {
  if (caller.grant) return `grant:${caller.grant.id}`
  if (caller.key) return `key:${caller.key.id}`
  return caller.user ? `user:${caller.user.id}` : caller.kind
}

const noStream = (): TentError =>
  new TentError('T7120', 'No kept stream of MCP is open to this client, so it cannot be asked.', {
    fix: 'The project states `mcp: { stream: true }`, and the client keeps its stream open.',
  })

/**
 * Opens a kept stream for a caller at `/mcp`: it holds one of the connections of its address, is sent a sign of
 * life every 30 seconds, the note that the tools changed when a new version goes live, and the requests that a
 * maker sends its client. Throws T0005 for one connection more than the address may hold.
 */
export async function listened(o: Opened, caller: Caller, about: About): Promise<Response> {
  const { mcpStream } = await import('../../connect/index.ts')
  const release = heldPlace(o, about.from)
  const all = keptOf(o)
  let timer: NodeJS.Timeout | undefined
  let stop: (() => void) | undefined
  const kept: KeptMcp = {
    who: whoOf(caller),
    waiting: new Map(),
    stream: mcpStream(() => {
      clearInterval(timer)
      stop?.()
      release()
      all.delete(kept)
      for (const one of kept.waiting.values()) one.fail(noStream())
    }),
  }
  all.add(kept)
  timer = setInterval(() => kept.stream.alive(), beat)
  timer.unref()
  // A stream stands no longer than the token it was opened with: the client opens it again with the next one.
  const ends = caller.grant ? grantAt(o, caller.grant.id)?.accessExpiresAt.getTime() : undefined
  if (ends !== undefined) stop = o.clock.setTimer(ends, () => kept.stream.close())
  return kept.stream.response
}

/**
 * `mcp.request(grant, method, params)` of a maker: sends a request of the standard down the kept stream of that
 * grant's client, and answers what the client answers, within `actionTime`. Fails with T7120 where no stream is
 * open, T0008 where the client does not answer in time, and T0009 where it answers a failure.
 */
export function mcpRequest(o: Opened, grant: string, method: string, params: object): Promise<unknown> {
  return requestDown(o, `grant:${grant}`, method, params) ?? Promise.reject(noStream())
}

/**
 * Sends a request of the standard down the kept stream of one who, and answers what the client answers, within
 * `actionTime`: a question to the person among them. Answers nothing where no stream of that who is open.
 */
export function requestDown(o: Opened, who: string, method: string, params: object): Promise<unknown> | undefined {
  const [kept] = [...keptOf(o)].filter((one) => one.who === who)
  if (!kept) return undefined
  const id = randomBytes(9).toString('base64url')
  return new Promise((done, fail) => {
    const timer = setTimeout(
      () => {
        kept.waiting.delete(id)
        fail(new TentError('T0008', `The client of MCP did not answer ${method} in time.`))
      },
      limitOf(o.description, 'actionTime'),
    )
    timer.unref()
    const settled = (): void => {
      clearTimeout(timer)
      kept.waiting.delete(id)
    }
    kept.waiting.set(id, {
      done: (value) => {
        settled()
        done(value)
      },
      fail: (error) => {
        settled()
        fail(error)
      },
    })
    kept.stream.ask(id, method, params)
  })
}

/** Hands a client's answer to the request of a maker that waits for it, where the caller is the one it was sent to. */
export function answeredBy(o: Opened, caller: Caller, message: Record<string, unknown>): void {
  const who = whoOf(caller)
  for (const one of keptOf(o)) {
    const waiting = one.who === who ? one.waiting.get(String(message.id)) : undefined
    if (!waiting) continue
    if (message.error !== undefined) {
      const said = isStored(message.error) ? String(message.error.message) : 'the client failed'
      waiting.fail(new TentError('T0009', `The client of MCP answered with a failure: ${said.slice(0, 200)}`))
    } else waiting.done(message.result)
    return
  }
}
