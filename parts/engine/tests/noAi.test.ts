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

test('[21-24@9a] an app that holds no model has loaded nothing of ai, whatever it is asked; an app that holds one loads it', async (t) => {
  const { nobody, running, send } = await import('./apps.ts')
  const { app, origin } = await running(t)
  await app.call('publicTags', {}, { as: nobody })
  assert.equal((await send(app, `${origin}/_t/call/publicTags`)).status, 200)
  // The hook saw the engine load, so it would have seen the part of the models too.
  assert.ok(of('/parts/engine/').length > 0)
  assert.deepEqual(of('/parts/ai/'), [])
  const { addUser } = await import('./apps.ts')
  const models = await running(t, { project: 'followed', engine: { makers: { providers: () => ({ mine: {} }) } } })
  await addUser(models.app, 'Maya')
  assert.ok(of('/parts/ai/').length > 0, 'an app that holds a model loads the part of the models')
})
