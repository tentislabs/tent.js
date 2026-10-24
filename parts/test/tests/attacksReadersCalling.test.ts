import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { beat, current, level } from './many.ts'
import { copyOf } from './projects.ts'
import { asSystem, besieged } from './sieges.ts'
import { calledByBrowser, idByEmail, signedInByEmail, stormed, who } from './storms.ts'

test('[29-11.4] a reader that was cut off, asked with a session that was ended meanwhile, answers nothing itself after behind', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const near = await app.reader()
  await current(app, near)
  const maya = await idByEmail(app, 'maya@example.com')
  const cookie = await signedInByEmail(app, 'maya@example.com')
  await level(app, near)
  // While it is current the reader answers by itself, with what it holds.
  assert.equal(await who(near, cookie, maya), maya)
  // The link is lost, and the session is ended on the writer: the reader never hears of it.
  near.cut()
  const ended = calledByBrowser(app, 'signOut', {}, { cookie, as: maya })
  // `behind` is five seconds: after it the reader is not current, and what it holds may guard nothing.
  await beat(app, 8)
  assert.equal(near.at().current, false)
  const asked = await calledByBrowser(near, 'whoAmI', {}, { cookie, as: maya })
  // It hands the request to its writer, or fails: it does not answer the ended session from what it holds.
  assert.notEqual(asked.wire.value, maya, 'the reader answered a session that was ended, from what it holds')
  // With the link back the reader hears of the end, and the session is nobody there too.
  near.join()
  await current(app, near)
  assert.equal((await ended).wire.ok, true)
  await level(app, near)
  assert.equal(await who(near, cookie), 'nobody')
})

test('[29-11.12] a route on the writer that sends every header of its request on, called through a reader, is handed nothing that the reader added: not its key, and no word of the link', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const near = await app.reader()
  await current(app, near)
  const sent = { 'x-own': 'the header of the caller', accept: 'application/json' }
  const through = async (machine: typeof app): Promise<Record<string, string>> => {
    const answer = await machine.request(new Request('http://localhost/handed', { headers: sent }), {
      from: '203.0.113.77',
    })
    assert.equal(answer.status, 200)
    return Object(await answer.json())
  }
  const [straight, handedOn] = [await through(app), await through(near)]
  assert.equal(handedOn['x-own'], 'the header of the caller')
  // What the route is handed through a reader is what it is handed straight: no header more.
  assert.deepEqual(Object.keys(handedOn).sort(), Object.keys(straight).sort())
  for (const name of Object.keys(handedOn))
    assert.equal(/^(authorization|tent-|x-tent-|proxy-)/.test(name), false, `the route was handed ${name}`)
})

test('[29-11.2@7a] a request that carries a made-up Tent-Reader or Tent-For and no key of a reader is not believed, with the cookie of a session too: it is not carried out as another caller', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  const omar = await idByEmail(app, 'omar@example.com')
  const cookie = await signedInByEmail(app, 'maya@example.com')
  const forged: Record<string, string>[] = [
    { 'tent-reader': 'not-a-real-key' },
    { 'tent-for': '1.2.3.4; https; evil.test' },
    { 'tent-reader': 'z'.repeat(43), 'tent-for': '1.2.3.4; https; evil.test' },
  ]
  for (const headers of forged) {
    const told = await calledByBrowser(app, 'whoAmI', {}, { cookie, as: maya, headers })
    assert.notEqual(told.wire.value, omar, JSON.stringify(headers))
    assert.ok(told.wire.value === maya || told.wire.ok === false, JSON.stringify([headers, told.wire]))
    const notes = await calledByBrowser(app, 'staffNotes', {}, { cookie, as: maya, read: true, headers })
    assert.equal(notes.wire.ok, false, JSON.stringify(headers))
  }
})

test('[29-11.2@7a] a request with the true key of a reader is carried out as the caller that its own cookie names, on live data and on test data, and as nobody with no cookie', async (t) => {
  const key = 'n'.repeat(40)
  for (const mode of ['live', 'test'] as const) {
    const project = copyOf(t, 'stormed')
    const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
    const siege = await besieged(t, {
      bundle: made.bundleFolder,
      open: { mode, address: '*', own: 'https://writer.test', readers: [key] },
    })
    await siege.app.seed()
    const users = Object(await siege.app.read({ from: 'users' }, asSystem))
    const maya = String(users.find((one: { email: string }) => one.email === 'maya@example.com').id)
    const origin = 'https://writer.test'
    const post = async (name: string, input: object, headers: Record<string, string>, as?: string) => {
      const answer = await siege.app.request(
        new Request(`${origin}/_t/call/${name}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin, ...headers },
          body: JSON.stringify({ input, ...(as ? { as } : {}) }),
        }),
      )
      return { wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
    }
    const signed = await post('signIn', { email: 'maya@example.com' }, {})
    assert.equal(signed.wire.ok, true, JSON.stringify(signed.wire))
    const cookie = signed.set[0].split(';')[0]
    const handed = {
      'tent-reader': key,
      'tent-epoch': siege.app.at().epoch,
      'tent-for': '203.0.113.9; https; writer.test',
    }
    const told = await post('whoAmI', {}, { ...handed, cookie }, maya)
    assert.deepEqual(told.wire, { ok: true, value: maya }, mode)
    // With no cookie the same request is nobody's: no header names a caller.
    assert.deepEqual((await post('whoAmI', {}, handed)).wire, { ok: true, value: 'nobody' }, mode)
  }
})
