/**
 * Takes a stream of bytes and how many of its first bytes are wanted. Reads at least them, and answers what it read,
 * whether that is the whole, and a stream of the whole that goes on from where it ended: so what the first
 * bytes say is known without the whole being held in memory.
 */
export async function headed(
  stream: ReadableStream<Uint8Array>,
  size: number,
): Promise<{ head: Uint8Array; ended: boolean; all: ReadableStream<Uint8Array> }> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let held = 0
  let ended = false
  while (held <= size) {
    const { done, value } = await reader.read()
    if (done) {
      ended = true
      break
    }
    parts.push(value)
    held += value.byteLength
  }
  const read = new Uint8Array(Buffer.concat(parts))
  const all = new ReadableStream<Uint8Array>({
    start(controller) {
      if (read.byteLength) controller.enqueue(read)
      if (ended) controller.close()
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel: (why) => reader.cancel(why),
  })
  return { head: read, ended, all }
}
