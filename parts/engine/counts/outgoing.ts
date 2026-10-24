import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { counting } from './door.ts'
import { gather } from './gather.ts'

/** How many bytes a body that is sent holds, where that can be told before it is sent: a stream counts as none. */
export function sentBytes(body: unknown): number {
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return body.byteLength
  if (body instanceof Blob) return body.size
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).byteLength
  return 0
}

/**
 * Takes an app, what is counted, its caller, what began and was sent, and the answer. Answers the answer, whose body
 * counts what is read of it, and books the call with its bytes once the body has passed: `calls`, `ms` up to the
 * answer, `bytesOut` of what was sent and `bytesIn` of what came back. With no answer it books the call as failed.
 */
export function countedOutgoing(
  o: Opened,
  name: string,
  caller: Caller,
  c: { began: number; sent: number },
  answer: Response | undefined,
): Response | undefined {
  const ms = performance.now() - c.began
  const book = (read: number): void =>
    gather(o, name, { calls: 1, ms, bytesOut: c.sent, bytesIn: read, ...(answer ? {} : { failed: 1 }) }, { caller })
  if (!answer?.body) {
    book(0)
    return answer
  }
  const counted = new Response(counting(answer.body, book), {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  })
  // What a fetch answers says where it came from, which the code that fetched may read.
  for (const name of ['url', 'redirected', 'type'])
    Object.defineProperty(counted, name, { value: Reflect.get(answer, name) })
  return counted
}
