/**
 * The header by which an answer says that its body is sent piece by piece as each piece comes, and never held
 * whole. The web side takes it off before the answer leaves.
 */
export const flowsHeader = 'x-tent-flows'

/**
 * Takes the first piece of a body and the pieces that follow it. Answers the body as a stream of bytes that asks
 * for the next piece only when the one before was read, and stops asking where the reader gives up.
 */
export function flowingBody(first: string, rest: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const pieces = rest[Symbol.asyncIterator]()
  const bytes = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.encode(first))
    },
    async pull(controller) {
      // An empty piece is passed over: a pull that enqueues nothing would not be asked again.
      for (;;) {
        const next = await pieces.next()
        if (next.done) return controller.close()
        if (next.value !== '') return controller.enqueue(bytes.encode(next.value))
      }
    },
    async cancel() {
      await pieces.return?.(undefined)
    },
  })
}
