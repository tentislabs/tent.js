import assert from 'node:assert/strict'
import test from 'node:test'
import { failOnce, followedApp, gateOf, liveOf } from './followedApp.ts'
import type { Message } from './watching.ts'
import { liveMoment, untilTried, watcher } from './watching.ts'
import { notDropped } from './started.ts'

/** The parts of one kind that a run watch was sent. */
const partsOf = (got: Message[], id: string, kind: string): Message[] =>
  got.filter((one) => one.t === 'run-part' && one.id === id && one.kind === kind)

/** The values that a watch was sent as said, in their order. */
const saidIn = (got: Message[], id: string): unknown[] => partsOf(got, id, 'said').map((one) => one.value)

test('[27-16] a step that says: its starter follows the run and is sent the values, ten a second at most, the newest taking the place of the others, and the last one before the step ends; a watcher that comes late is sent the last one; nothing of it is saved', async (t) => {
  const h = await followedApp(t)
  const go = gateOf('count')
  t.after(go)
  const page = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('counting', { n: 50 }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'r', run })
  await untilTried('the step began', () => h.app.runs.read(run)?.steps.some((one) => one.name === 'count') === true)
  await liveMoment(300)
  // A watcher that comes late is sent the last value of the step that is at work.
  const late = await liveOf(h, h.maya)
  late.send({ t: 'run-watch', id: 'late', run })
  await untilTried('the late watch was sent', () => late.of('run', 'late').length === 1)
  assert.deepEqual(late.of('run', 'late')[0]?.said, [{ step: 'count', repeat: 1, value: { at: 50 } }])
  go()
  await untilTried('the run ended', () => partsOf(page.got, 'r', 'done').length === 1)
  const first: unknown = page.of('run', 'r')[0]?.said
  const said = [
    ...(Array.isArray(first) ? first : []).map((one: unknown) => Reflect.get(Object(one), 'value')),
    ...saidIn(page.got, 'r'),
  ]
  assert.ok(said.length >= 1 && said.length <= 4, `held to ten a second: ${JSON.stringify(said)}`)
  assert.deepEqual(said.at(-1), { at: 50 }, 'the newest takes the place of the others')
  // What was said comes before the part that ends the step.
  const kinds = page.got.filter((one) => one.id === 'r').map((one) => `${String(one.kind ?? one.t)}`)
  assert.ok(kinds.lastIndexOf('said') < kinds.indexOf('done'), kinds.join(' '))
  assert.doesNotMatch(JSON.stringify(h.app.runs.read(run)), /"at":/, 'nothing of it is saved')
  assert.equal(partsOf(page.got, 'r', 'done')[0]?.answer, 50, 'the answer through the output of the flow')
})

test('[27-16] two passes of one step keep their values apart, again drops what was said, and a run whose flow states no output ends with no answer', async (t) => {
  const h = await followedApp(t)
  const [one, two] = [gateOf('pass 1'), gateOf('pass 2')]
  t.after(() => {
    one()
    two()
  })
  const page = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('twice', {}, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'r', run })
  await untilTried('the first pass said', () => JSON.stringify(page.got).includes('"pass":1'))
  one()
  await untilTried('the second pass said', () => JSON.stringify(page.got).includes('"pass":2'))
  const repeats = partsOf(page.got, 'r', 'said').map((part) => part.repeat)
  assert.ok(repeats.includes(2), JSON.stringify(repeats))
  two()
  await untilTried('the run ended', () => partsOf(page.got, 'r', 'done').length === 1)
  assert.equal('answer' in (partsOf(page.got, 'r', 'done')[0] ?? {}), false)
  // A step that fails once is made again: what it said is dropped, by `again`.
  const go = gateOf('count')
  failOnce('count')
  const second = notDropped(await h.app.start('counting', { n: 1 }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'again', run: second.run })
  await untilTried('the step said', () => page.of('run', 'again').length === 1)
  go()
  await untilTried('the step was made again', () => partsOf(page.got, 'again', 'again').length === 1)
  assert.deepEqual(partsOf(page.got, 'again', 'again')[0]?.step, 'count')
  await untilTried('the run ended after its second try', () => partsOf(page.got, 'again', 'done').length === 1)
})

test('[27-16] a value past inFrame is T5102; a run whose flow states no follow, and one whose starter is another caller, is not found', async (t) => {
  const h = await followedApp(t)
  const { run } = notDropped(await h.app.start('tooMuch', {}, { as: h.maya }))
  await untilTried('the run failed', () => h.app.runs.read(run)?.state === 'failed')
  assert.equal(h.app.runs.read(run)?.error?.code, 'T5102')
  assert.match(JSON.stringify(h.app.runs.read(run)?.error), /inFrame/)
  const closed = notDropped(await h.app.start('unfollowed', {}, { as: h.maya }))
  const go = gateOf('count')
  t.after(go)
  const theirs = notDropped(await h.app.start('counting', { n: 1 }, { as: h.leo }))
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'closed', run: closed.run })
  page.send({ t: 'run-watch', id: 'theirs', run: theirs.run })
  await untilTried('both failed', () => page.of('failed').length === 2)
  assert.deepEqual(
    page.of('failed').map((one) => Object(one.error).code),
    ['T0001', 'T0001'],
  )
})

test('[27-16] a stream with a shape whose parts a step says fills the value on the page part by part, and the answer of the run is the checked one', async (t) => {
  const h = await followedApp(t)
  let go = (): void => undefined
  const hold = new Promise<void>((done) => (go = done))
  t.after(go)
  // The model holds after the first part of its answer, so that the page sees the value while it grows.
  h.say(() => ({ value: ['one', 'two', 'three'], hold }))
  const page = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('shaped', {}, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'r', run })
  const grown = (): unknown[] => [
    ...page.of('run', 'r').flatMap((one) => (Array.isArray(one.said) ? one.said : [])),
    ...partsOf(page.got, 'r', 'said'),
  ]
  await untilTried('the value so far was said', () => grown().length > 0)
  assert.deepEqual(Reflect.get(Object(grown().at(-1)), 'value'), ['one'])
  go()
  await untilTried('the run ended', () => h.app.runs.read(run)?.state === 'done')
  // A watch that came after the end is sent the run as it ended, with its answer.
  const ended = (): Message | undefined =>
    partsOf(page.got, 'r', 'done')[0] ?? page.of('run', 'r').find((one) => one.state === 'done')
  await untilTried('the end was sent', () => ended() !== undefined)
  assert.deepEqual(h.app.runs.read(run)?.answer, ['one', 'two', 'three'])
  assert.deepEqual(ended()?.answer, ['one', 'two', 'three'])
})

test('[27-16] the run of an action that states background and follow is followed by the id of its T0008, and is sent what it says and its answer', async (t) => {
  const h = await followedApp(t)
  const go = gateOf('heavy')
  t.after(go)
  const error = await h.app.call('heavy', {}, { as: h.maya }).then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  assert.equal(Reflect.get(Object(error), 'code'), 'T0008')
  const run = String(Reflect.get(Object(Reflect.get(Object(error), 'fields')), 'run'))
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'r', run })
  await untilTried('the run was sent', () => page.of('run', 'r').length === 1)
  assert.match(JSON.stringify(page.of('run', 'r')[0]?.said), /at work/)
  go()
  await untilTried('the run ended', () => partsOf(page.got, 'r', 'done').length === 1)
  assert.equal(partsOf(page.got, 'r', 'done')[0]?.answer, 'heavy done')
})

test('[27-16] a screen that reads working of a flow that states follow is sent its steps and what they say; a caller whom the rule does not let in is refused with T3101; two visitors are each sent their own runs', async (t) => {
  const h = await followedApp(t)
  const go = gateOf('count')
  const page = await liveOf(h, h.maya)
  await page.watch('w', 'counting.working', {})
  const { run } = notDropped(await h.app.start('counting', { n: 3 }, { as: h.maya }))
  await untilTried('working holds the run and what its step said', () =>
    JSON.stringify(page.got.filter((one) => one.id === 'w')).includes('"at":3'),
  )
  assert.match(JSON.stringify(page.got.filter((one) => one.id === 'w')), new RegExp(run))
  const refused = await page.watch('staff', 'forStaff.working', {})
  assert.equal(Object(refused.error).code, 'T3101', JSON.stringify(refused))
  // Two visitors, each with a run of their own, are each sent their own: a visitor is known by the cookie of its start.
  const visitor = async (who: string) => {
    const answer = await h.app.request(
      new Request(`${h.origin}/_t/call/visiting`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: h.origin },
        body: JSON.stringify({ input: { who } }),
      }),
    )
    const cookie = (answer.headers.get('set-cookie') ?? '').split(';')[0]
    const page = watcher(h.app, h.origin, { cookie })
    await page.watch('v', 'visiting.working', {})
    return page
  }
  const [first, second] = [await visitor('first'), await visitor('second')]
  // Their calls waited for their runs: each is sent their latest finished run, with its answer, and not the other's.
  await untilTried(
    'each was sent their own',
    () =>
      JSON.stringify(first.got).includes('"answer":"first"') &&
      JSON.stringify(second.got).includes('"answer":"second"'),
  )
  assert.doesNotMatch(JSON.stringify(first.got), /"answer":"second"/)
  assert.doesNotMatch(JSON.stringify(second.got), /"answer":"first"/)
  go()
})
