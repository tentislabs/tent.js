import assert from 'node:assert/strict'
import test from 'node:test'
import { callQueue } from '../page/heldCalls.ts'

test('[44-6] the calls that are held are sent once the live connection opens again, before any try of their own', async () => {
  // No timer of the queue ever fires: only the connection that is back can send what is held.
  const queue = callQueue({ now: () => 0, wait: () => () => undefined, hold: 60_000 })
  let up = false
  const sent: string[] = []
  const work = (name: string) => async (): Promise<string> => {
    if (!up) throw new TypeError('fetch failed')
    sent.push(name)
    return name
  }
  const states: boolean[] = []
  const first = queue.send(work('first'), (on) => states.push(on))
  const second = queue.send(work('second'), () => undefined)
  await new Promise((done) => setTimeout(done, 10))
  assert.deepEqual([queue.holds(), sent], [true, []])
  up = true
  queue.back()
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.deepEqual([sent, states, queue.holds()], [['first', 'second'], [true, false], false])
})
