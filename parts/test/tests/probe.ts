import type { TestContext } from 'node:test'

/**
 * Takes a test, the name of a probe of a test project, and what answers each thing that the project's code tells
 * it. Listens over a channel that every thread of this program shares, so the code is heard in whatever room it
 * runs, and answers each thing once its answer has settled: the code waits for it. Stops when the test ends, and
 * answers what stops it before.
 */
export function listened(t: TestContext, name: string, answer: (told: unknown) => unknown): () => void {
  const channel = new BroadcastChannel(name)
  let stopped = false
  // An answer that settles once the test stopped listening is nobody's.
  const post = (message: object): void => {
    if (!stopped) channel.postMessage(message)
  }
  channel.onmessage = (event: MessageEvent) => {
    const id: unknown = Reflect.get(Object(event.data), 'id')
    if (!('told' in Object(event.data))) return
    Promise.resolve()
      .then(() => answer(Reflect.get(Object(event.data), 'told')))
      .then(
        (value: unknown) => post({ id, value }),
        (error: unknown) => post({ id, failed: String(error) }),
      )
  }
  const stop = (): void => {
    stopped = true
    channel.close()
  }
  t.after(stop)
  return stop
}
