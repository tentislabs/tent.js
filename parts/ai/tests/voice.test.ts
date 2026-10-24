import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A second of silence as the bytes of a WAV file, written as base64. */
function recording(): string {
  const samples = 8000
  const bytes = Buffer.alloc(44 + samples)
  bytes.write('RIFF', 0, 'latin1')
  bytes.writeUInt32LE(36 + samples, 4)
  bytes.write('WAVEfmt ', 8, 'latin1')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24)
  bytes.writeUInt32LE(8000, 28)
  bytes.writeUInt16LE(1, 32)
  bytes.writeUInt16LE(8, 34)
  bytes.write('data', 36, 'latin1')
  bytes.writeUInt32LE(samples, 40)
  bytes.fill(128, 44)
  return bytes.toString('base64')
}

/** A test app of the project of the voice, with two users, and a recording of the first. */
async function voiced(t: test.TestContext) {
  const app: TestApp = await testApp({ folder: copyOf(t, 'voiced') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const leo = await app.user({ name: 'Leo', roles: [] })
  const sound = String(await app.as(maya).call('keepSound', { base64: recording() }))
  const listener = app.fake('listener', { hear: () => ({ text: 'Where is my order?', language: 'en', seconds: 1 }) })
  const speaker = app.fake('speaker', { speak: (text: string) => new Uint8Array(Buffer.from(`sound of ${text}`)) })
  return { app, maya, leo, sound, listener, speaker }
}

/** The code that a promise was refused with, or `ok`. */
const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

test('[27-11] voice by turns: a recording is heard, answered, and spoken sentence by sentence after the last model step, each sound a saved step; the starter downloads a spoken sentence and nobody else can', async (t) => {
  const { app, maya, leo, sound, speaker } = await voiced(t)
  const writer = app.fake('writer', [{ text: 'It is on its way. It comes tomorrow.' }])
  const { run } = notDropped(await app.start('talker', { message: '', audio: sound, speak: true }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'It is on its way. It comes tomorrow.' })
  const steps = app.runs.read(run)?.steps ?? []
  assert.deepEqual(
    steps.map((one) => `${one.name}:${one.state}`),
    ['hear:done', 'model 1:done', 'speak 1:done', 'speak 2:done'],
  )
  // What was heard is the message the model is handed.
  const asked = Object(writer.sent[0].input)
  assert.equal(asked.messages.at(-1).text, 'Where is my order?')
  assert.deepEqual(
    speaker.sent.map((one) => Reflect.get(Object(one.input), 'text')),
    ['It is on its way.', 'It comes tomorrow.'],
  )
  const spoken = String(steps.find((one) => one.name === 'speak 1')?.result)
  assert.equal((await app.browser({ as: maya }).request('GET', `/_t/files/${spoken}`)).status, 200)
  assert.equal((await app.browser({ as: leo }).request('GET', `/_t/files/${spoken}`)).status, 404)
})

test('[27-11] without voice a start with a recording is refused with T7105', async (t) => {
  const { app, maya, sound } = await voiced(t)
  app.fake('writer', [{ text: 'Never.' }])
  assert.equal(await codeOf(app.start('mute', { message: '', audio: sound }, { as: maya })), 'T7105')
  assert.equal(await codeOf(app.start('mute', { message: 'Hi.', speak: true }, { as: maya })), 'T7105')
})

test('[27-11] a flow that calls hear and speak, each inside a step, gives the same text and a sound', async (t) => {
  const { app, maya, sound, speaker } = await voiced(t)
  assert.equal(await app.as(maya).call('voiceFlow', { audio: sound }), 'Where is my order? and a sound')
  assert.deepEqual(
    speaker.sent.map((one) => Reflect.get(Object(one.input), 'text')),
    ['Back: Where is my order?'],
  )
})
