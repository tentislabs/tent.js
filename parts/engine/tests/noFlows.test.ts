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

test('[21-24] an app that holds no flow and no heavy work has started no runner, and has loaded nothing of flows, of the work of workers and of sleeping', async (t) => {
  const { nobody, running, send } = await import('./apps.ts')
  const { app, origin } = await running(t)
  await app.call('publicTags', {}, { as: nobody })
  assert.equal((await send(app, `${origin}/_t/call/publicTags`)).status, 200)
  // The hook saw the engine load, so it would have seen the flows too.
  assert.ok(of('/parts/engine/').length > 0)
  assert.deepEqual(of('/parts/flows/'), [])
  assert.deepEqual(of('/parts/engine/work/'), [])
  assert.deepEqual(of('/parts/engine/sleep/sleeper.ts'), [])
  assert.deepEqual(app.runs.find({}), [])
})
