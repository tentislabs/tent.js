import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { Helped } from './helping.ts'
import { helped, oneTool } from './helping.ts'
import type { Message } from './watching.ts'
import { cookieOf, untilTried, watcher } from './watching.ts'
import { notDropped } from './started.ts'

/** A promise and what settles it, so that a test lets a model go on when it says. */
function gate(): { held: Promise<void>; go(): void } {
  let go = (): void => undefined
  const held = new Promise<void>((done) => {
    go = done
  })
  return { held, go }
}

/** The live connection of a user, as a page of theirs holds it. */
async function liveOf(h: Helped, who: Caller) {
  const id = String(who.user?.id)
  return watcher(h.app, h.origin, { cookie: cookieOf(h.app, id), as: id })
}

/** Starts the helper on a new conversation, as a caller, and answers the run and the conversation. */
async function started(h: Helped, as: Caller): Promise<{ run: string; chat: string }> {
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as })), 'id'))
  const { run } = notDropped(await h.app.start('helper', { message: 'Go.', thread: chat }, { as }))
  return { run, chat }
}

/** A value that is a list of messages, as a list, and anything else as none. */
const listOf = (value: unknown): Message[] => (Array.isArray(value) ? value : [])

/** The parts of one kind that a run watch was sent. */
const partsOf = (got: Message[], id: string, kind: string): Message[] =>
  got.filter((one) => one.t === 'run-part' && one.id === id && one.kind === kind)

test('[27-7] a page that begins in the middle of a model step gets a run message with the steps, the asks and the text so far, then the parts and the end', async (t) => {
  const h = await helped(t)
  const { held, go } = gate()
  h.say(() => ({ parts: [{ text: 'Hel', then: held }, { text: 'lo.' }] }))
  const { run } = await started(h, h.maya)
  await untilTried('the model began', () => h.asked.length === 1)
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'r1', run })
  await untilTried('the run was sent', () => page.of('run', 'r1').length === 1)
  const [first] = page.of('run', 'r1')
  assert.equal(first.state, 'running')
  assert.deepEqual(first.text, { step: 'model 1', text: 'Hel' })
  assert.deepEqual(first.asks, [])
  assert.ok(
    listOf(first.steps).some((step) => step.name === 'model 1' && step.state === 'started'),
    JSON.stringify(first.steps),
  )
  go()
  await untilTried('the run ended', () => partsOf(page.got, 'r1', 'done').length === 1)
  assert.deepEqual(
    partsOf(page.got, 'r1', 'text').map((one) => one.text),
    ['lo.'],
  )
  const [done] = partsOf(page.got, 'r1', 'done')
  assert.equal(done.text, 'Hello.')
  assert.ok(partsOf(page.got, 'r1', 'step').some((one) => Object(one.step).name === 'model 1'))
})

test('[27-7] an ask sends ask, then answered, and a step made again sends again first', async (t) => {
  const h = await helped(t)
  // The model answers once the page follows the run, so that the page sees the ask arrive.
  const { held, go } = gate()
  const tool = oneTool('quietMail')
  h.say(async (request) => {
    await held
    return tool(request)
  })
  const { run } = await started(h, h.maya)
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'r2', run })
  await untilTried('the run was sent', () => page.of('run', 'r2').length === 1)
  go()
  await untilTried('the ask was sent', () => partsOf(page.got, 'r2', 'ask').length === 1)
  const [asked] = partsOf(page.got, 'r2', 'ask')
  assert.deepEqual(asked.ask, {
    run,
    step: 'tool 1.1 quietMail',
    repeat: 1,
    n: 1,
    tool: 'quietMail',
    input: {},
    call: 'mail.send',
  })
  await h.app.call('helper.approve', { run, step: 'tool 1.1 quietMail', repeat: 1, n: 1 }, { as: h.maya })
  await untilTried('the run ended', () => partsOf(page.got, 'r2', 'done').length === 1)
  assert.deepEqual(partsOf(page.got, 'r2', 'answered')[0], {
    t: 'run-part',
    id: 'r2',
    kind: 'answered',
    run,
    step: 'tool 1.1 quietMail',
    repeat: 1,
    n: 1,
  })
  const kinds = page.got.filter((one) => one.id === 'r2').map((one) => String(one.kind ?? one.t))
  assert.ok(kinds.indexOf('again') > kinds.indexOf('answered'), kinds.join(' '))
})

test('[27-7] a screen that reads working is sent the text as it grows, as rows that hold that one entry, and the text is gone in the pass that brings the saved row', async (t) => {
  const h = await helped(t)
  const { held, go } = gate()
  // A first part, a moment, a second part, and the rest once the test says.
  const moment = new Promise<void>((done) => setTimeout(done, 300))
  h.say(() => ({ parts: [{ text: 'Hel', then: moment }, { text: 'lo', then: held }, { text: '.' }] }))
  t.after(go)
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as: h.maya })), 'id'))
  const page = await liveOf(h, h.maya)
  await page.watch('w1', 'helper.working', { thread: chat })
  const { run } = notDropped(await h.app.start('helper', { message: 'Go.', thread: chat }, { as: h.maya }))
  await untilTried('the text grew', () =>
    page.got.some((one) => one.id === 'w1' && JSON.stringify(one).includes('"text":"Hello"')),
  )
  const [grown] = page.got.filter((one) => one.id === 'w1' && JSON.stringify(one).includes('"text":"Hello"'))
  assert.equal(grown.t, 'rows')
  assert.deepEqual(
    listOf(grown.put).map((one) => Object(one.row).id),
    [run],
  )
  go()
  await h.app.runs.wait(run)
  await untilTried('the saved round was sent', () => {
    const last = page.got.filter((one) => one.id === 'w1').at(-1)
    return last !== undefined && JSON.stringify(last).includes('"state":"done"')
  })
  const last = page.got.filter((one) => one.id === 'w1').at(-1)
  assert.doesNotMatch(JSON.stringify(last), /"text":"Hel/)
})

test("[21-8] [05-5.7] two visitors who watch working of one agent are each sent their own runs, and never the other one's", async (t) => {
  const h = await helped(t)
  h.say(() => ({ text: 'Fine.' }))
  const visitor = async (): Promise<{ cookie: string; run: string }> => {
    const answer = await h.app.request(
      new Request(`${h.origin}/_t/call/helper`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: h.origin },
        body: JSON.stringify({ input: { message: 'Hi.' } }),
      }),
    )
    const body = Object(await answer.json())
    const cookie = (answer.headers.get('set-cookie') ?? '').split(';')[0]
    return { cookie, run: String(Object(body.value).run) }
  }
  const [one, two] = [await visitor(), await visitor()]
  assert.notEqual(one.cookie, two.cookie)
  await h.app.runs.wait(one.run)
  await h.app.runs.wait(two.run)
  const first = watcher(h.app, h.origin, { cookie: one.cookie })
  const second = watcher(h.app, h.origin, { cookie: two.cookie })
  const mine = await first.watch('w', 'helper.working', {})
  const theirs = await second.watch('w', 'helper.working', {})
  assert.deepEqual(
    listOf(mine.value).map((entry) => entry.run),
    [one.run],
  )
  assert.deepEqual(
    listOf(theirs.value).map((entry) => entry.run),
    [two.run],
  )
})

test('[05-5.9] a run-watch on a run of another caller is failed with T0001', async (t) => {
  const h = await helped(t)
  h.say(oneTool('refund', { order: 'o1' }))
  const { run } = await started(h, h.leo)
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'r3', run })
  await untilTried('the watch failed', () => page.of('failed', 'r3').length === 1)
  assert.equal(Object(page.of('failed', 'r3')[0].error).code, 'T0001')
})
