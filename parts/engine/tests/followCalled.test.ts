import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Said } from './followedApp.ts'
import { followedApp, liveOf } from './followedApp.ts'
import type { Message } from './watching.ts'
import { untilTried } from './watching.ts'
import { notDropped } from './started.ts'

/** A promise and what settles it. */
function held(): { hold: Promise<void>; go(): void } {
  let go = (): void => undefined
  const hold = new Promise<void>((done) => (go = done))
  return { hold, go }
}

/** Whether a request is one of the inner agent. */
const ofInner = (request: ReplyRequest): boolean => request.instructions?.includes('You refund.') === true

/** The parts of one kind that a run watch was sent. */
const partsOf = (got: Message[], id: string, kind: string): Message[] =>
  got.filter((one) => one.t === 'run-part' && one.id === id && one.kind === kind)

/** The runs that the steps of the parts of a watch named as called, in their order: the parts alone. */
const calledIn = (got: Message[], id: string): string[] =>
  partsOf(got, id, 'step').flatMap((one) => {
    const runs: unknown = Reflect.get(Object(one.step), 'runs')
    return Array.isArray(runs) ? runs.map(String) : []
  })

test('[27-15] a called agent: the tool step above carries the id of the run it called in a step part; its starter follows that run with a run-watch of its own, and another caller is answered T0001; working names it in under, and working with { run } answers its entry with its text', async (t) => {
  const h = await followedApp(t)
  const inside = held()
  t.after(inside.go)
  h.say((request): Said => {
    if (ofInner(request)) return { parts: ['Ins', 'ide.'], hold: inside.hold }
    const last = request.messages.at(-1)
    return last?.who === 'user' ? { calls: [{ tool: 'inner', input: { message: 'Go in.' } }] } : { text: 'Back.' }
  })
  const page = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('helper', { message: 'Help.' }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'top', run })
  await untilTried('the called run was named', () => calledIn(page.got, 'top').length > 0)
  const [called] = calledIn(page.got, 'top')
  if (!called) throw new Error('no called run')
  assert.equal(h.app.runs.read(called)?.parent, run)
  page.send({ t: 'run-watch', id: 'below', run: called })
  await untilTried('the called run was sent', () => page.of('run', 'below').length === 1)
  const working: unknown = await h.app.call('helper.working', {}, { as: h.maya })
  const [entry] = Array.isArray(working) ? working : []
  assert.deepEqual(
    (Array.isArray(Reflect.get(Object(entry), 'under')) ? Reflect.get(Object(entry), 'under') : []).map(
      (one: unknown) => Reflect.get(Object(one), 'run'),
    ),
    [called],
  )
  // A page that comes in the middle of a model step is sent its text so far in the run message.
  await untilTried(
    'the text of the called run was sent',
    () => partsOf(page.got, 'below', 'text').length > 0 || JSON.stringify(page.of('run', 'below')).includes('Ins'),
  )
  const own: unknown = await h.app.call('helper.working', { run: called }, { as: h.maya })
  assert.match(JSON.stringify(own), /Ins/)
  // Another caller learns nothing of it, by its id as by the id of the run above.
  const other = await liveOf(h, h.leo)
  other.send({ t: 'run-watch', id: 'theirs', run: called })
  other.send({ t: 'run-watch', id: 'above', run })
  await untilTried('both watches failed', () => other.of('failed').length === 2)
  assert.deepEqual(
    other.of('failed').map((one) => Object(one.error).code),
    ['T0001', 'T0001'],
  )
  inside.go()
  await untilTried('the called run ended', () => partsOf(page.got, 'below', 'done').length === 1)
  assert.equal(partsOf(page.got, 'below', 'done')[0]?.text, 'Inside.')
  assert.ok(partsOf(page.got, 'below', 'step').length > 0, 'its steps were sent')
})

test('[27-15] an agent that a step of a flow of the system calls is followed by nobody through the door; runs.read answers it, and runs.find with top and waiting answers it while its ask waits, as started by the system', async (t) => {
  const h = await followedApp(t)
  h.say((request): Said => {
    const last = request.messages.at(-1)
    return last?.who === 'user' ? { calls: [{ tool: 'refund', input: { order: 'o1' } }] } : { text: 'Refunded.' }
  })
  for (const flow of ['sweep', 'sweepClosed']) {
    const { run } = notDropped(await h.app.start(flow, {}, { as: h.maya }))
    await untilTried('the agent under it waits', () =>
      (h.app.runs.find({ top: run }) ?? []).some((one) => one.flow === 'inner' && one.state === 'waiting'),
    )
    const [inner] = (h.app.runs.find({ top: run }) ?? []).filter((one) => one.flow === 'inner')
    if (!inner) throw new Error('no run of the agent')
    const page = await liveOf(h, h.maya)
    page.send({ t: 'run-watch', id: 'flow', run })
    page.send({ t: 'run-watch', id: 'agent', run: inner.id })
    await untilTried('both watches were answered', () => page.of('run').length + page.of('failed').length === 2)
    assert.equal(page.of('run', 'flow').length, flow === 'sweep' ? 1 : 0, `${flow}: its own follow`)
    assert.equal(Object(page.of('failed', 'agent')[0]?.error).code, 'T0001', `${flow}: the agent under it`)
    // Its asks are passed up to nobody either: working of the agent holds none for the starter of the flow.
    assert.deepEqual(await h.app.call('inner.working', { run: inner.id }, { as: h.maya }), [])
    assert.equal(h.app.runs.read(inner.id)?.state, 'waiting')
    const found: unknown = await h.app.call('waitingUnder', { top: run }, { as: h.maya })
    const listed = (Array.isArray(found) ? found : []).filter((one) => Reflect.get(Object(one), 'flow') === 'inner')
    assert.equal(listed.length, 1, JSON.stringify(found))
    assert.deepEqual(Reflect.get(Object(listed[0]), 'startedBy'), { kind: 'system' })
    // The ask waits in the step that a tool call of the model made; backend code answers it.
    const asking = h.app.runs.read(inner.id)?.steps.find((one) => one.state === 'waiting')
    if (asking) h.app.runs.approve(inner.id, asking.name)
  }
})

test('[27-15] with show in reasoning the reasoning of a model step is sent as it arrives and is in working, begins anew with anew when the call went to a second model, and is not in the saved result; with save it is; with neither nothing is sent', async (t) => {
  const h = await followedApp(t)
  const hold = held()
  t.after(hold.go)
  h.say(() => ({ reasoning: ['Think', 'ing.'], text: 'Done.', hold: hold.hold }))
  const page = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('helper', { message: 'Help.' }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'shown', run })
  // A page that came in the middle is sent the reasoning so far in the run message, and the rest as parts.
  const reasoningSent = (): string =>
    [
      String(Reflect.get(Object(page.of('run', 'shown')[0]?.reasoning), 'text') ?? ''),
      ...partsOf(page.got, 'shown', 'reasoning').map((one) => String(one.text)),
    ].join('')
  await untilTried('the reasoning were sent', () => reasoningSent().includes('Thinking.'))
  const working: unknown = await h.app.call('helper.working', {}, { as: h.maya })
  assert.match(JSON.stringify(working), /"reasoning":"Thinking\."/)
  hold.go()
  await untilTried('the run ended', () => partsOf(page.got, 'shown', 'done').length === 1)
  assert.doesNotMatch(JSON.stringify(h.app.runs.read(run)?.steps), /Thinking/, 'not saved')
  // A call that went to the second model begins its reasoning anew: the first model waits until the page follows.
  let followed = (): void => undefined
  const following = new Promise<void>((done) => (followed = done))
  h.say(async (_, model) => {
    if (model === 'm-1') await following
    return model === 'm-1'
      ? { reasoning: ['First.'], failAfterReasoning: true }
      : { reasoning: ['Second.'], text: 'Done.' }
  })
  const second = notDropped(await h.app.start('helper', { message: 'Again.' }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'anew', run: second.run })
  await untilTried('the second run was sent', () => page.of('run', 'anew').length === 1)
  followed()
  await untilTried('the second run ended', () => partsOf(page.got, 'anew', 'done').length === 1)
  const anew = partsOf(page.got, 'anew', 'reasoning')
  assert.ok(
    anew.some((one) => one.anew === true),
    JSON.stringify(anew),
  )
  // With save the reasoning is in the saved result; with neither nothing of it is sent.
  h.say(() => ({ reasoning: ['Kept.'], text: 'Done.' }))
  const kept = notDropped(await h.app.start('keeper', { message: 'Keep.' }, { as: h.maya }))
  const quiet = notDropped(await h.app.start('quiet', { message: 'Hush.' }, { as: h.maya }))
  page.send({ t: 'run-watch', id: 'quiet', run: quiet.run })
  await untilTried('both ended', () => [kept.run, quiet.run].every((one) => h.app.runs.read(one)?.state === 'done'))
  assert.match(JSON.stringify(h.app.runs.read(kept.run)?.steps), /Kept\./)
  assert.doesNotMatch(JSON.stringify(h.app.runs.read(quiet.run)?.steps), /Kept\./)
  assert.equal(partsOf(page.got, 'quiet', 'reasoning').length, 0)
})
