import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bridgeTo } from '../page/chat/bridge.ts'
import { followedRuns } from '../page/followed.ts'
import { uploaded } from '../page/upload.ts'

/** Sets what a browser gives for the length of a piece of work, and puts back what stood before. */
async function withGlobals(globals: Record<string, unknown>, work: () => Promise<void>): Promise<void> {
  const before = new Map(Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]))
  for (const [name, value] of Object.entries(globals)) Reflect.set(globalThis, name, value)
  try {
    await work()
  } finally {
    for (const [name, value] of before)
      if (value === undefined) Reflect.deleteProperty(globalThis, name)
      else Reflect.set(globalThis, name, value)
  }
}

test('[25-9] a request of a frame that the chat app never answers fails once its time is up, and leaves no press busy', async () => {
  const posted: unknown[] = []
  await withGlobals({ window: { addEventListener: () => undefined } }, async () => {
    const chat = { postMessage: (message: unknown) => void posted.push(message) }
    const bridge = bridgeTo(Object(chat), 20)
    await assert.rejects(bridge.request('tools/call', { name: 'helper' }), /did not answer tools\/call in time/)
  })
  assert.equal(posted.length, 1)
})

test('[27-16] a run that a page follows, where the part that follows runs cannot be loaded, is failed with the error a caller sees, and its view is told', async () => {
  const runs = followedRuns(
    () => true,
    () => Promise.reject(new Error('the part did not load')),
  )
  let heard = 0
  runs.follow('r1', () => heard++)
  await new Promise((done) => setTimeout(done, 5))
  assert.equal(heard, 1)
  assert.deepEqual([runs.held('r1')?.state, runs.held('r1')?.error?.code], ['failed', 'T0009'])
})

test('[22-12] an upload whose connection stalls answers once its time is up, and one that is ended answers too', async () => {
  // An asking of the browser as a test drives it: the test ends it as a stalled or a cut connection would.
  const made: { timeout: number; ontimeout?: () => void; onabort?: () => void }[] = []
  class Asking {
    timeout = 0
    withCredentials = false
    upload = {}
    ontimeout?: () => void
    onabort?: () => void
    constructor() {
      made.push(this)
    }
    open(): void {}
    setRequestHeader(): void {}
    send(): void {}
  }
  await withGlobals({ XMLHttpRequest: Asking }, async () => {
    const stalled = uploaded('/_t/files', new Blob(['x']), () => undefined)
    made[0]?.ontimeout?.()
    assert.deepEqual(await stalled, { error: { message: 'The file could not be sent in time.' } })
    assert.ok((made[0]?.timeout ?? 0) > 0, 'the upload has a time of its own')
    const ended = uploaded('/_t/files', new Blob(['x']), () => undefined)
    made[1]?.onabort?.()
    assert.deepEqual(await ended, { error: { message: 'The file could not be sent.' } })
  })
})
