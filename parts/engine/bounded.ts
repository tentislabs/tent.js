import { tooLarge } from './web/body.ts'

/**
 * Takes a request and the most bytes that its body may hold. Answers the request with its body as a stream that
 * fails with T0003 at the first byte past that size: so code of a builder that reads the body reads no more than
 * its address may be sent, also of a sender that states no length. A request with no body is answered as it is.
 */
export function bounded(request: Request, size: number): Request {
  if (!request.body) return request
  const reader = request.body.getReader()
  let read = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const part = await reader.read()
      if (part.done) return controller.close()
      read += part.value.byteLength
      if (read > size) {
        await reader.cancel()
        return controller.error(tooLarge(size))
      }
      controller.enqueue(part.value)
    },
    cancel: () => reader.cancel(),
  })
  // A body that is a stream is sent one way, which a request must be told.
  const how: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers: request.headers,
    body,
    duplex: 'half',
  }
  return new Request(request.url, how)
}
