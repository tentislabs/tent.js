import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Said } from './followedApp.ts'
import { followedApp, liveOf } from './followedApp.ts'
import type { Message } from './watching.ts'
import { untilTried, watcher } from './watching.ts'
import { notDropped } from './started.ts'

/** The runs that the step parts of a watch named as called. */
const calledIn = (got: Message[], id: string): string[] =>
  got
    .filter((one) => one.t === 'run-part' && one.id === id && one.kind === 'step')
    .flatMap((one) => {
      const runs: unknown = Reflect.get(Object(one.step), 'runs')
      return Array.isArray(runs) ? runs.map(String) : []
    })

/** Whether a request is one of the inner agent. */
const ofInner = (request: ReplyRequest): boolean => request.instructions?.includes('You refund.') === true

test('[05-5.7] two visitors who read working of one flow whose follow lets anyone in are each sent their own runs, and never the text of the other', async (t) => {
  const h = await followedApp(t)
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
  const [first, second] = [await visitor('first-one'), await visitor('second-one')]
  await untilTried(
    'each was sent their own',
    () => JSON.stringify(first.got).includes('first-one') && JSON.stringify(second.got).includes('second-one'),
  )
  assert.doesNotMatch(JSON.stringify(first.got), /second-one/)
  assert.doesNotMatch(JSON.stringify(second.got), /first-one/)
})

test('[05-5.9] run-watch on a run of a flow that states no follow is failed with T0001, and working of a flow read by a caller whom its follow does not let in is refused with T3101', async (t) => {
  const h = await followedApp(t)
  const { run } = notDropped(await h.app.start('unfollowed', {}, { as: h.maya }))
  await h.app.runs.wait(run)
  const page = await liveOf(h, h.maya)
  page.send({ t: 'run-watch', id: 'r', run })
  await untilTried('the watch failed', () => page.of('failed', 'r').length === 1)
  assert.equal(Object(page.of('failed', 'r')[0]?.error).code, 'T0001')
  const refused = await page.watch('staff', 'forStaff.working', {})
  assert.equal(Object(refused.error).code, 'T3101', JSON.stringify(refused))
})

test("[05-5.13] [05-5.14] run-watch on a run that another caller's agent called, by its id, is T0001; and the starter of a flow that states follow and runs as the system is answered T0001 for the agent run that a step of that flow called", async (t) => {
  const h = await followedApp(t)
  h.say((request): Said => {
    if (ofInner(request)) return { text: 'Inside.' }
    const last = request.messages.at(-1)
    return last?.who === 'user' ? { calls: [{ tool: 'inner', input: { message: 'Go in.' } }] } : { text: 'Back.' }
  })
  const own = await liveOf(h, h.maya)
  const { run } = notDropped(await h.app.start('helper', { message: 'Help.' }, { as: h.maya }))
  own.send({ t: 'run-watch', id: 'top', run })
  await untilTried('the called run was named', () => calledIn(own.got, 'top').length > 0)
  const [called] = calledIn(own.got, 'top')
  const other = await liveOf(h, h.leo)
  other.send({ t: 'run-watch', id: 'called', run: String(called) })
  await untilTried('the watch failed', () => other.of('failed', 'called').length === 1)
  assert.equal(Object(other.of('failed', 'called')[0]?.error).code, 'T0001')
  h.say((request): Said => {
    const last = request.messages.at(-1)
    return last?.who === 'user' ? { calls: [{ tool: 'refund', input: { order: 'o1' } }] } : { text: 'Refunded.' }
  })
  const swept = notDropped(await h.app.start('sweep', {}, { as: h.maya }))
  await untilTried('the agent under it waits', () =>
    (h.app.runs.find({ top: swept.run }) ?? []).some((one) => one.flow === 'inner' && one.state === 'waiting'),
  )
  const [inner] = (h.app.runs.find({ top: swept.run }) ?? []).filter((one) => one.flow === 'inner')
  own.send({ t: 'run-watch', id: 'flow', run: swept.run })
  own.send({ t: 'run-watch', id: 'under', run: String(inner?.id) })
  await untilTried('both were answered', () => own.of('run', 'flow').length + own.of('failed', 'under').length === 2)
  assert.equal(own.of('run', 'flow').length, 1, 'the flow is followed by its own follow')
  assert.equal(Object(own.of('failed', 'under')[0]?.error).code, 'T0001')
  const asking = h.app.runs.read(String(inner?.id))?.steps.find((one) => one.state === 'waiting')
  if (asking) h.app.runs.approve(String(inner?.id), asking.name)
})
