import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

/** The code that a promise was refused with, or `ok` where it was kept. */
const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

test('[26-3] a provider made in engine.ts answers a model that names it', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'models') })
  t.after(() => app.close())
  assert.equal(await app.call('own.reply', ['Say hello.'], { as: { kind: 'system' } }), 'made here: Say hello.')
})

test('[26-3] a model that names a provider that is not there stops the app from opening with T7113', async (t) => {
  const failed = await testApp({ folder: copyOf(t, 'missing') }).catch((error: unknown) => error)
  assert.equal(Reflect.get(Object(failed), 'code'), 'T7113')
  assert.match(String(Reflect.get(Object(failed), 'message')), /writer names the provider nowhere/)
})

test('[26-4] [16-2@9a] a model that states input and output is called as a function, with its files as bytes and as ids', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'models') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya' })
  const leo = await app.user({ name: 'Leo' })
  const photo = await app.as(maya).call('keepPhoto', {})
  // A file in its input reaches the provider as its bytes, with its kind and its name.
  const said = String(await app.as(maya).call('paint', { prompt: 'a tent', photo }))
  assert.match(said, /^a tent: image\/png, mine\.png, 10 bytes /)
  // A file in its output comes back as the id of a file, which holds what the provider gave.
  const picture = said.split(' ').at(-1) ?? ''
  assert.equal(await app.as(maya).call('fileKind', { id: picture }), 'image/png')
  // A file that the caller may not download refuses the call, as one that is not there.
  assert.equal(await codeOf(app.as(leo).call('paint', { prompt: 'a tent', photo })), 'T2104')
  // An input that does not fit is T0002, and an answer that does not fit is T7108.
  assert.equal(await codeOf(app.call('painter', { prompt: 3 }, { as: { kind: 'system' } })), 'T0002')
  assert.equal(await codeOf(app.as(maya).call('paint', { prompt: 'wrong' })), 'T7108')
})
