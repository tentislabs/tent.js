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
const ofPart = (part: string): string[] => loaded.filter((address) => address.includes(`/parts/${part}/`))

test('[21-24@6b] an app that names nothing of connect has loaded nothing of it, and the first part that is fetched loads it', async (t) => {
  const { nobody, refusal, running, send, workFolder } = await import('./apps.ts')
  const { fetchPart } = await import('../index.ts')

  const { app, origin } = await running(t)
  await app.call('publicTags', {}, { as: nobody })
  assert.equal((await send(app, `${origin}/_t/call/publicTags`)).status, 200)
  assert.equal((await send(app, `${origin}/_t/health`, { method: 'GET' })).status, 200)
  // The hook saw the engine load, so it would have seen `connect` too.
  assert.ok(ofPart('engine').length > 0)
  assert.deepEqual(ofPart('connect'), [])

  // A part that is fetched is what first reaches out here. Nothing listens on the port, so the fetch fails at once.
  const list = [{ name: 'tool', version: '1.0.0', from: 'http://127.0.0.1:9/tool.tgz', fingerprint: '00' }]
  const error = await refusal(fetchPart('tool', { list, folder: workFolder(t), mode: 'development' }))
  assert.equal(error.code, 'T0016')
  assert.ok(ofPart('connect').length > 0)
})
