import type { GuardedFetch } from '../../connect/index.ts'

/** The bytes that the requests of one try sent and read, as the engine counts them for its model. */
export interface Bytes {
  in: number
  out: number
}

/** How many bytes a body that is sent holds, where that can be told before it is sent: a stream counts as none. */
function sentBytes(body: unknown): number {
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return body.byteLength
  if (body instanceof Blob) return body.size
  return 0
}

/**
 * Takes the guarded fetch and the bytes of one try. Answers a fetch that adds what each request sends to `out`, and
 * what is read of each answer to `in`, as its body passes.
 */
export function countingFetch(fetch: GuardedFetch, bytes: Bytes): GuardedFetch {
  return async (address, init) => {
    bytes.out +=
      sentBytes(init?.body) ||
      (address instanceof Request && address.body ? (await address.clone().arrayBuffer()).byteLength : 0)
    const answer = await fetch(address, init)
    if (!answer.body) return answer
    const reader = answer.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async pull(line) {
        const part = await reader.read()
        if (part.done) return line.close()
        bytes.in += part.value.byteLength
        line.enqueue(part.value)
      },
      cancel: (reason) => reader.cancel(reason),
    })
    return new Response(body, { status: answer.status, statusText: answer.statusText, headers: answer.headers })
  }
}
