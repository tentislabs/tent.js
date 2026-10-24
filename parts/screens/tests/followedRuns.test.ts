import assert from 'node:assert/strict'
import test from 'node:test'
import { followedRuns } from '../page/followed.ts'
// The work of the runs a page follows is a part of the page code, held here from the start as a server holds it.
import '../page/agent/agent.ts'

/** The runs a page follows, with what it sent over its connection. */
function following() {
  const sent: object[] = []
  const runs = followedRuns(
    (message) => {
      sent.push(message)
      return true
    },
    () => import('../page/agent/agent.ts'),
  )
  return { runs, sent }
}

/** A part of a followed run, as the engine sends it. */
const part = (kind: string, more: object = {}) => ({ t: 'run-part', id: 'run:r1', kind, ...more })

test('[27-15] the reasoning of a model step that the page follows grows as it arrives, begins anew with anew, and is dropped by again', () => {
  const { runs, sent } = following()
  let heard = 0
  runs.follow('r1', () => heard++)
  assert.deepEqual(sent, [{ t: 'run-watch', id: 'run:r1', run: 'r1' }])
  runs.told({ t: 'run', id: 'run:r1', state: 'running', steps: [], asks: [], used: {} })
  runs.told(part('reasoning', { step: 'model 1', text: 'First' }))
  runs.told(part('reasoning', { step: 'model 1', text: ' thought.' }))
  assert.equal(runs.held('r1')?.reasoning, 'First thought.')
  runs.told(part('reasoning', { step: 'model 1', text: 'Second.', anew: true }))
  assert.equal(runs.held('r1')?.reasoning, 'Second.')
  runs.told(part('again', { step: 'model 1', repeat: 1 }))
  assert.equal(runs.held('r1')?.reasoning, '')
  assert.equal(heard, 5)
})

test('[27-16] what a step says takes the place of what it said before, two passes keep their values apart, again drops the value of its pass, and a late watch is sent the last one', () => {
  const { runs } = following()
  runs.follow('r1', () => undefined)
  runs.told({
    t: 'run',
    id: 'run:r1',
    state: 'running',
    steps: [],
    asks: [],
    said: [{ step: 'count', repeat: 1, value: { at: 3 } }],
    used: {},
  })
  assert.deepEqual(runs.held('r1')?.said, [{ step: 'count', repeat: 1, value: { at: 3 } }])
  runs.told(part('said', { step: 'count', repeat: 1, value: { at: 4 } }))
  runs.told(part('said', { step: 'count', repeat: 2, value: { at: 1 } }))
  assert.deepEqual(runs.held('r1')?.said, [
    { step: 'count', repeat: 1, value: { at: 4 } },
    { step: 'count', repeat: 2, value: { at: 1 } },
  ])
  runs.told(part('again', { step: 'count', repeat: 2 }))
  assert.deepEqual(runs.held('r1')?.said, [{ step: 'count', repeat: 1, value: { at: 4 } }])
  runs.told(part('done', { answer: 4, used: {} }))
  assert.equal(runs.held('r1')?.answer, 4)
})
