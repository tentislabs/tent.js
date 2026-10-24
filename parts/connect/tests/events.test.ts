import assert from 'node:assert/strict'
import test from 'node:test'
import { eventsOf } from '../index.ts'

/** A body that arrives as these pieces of text, in their order. */
const bodyOf = (...pieces: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(line) {
      for (const piece of pieces) line.enqueue(encoder.encode(piece))
      line.close()
    },
  })
}

test('[25-11] a stream of server-sent events takes the one space after data: away and keeps a second space as data', async () => {
  const events: string[] = []
  for await (const event of eventsOf(bodyOf('data:  two\n', 'data: one\n\n', 'data:none\n\n'))) events.push(event.data)
  // The rule of the stream takes a single space after the colon: https://html.spec.whatwg.org/multipage/server-sent-events.html
  assert.deepEqual(events, [' two\none', 'none'])
})
