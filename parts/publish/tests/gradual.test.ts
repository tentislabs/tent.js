import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import { publish } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'
import { notDropped } from './started.ts'

const project = 'tent.ts'

/** The version that runs on a server, and the share of the callers that a version is given while a release goes. */
const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id
const shareOf = (server: Server, version: string): number | undefined =>
  Object(server.app.versions().find((one) => one.id === version)).share

/** A caller of the tests, by its number: a signed-in user whose id the release reads. */
const user = (n: number): Caller => ({ kind: 'user', user: { id: `u${String(n).padStart(4, '0')}`, roles: [] } })

/** A query of the shop that answers the number it is handed, and in the second version which version answers it. */
const ping = (body: string): string =>
  `import { number, query, text } from 'tentjs'\n\nexport const ping = query('ping', {\n  access: 'signedIn',\n  input: { n: number() },\n  output: text(),\n  run: ({ input }) => {\n    ${body}\n  },\n})\n`

// A call of these tests takes under a millisecond, whose 95th share other work on the computer moves by more than a
// fifth: the time of a call is not what they hold, so the watch of time is set out of reach.
const quick = 'calls: 20, slower: 1000'

/** A server and a computer, the project releasing gradually by halves, and a first publish of it. */
async function first(
  t: TestContext,
  release = `{ steps: [0.5, 1], every: '1 hour', watch: { ${quick} } }`,
): Promise<{ server: Server; here: Computer; to: ReturnType<Server['key']>; was: string }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  here.edit(project, "title: 'Shop' }", `title: 'Shop', release: ${release} }`)
  writeFileSync(join(here.project, 'functions', 'ping.ts'), ping("return 'one'"))
  await here.save()
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched, acceptImpact: true })
  return { server, here, to, was: done.version }
}

test('[44-3] a new version that fails one call in ten is taken back at its first step: every visitor is on the old one, with the numbers in the log and the history', async (t) => {
  const { server, here, to, was } = await first(t)
  writeFileSync(
    join(here.project, 'functions', 'ping.ts'),
    ping("if (input.n % 10 === 0) throw new RangeError('the new version broke')\n    return 'two'"),
  )
  await here.save()
  const released = await publish({ project: here.project, history: here.history, to, fetch: fetched, gradual: true })
  // The release goes: the old version runs, and the new one is given half of the callers.
  assert.equal(running(server), was)
  assert.equal(shareOf(server, released.version), 0.5)
  for (let n = 0; n < 200; n++) await server.app.call('ping', { n }, { as: user(n) }).catch(() => undefined)
  // Taken back: every caller is answered by the old version, the one that failed among them.
  assert.equal(shareOf(server, released.version), 0)
  assert.equal(running(server), was)
  for (let n = 0; n < 50; n += 10) assert.equal(await server.app.call('ping', { n }, { as: user(n) }), 'one')
  // Why, with the numbers of both, in the log and in the history of the server.
  const log = new DatabaseSync(join(server.data, 'logs.db'), { readOnly: true })
  const lines = log
    .prepare('SELECT message, data FROM lines')
    .all()
    .map((row) => `${String(row.message)} ${String(row.data)}`)
  log.close()
  assert.ok(
    lines.some((line) => /taken back/.test(line) && /failed \d+ of \d+ calls/.test(line)),
    lines.join('\n'),
  )
  const status = await publish({ project: here.project, history: here.history, to, fetch: fetched, release: 'status' })
  assert.equal(status.release?.state, 'back')
  assert.match(String(status.release?.why), /failed \d+ of \d+ calls, against \d+ of \d+/)
  assert.match(String(server.history.read(released.point)?.note), /taken back: the new version failed \d+ of \d+ calls/)
})

test('[44-3] a sound new version is widened step by step to every visitor, at the end of each step and by hand', async (t) => {
  const { server, here, to, was } = await first(t, `{ steps: [0.25, 0.5, 1], every: '300 ms', watch: { ${quick} } }`)
  writeFileSync(join(here.project, 'functions', 'ping.ts'), ping("return 'two'"))
  await here.save()
  const released = await publish({ project: here.project, history: here.history, to, fetch: fetched, gradual: true })
  assert.equal(shareOf(server, released.version), 0.25)
  // By hand: one step on.
  const widened = await publish({ project: here.project, history: here.history, to, fetch: fetched, release: 'widen' })
  assert.equal(widened.release?.share, 0.5)
  // By itself: at the end of its step it is widened to every visitor, and runs as the one version.
  const ends = performance.now() + 20_000
  while (running(server) !== released.version) {
    assert.ok(performance.now() < ends, 'the release widens to every visitor by itself')
    for (let n = 0; n < 5; n++) await server.app.call('ping', { n }, { as: user(n) })
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.notEqual(running(server), was)
  for (let n = 0; n < 40; n++) assert.equal(await server.app.call('ping', { n }, { as: user(n) }), 'two')
})

test('[44-3] a person stays on one version through the release, and a run started on the new version ends on it after a taking back', async (t) => {
  const { server, here, to, was } = await first(t)
  writeFileSync(join(here.project, 'functions', 'ping.ts'), ping("return 'two'"))
  await here.save()
  const released = await publish({ project: here.project, history: here.history, to, fetch: fetched, gradual: true })
  // Each caller is answered by one version, every time, by a fingerprint of its id against the release.
  const answers = new Map<number, unknown>()
  for (let n = 0; n < 60; n++) answers.set(n, await server.app.call('ping', { n }, { as: user(n) }))
  assert.ok([...answers.values()].includes('one') && [...answers.values()].includes('two'))
  for (let round = 0; round < 3; round++)
    for (let n = 0; n < 60; n++) assert.equal(await server.app.call('ping', { n }, { as: user(n) }), answers.get(n))
  // A run that a caller of the new version starts runs on it, and ends on it after the release is taken back.
  const onNew = [...answers].find(([, answer]) => answer === 'two')?.[0]
  assert.ok(onNew !== undefined)
  const { run } = notDropped(await server.app.start('approval', { order: 'gradual' }, { as: user(onNew) }))
  assert.equal(server.app.runs.read(run)?.version, released.version)
  await publish({ project: here.project, history: here.history, to, fetch: fetched, release: 'back' })
  assert.equal(shareOf(server, released.version), 0)
  assert.equal(running(server), was)
  const ends = performance.now() + 20_000
  while (server.app.runs.read(run)?.state !== 'waiting') {
    assert.ok(performance.now() < ends, 'the run waits')
    await new Promise((done) => setTimeout(done, 5))
  }
  server.app.runs.approve(run, 'approved')
  assert.equal(await server.app.runs.wait(run), 'approved gradual')
  assert.equal(server.app.runs.read(run)?.version, released.version)
})

test('[44-3] [16-2@10d] a gradual release whose table change is hard is refused with T9108, which names the change', async (t) => {
  const { server, here, to, was } = await first(t)
  const versions = server.app.versions().length
  here.edit(
    'tables/orders.ts',
    '    title: text({ min: 1, max: 80 }),',
    "    name: text({ min: 1, max: 80, was: ['title'] }),",
  )
  here.edit('functions/orders.ts', "orders.add({ title: input('title')", "orders.add({ name: input('title')")
  await here.save()
  const refused = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    gradual: true,
    acceptImpact: true,
  }).then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: Record<string, string> }) => error,
  )
  assert.equal(refused?.code, 'T9108')
  // The change is named in its fields, which a caller is sent on live data too.
  assert.match(String(refused?.fields?.steps), /renameColumn/)
  assert.equal(running(server), was)
  assert.equal(server.app.versions().length, versions)
})
