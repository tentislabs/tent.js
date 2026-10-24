import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { App } from '../index.ts'
import { bundled, engineOf } from './apps.ts'
import { gateOf, letAllGo, scripted } from './followedApp.ts'
import type { World } from './machines.ts'
import { current, readerIn, worldOf } from './machines.ts'
import type { Message } from './watching.ts'
import { watcher } from './watching.ts'

/** A writer of the project of followed runs, and a near reader of it, sharing the clock of a world. */
async function machines(t: TestContext) {
  const world = worldOf(t)
  const model = scripted()
  t.after(letAllGo)
  const bundle = await bundled(t, { project: 'followed' }, world.work)
  const makers = { clock: () => world.clock.clock, providers: () => ({ mine: model.mine }) }
  const writer = await engineOf(t, { makers }).open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: 'https://writer.test',
    readers: ['n'.repeat(40), { key: 'f'.repeat(40), far: true }],
  })
  world.apps['https://writer.test'] = writer
  const near = await readerIn(world, 'near', engineOf(t, { makers }))
  world.apps['https://near.test'] = near
  await current(world, near)
  return { world, writer, near, model, makers }
}

/**
 * A visitor starts the open helper on the writer, and answers its run and the cookie of the visitor. The cookie
 * is a plain id, which every machine reads: over a secure connection the browser sends it under its prefix.
 */
async function visitorStarts(writer: App, message: string): Promise<{ run: string; cookie: string }> {
  const answer = await writer.request(
    new Request('http://localhost/_t/call/openHelper', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ input: { message } }),
    }),
  )
  const body = Object(await answer.json())
  const plain = (answer.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  return { run: String(Object(body.value).run), cookie: `__Host-${plain}` }
}

/** Waits, with the beats of the world passing, until something holds. */
async function beatsUntil(world: World, what: string, holds: () => boolean): Promise<void> {
  for (let i = 0; i < 60 && !holds(); i++) await world.beat(1)
  assert.equal(holds(), true, `never: ${what}`)
}

const partsOf = (got: Message[], id: string, kind: string): Message[] =>
  got.filter((one) => one.t === 'run-part' && one.id === id && one.kind === kind)

/** The runs that the steps of a run named as called, as a page that follows it holds them. */
const calledIn = (got: Message[], id: string): string[] =>
  [
    ...got
      .filter((one) => one.t === 'run' && one.id === id)
      .flatMap((one) => (Array.isArray(one.steps) ? one.steps : [])),
    ...partsOf(got, id, 'step').map((one) => one.step),
  ].flatMap((step) => {
    const runs: unknown = Reflect.get(Object(step), 'runs')
    return Array.isArray(runs) ? runs.map(String) : []
  })

/** What a page holds of a field of a run so far: from the run message, and the parts after it. */
const soFar = (got: Message[], id: string, kind: 'text' | 'reasoning'): string =>
  [
    String(Reflect.get(Object(got.find((one) => one.t === 'run' && one.id === id)?.[kind]), 'text') ?? ''),
    ...partsOf(got, id, kind).map((one) => String(one.text)),
  ].join('')

test('[29-12] a page that follows a run on a reader is sent its text as it is written, its reasoning, its steps and the ids of the runs they called, and working answers there; a reader that joins while a model step runs holds its text so far', async (t) => {
  // The model is let go before the machines close, whatever the test came to.
  let go = (): void => undefined
  const hold = new Promise<void>((done) => (go = done))
  t.after(() => go())
  const { world, writer, near, model, makers } = await machines(t)
  model.say((request) =>
    request.instructions?.includes('You answer from inside.')
      ? { reasoning: ['Thinking.'], parts: ['Ins', 'ide.'], hold }
      : request.messages.at(-1)?.who === 'user'
        ? { calls: [{ tool: 'openInner', input: { message: 'Go in.' } }] }
        : { text: 'Back.' },
  )
  const { run, cookie } = await visitorStarts(writer, 'Help.')
  const page = watcher(near, 'https://near.test', { cookie })
  // A run is followed on a reader once the reader holds it.
  await beatsUntil(world, 'the reader holds the run', () => near.runs.read(run) !== undefined)
  page.send({ t: 'run-watch', id: 'top', run })
  await beatsUntil(world, 'the called run was named on the reader', () => calledIn(page.got, 'top').length > 0)
  const [inner] = calledIn(page.got, 'top')
  if (!inner) throw new Error('no called run')
  await beatsUntil(world, 'the reader holds the called run', () => near.runs.read(inner) !== undefined)
  page.send({ t: 'run-watch', id: 'inner', run: inner })
  await beatsUntil(world, 'the text so far reached the reader', () => soFar(page.got, 'inner', 'text').includes('Ins'))
  assert.equal(soFar(page.got, 'inner', 'reasoning'), 'Thinking.')
  // The agent at the top answers the entry of a run below it, by the run that `under` names.
  const working = await page.watch('w', 'openHelper.working', { run: inner })
  assert.match(JSON.stringify(working), /Ins/)
  // A reader that joins while the model step runs holds its text so far.
  const far = await readerIn(world, 'far', engineOf(t, { makers }))
  world.apps['https://far.test'] = far
  await current(world, far)
  const late = watcher(far, 'https://far.test', { cookie })
  late.send({ t: 'run-watch', id: 'inner', run: inner })
  await beatsUntil(world, 'the late reader holds the text so far', () =>
    soFar(late.got, 'inner', 'text').includes('Ins'),
  )
  go()
  await beatsUntil(world, 'the end reached the page', () => partsOf(page.got, 'inner', 'done').length === 1)
  assert.equal(partsOf(page.got, 'inner', 'done')[0]?.text, 'Inside.')
})

test('[29-12] what the steps of a run say reaches a page that follows it on a reader', async (t) => {
  const { world, writer, near, model } = await machines(t)
  const open = gateOf('open')
  model.say((request) =>
    request.messages.at(-1)?.who === 'user' ? { calls: [{ tool: 'openCount', input: { n: 7 } }] } : { text: 'Done.' },
  )
  const { run, cookie } = await visitorStarts(writer, 'Count.')
  const page = watcher(near, 'https://near.test', { cookie })
  // A run is followed on a reader once the reader holds it.
  await beatsUntil(world, 'the reader holds the run', () => near.runs.read(run) !== undefined)
  page.send({ t: 'run-watch', id: 'top', run })
  await beatsUntil(world, 'the called run was named on the reader', () => calledIn(page.got, 'top').length > 0)
  const [counting] = calledIn(page.got, 'top')
  if (!counting) throw new Error('no called run')
  await beatsUntil(world, 'the reader holds the called run', () => near.runs.read(counting) !== undefined)
  page.send({ t: 'run-watch', id: 'r', run: counting })
  const said = (): unknown[] => [
    ...page.of('run', 'r').flatMap((one) => (Array.isArray(one.said) ? one.said : [])),
    ...partsOf(page.got, 'r', 'said'),
  ]
  await beatsUntil(world, 'what the step said reached the reader', () =>
    said().some((one) => Reflect.get(Object(Reflect.get(Object(one), 'value')), 'at') === 7),
  )
  open()
  await beatsUntil(world, 'the run ended on the reader', () => partsOf(page.got, 'r', 'done').length === 1)
})
