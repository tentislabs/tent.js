import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { heavyNotes, noteOnGpu } from '../functions/elsewhere'
import { addNote } from '../functions/note'

test('a heavy query reads on its thread', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.deepEqual(await app.as(maya).call(heavyNotes, {}), [])
  await app.close()
})

test('a worker of the program does the work', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const worker = await app.worker({ kinds: ['gpu'] })
  const id = worker.at().id
  for (let tried = 0; tried < 600; tried++) {
    const seen = app.workers().find((one) => Reflect.get(Object(one), 'id') === id)
    if (seen && Reflect.get(Object(seen), 'ready').length > 0) break
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.equal(await app.as(maya).call(noteOnGpu, { words: 'from the worker' }), 1)
  await worker.close({ now: true })
  await app.close()
})

// The next test lets the work of the one before it go on, and waits for it to land.
let letGo = (): void => undefined
const go = new Promise<void>((done) => {
  letGo = done
})
let landed: Promise<unknown> = Promise.resolve()

test('work goes on after the test ended', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  // The app is closed with the file, after the next test: this call lands while that one runs.
  landed = go.then(() => app.as(maya).call(addNote, { words: 'late' }))
})

test('the next test only waits', async () => {
  letGo()
  await landed
})
