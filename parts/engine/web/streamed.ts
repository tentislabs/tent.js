import type { Readable as NodeReadable } from 'node:stream'
import { Readable } from 'node:stream'

/**
 * Takes a stream of the runtime's own kind: a file of the disk, or the body of a request. Answers it as a standard
 * stream of bytes that reads a part only when it is asked for one: a reader that is slow holds no more than one part.
 */
export function streamed(from: NodeReadable): ReadableStream<Uint8Array> {
  const parts = Readable.toWeb(from).getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await parts.read()
      if (done) controller.close()
      else controller.enqueue(new Uint8Array(value))
    },
    cancel: () => parts.cancel(),
  })
}
