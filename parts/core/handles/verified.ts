import type { Marker } from '../definition.ts'
import { member } from '../handle.ts'
import type { Secret } from '../helpers/references.ts'

/** What checks the signature of a request: the `signature` of a service, or a scheme with its secret. */
type Signature = Marker | { scheme: unknown; secret: Secret }

type Check = (
  request: Request,
  signature: Signature,
  o?: { once?: boolean },
) => Promise<{ id?: string; body: Uint8Array; seen?: true }>

const check: Check = member('verified', 'check')

/**
 * Takes the request of a route, and what checks its signature. Answers a promise of the id of the call and the
 * exact bytes that arrived. The check is the engine's: the call is forwarded to its working object.
 */
export const verified: Check = (request, signature, o) => check(request, signature, o)
