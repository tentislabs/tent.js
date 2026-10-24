import type { GuardedFetch } from '../connect/index.ts'
import { TentError } from '../core/index.ts'
import { blobsType } from './blobsBody.ts'

/** A server that is published to, pushed to and pulled from: its address, and the key of a right there. */
export interface Target {
  address: string
  key: string
}

// How long one request to a target may take, and how many bytes its answer may hold: the most a server takes.
const asLong = 600_000
const asLarge = 1_073_741_824 + 1_048_576

/** The error that a target answered, as it was sent: its code, its words and its fields. */
function refusal(sent: unknown, status: number): TentError {
  const error = Object(sent)
  const fields = typeof error.fields === 'object' && error.fields !== null ? { fields: error.fields } : {}
  return new TentError(
    typeof error.code === 'string' ? error.code : 'T0009',
    typeof error.message === 'string' ? error.message : `The target answered ${status}.`,
    { ...fields, ...(typeof error.fix === 'string' ? { fix: error.fix } : {}) },
  )
}

/**
 * Sends one request to an address of a target, with its key, and answers its value: what the answer holds in the
 * wire form, or the bytes of blobs where the target answers them. Throws the error the target answered, with its
 * code, and T0009 for an answer that is neither.
 */
export async function asked(o: { to: Target; fetch: GuardedFetch }, path: string, body: unknown): Promise<unknown> {
  const bytes = body instanceof Uint8Array
  const answer = await o.fetch(new URL(path, o.to.address), {
    method: 'POST',
    headers: { authorization: `Bearer ${o.to.key}`, 'content-type': bytes ? blobsType : 'application/json' },
    body: bytes ? new Uint8Array(body) : JSON.stringify(body),
    size: asLarge,
    time: asLong,
  })
  if ((answer.headers.get('content-type') ?? '').startsWith(blobsType) && answer.ok)
    return new Uint8Array(await answer.arrayBuffer())
  let read: unknown
  try {
    read = await answer.json()
  } catch {
    throw new TentError(
      'T0009',
      `${path} of ${o.to.address} answered ${answer.status} with no answer of the wire form.`,
    )
  }
  const wire = Object(read)
  if (wire.ok === true) return wire.value
  throw refusal(wire.error, answer.status)
}
