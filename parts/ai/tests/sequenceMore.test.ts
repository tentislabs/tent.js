import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { FakeAnswer } from '../../test/index.ts'
import { answered, handing, lines, sequencedApp, stepsOf, waiting } from './sequencing.ts'
import { notDropped } from './started.ts'

/** What a model is handed of the answer of its last tool, as the text it ends with. */
const toldOf = async (text: Promise<string>): Promise<string> => JSON.parse((await text).slice('Done: '.length))

test('[27-18] the end of limits.ask ends a sequence with T7111 and the words of a refusal, and the calls before it stay made', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake('writer', handing(lines('const open = myOrders({})', `refund({ order: '${orders[0]}' })`, 'return 1')))
  const { run } = notDropped(await app.start('quickAsk', { message: 'Refund.' }, { as: maya }))
  assert.equal((await waiting(app, run))?.name, 'ask 1.1.2')
  app.clock.advance('2 minutes')
  const told = String(await toldOf(answered(app, run)))
  assert.match(told, /^The person refused this\..*line 2/s)
  assert.match(told, /"tool":"myOrders"/)
})

test('[27-18] a list of a walk that would pass limits.result is cut there, with more true', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake('writer', handing(lines('for (const i of range(0, 30)) {', `  refund({ order: '${orders[0]}' })`, '}')))
  const { run } = notDropped(await app.start('narrow', { message: 'Refund.' }, { as: maya }))
  const ask = await waiting(app, run)
  const shown = Object(ask?.show)
  assert.ok(
    Array.isArray(shown.sequence) && shown.sequence.length > 0 && shown.sequence.length < 30,
    JSON.stringify(shown),
  )
  assert.ok(JSON.stringify(shown.sequence).length <= 1024)
  assert.equal(shown.more, true)
})

test('[27-18] a fill whose answer does not fit its shape is asked for once more, and its second miss fails its step with T7108', async (t) => {
  const { app, maya } = await sequencedApp(t)
  let fills = 0
  app.fake('writer', (request: ReplyRequest): FakeAnswer => {
    if (request.shape !== undefined) {
      fills++
      return { value: 'no truth' }
    }
    return handing("return fill(boolean(), 'Is it late?')")(request)
  })
  const { run } = notDropped(await app.start('helper', { message: 'Judge.' }, { as: maya }))
  assert.match(String(await toldOf(answered(app, run))), /^Error T7108/)
  assert.equal(fills, 2)
  assert.equal(stepsOf(app, run).find((one) => one.name === 'fill 1.1.1')?.state, 'failed')
})

test('[27-18] a refused sequence counts as one tool call on limits.toolCalls', async (t) => {
  const { app, maya } = await sequencedApp(t)
  let answers = 0
  app.fake('writer', (request: ReplyRequest): FakeAnswer => {
    if (request.messages.at(-1)?.who === 'user') return { calls: [{ tool: 'sequence', with: { run: 'let n = 1' } }] }
    answers++
    // Three calls beside the refused sequence are the four of the limit; one more passes it.
    return answers === 1
      ? { calls: [{ tool: 'myOrders' }, { tool: 'myOrders' }, { tool: 'myOrders' }] }
      : { calls: [{ tool: 'myOrders' }] }
  })
  const { run } = notDropped(await app.start('tight', { message: 'Count.' }, { as: maya }))
  await app.runs.wait(run).catch(() => undefined)
  const ended = app.runs.read(run)
  assert.equal(ended?.state, 'failed')
  assert.equal(ended?.error?.code, 'T7102')
  assert.equal(stepsOf(app, run).filter((one) => one.name.startsWith('tool ')).length, 3)
})

test('[27-18] a sequence under an agent that another agent called meets what a tool call meets there: a trusted tool asks, as it does not in a run a person started', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  const tell = lines(`notify({ order: '${orders[0]}' })`, "return 'told'")
  app.fake('writer', (request: ReplyRequest): FakeAnswer => {
    const last = request.messages.at(-1)
    if (request.instructions === 'You ask another to tell.' && last?.who === 'user')
      return { calls: [{ tool: 'trustedSeq', with: { message: 'Tell them.' } }] }
    return handing(tell)(request)
  })
  const own = notDropped(await app.start('trustedSeq', { message: 'Tell.' }, { as: maya }))
  assert.equal(await answered(app, own.run), 'Done: "told"')
  assert.ok(!stepsOf(app, own.run).some((one) => one.name.startsWith('ask ')), 'trusted where a person started the run')
  const outer = notDropped(await app.start('outerSeq', { message: 'Go.' }, { as: maya }))
  let inner = ''
  for (let tries = 0; tries < 500 && !inner; tries++) {
    inner = app.runs.find({ top: outer.run }).find((one) => one.flow === 'trustedSeq')?.id ?? ''
    if (!inner) await new Promise((done) => setTimeout(done, 10))
  }
  assert.equal((await waiting(app, inner))?.name, 'ask 1.1.1')
})

test('[27-18] a sequence in a run that a trigger started meets what the same tool call meets there', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  const direct = { calls: [{ tool: 'refund', with: { order: orders[0] } }] }
  let sequenced = false
  app.fake('writer', (request: ReplyRequest): FakeAnswer => {
    if (request.messages.at(-1)?.who !== 'user') return { text: 'Done.' }
    return sequenced ? { calls: [{ tool: 'sequence', with: { run: `refund({ order: '${orders[0]}' })` } }] } : direct
  })
  const endOf = async (): Promise<{ waits: boolean; state: string }> => {
    await app.as(maya).call('addPing', { words: 'Ping.' })
    let id = ''
    for (let tries = 0; tries < 500; tries++) {
      const runs = app.runs.find({ flow: 'pinged' })
      id = runs.at(-1)?.id ?? ''
      const state = id ? app.runs.read(id)?.state : undefined
      if (id && runs.length === (sequenced ? 2 : 1) && state !== 'running') break
      await new Promise((done) => setTimeout(done, 10))
    }
    const steps = stepsOf(app, id)
    return { waits: steps.some((one) => one.state === 'waiting'), state: String(app.runs.read(id)?.state) }
  }
  const byCall = await endOf()
  sequenced = true
  const bySequence = await endOf()
  assert.deepEqual(bySequence, byCall)
})
