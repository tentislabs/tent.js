import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Every file that is loaded from here on, by its address. The hook stands before anything of the engine is
// imported, which is why this file imports the engine inside its test and not at its top.
const loaded: string[] = []
registerHooks({
  resolve(name, context, next) {
    const found = next(name, context)
    loaded.push(found.url)
    return found
  },
})
const of = (piece: string): string[] => loaded.filter((address) => address.includes(piece))

test('[21-24@9a] an app that holds a flow and no service and no worker loads nothing of connect and nothing of the work of workers, also while its flow runs: an app loads what its description names', async (t) => {
  const { running, system } = await import('./apps.ts')
  const { app } = await running(t, { project: 'flowOnly' })
  await app.call('addNote', { words: 'A note.' }, { as: system })
  for (let tries = 0; tries < 500; tries++) {
    const [run] = app.runs.find({ flow: 'onNote' })
    if (run?.state === 'done') break
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.equal(app.runs.find({ flow: 'onNote' })[0]?.state, 'done')
  // The hook saw the runner load, so it would have seen what it reaches beside.
  assert.ok(of('/parts/flows/').length > 0)
  assert.deepEqual(of('/parts/connect/'), [])
  assert.deepEqual(of('/parts/engine/work/'), [])
})
