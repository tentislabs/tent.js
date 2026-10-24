// The exact bytes that arrived with the request of a route whose file imports `verified`, by the request it was
// handed: `verified` checks them after the route read the body.
const kept = new WeakMap<Request, Uint8Array>()

/** Keeps the bytes of the request of a route. */
export const keepBytes = (request: Request, bytes: Uint8Array): void => void kept.set(request, bytes)

/** The bytes that arrived with the request of a route, where that route keeps them. */
export const incomingBytes = (request: Request): Uint8Array | undefined => kept.get(request)
