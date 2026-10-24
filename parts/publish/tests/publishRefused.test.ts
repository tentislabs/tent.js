import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeSecretKey } from '../../engine/index.ts'
import { publish } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'
import { notDropped } from './started.ts'

const tables = 'tables/orders.ts'
const project = 'tent.ts'

/** What a promise was refused with, or nothing where it was kept. */
const refusal = (
  done: Promise<unknown>,
): Promise<{ code?: string; message?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: Record<string, string> }) => error,
  )

/** The version that runs on a server. */
const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

/** A server, a computer, and a first publish of the project as it lies. */
async function published(
  t: Parameters<typeof folderOf>[0],
): Promise<{ server: Server; here: Computer; to: ReturnType<Server['key']> }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  return { server, here, to }
}

test('[40-5] [16-2@8c] a secret with no value on the target is T9103, which names it; try answers it with nothing changed', async (t) => {
  const { server, here, to } = await published(t)
  here.edit(project, "title: 'Shop' }", "title: 'Shop', mail: { from: 'shop@example.com', send: secret('SMTP_URL') } }")
  here.edit(project, "import { project } from 'tentjs'", "import { project, secret } from 'tentjs'")
  await here.save()
  const before = running(server)
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.match(String(tried.refused), /^secret: .*SMTP_URL/)
  assert.equal(running(server), before)
  const refused = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
  assert.deepEqual([refused?.code, refused?.fields?.reason, refused?.fields?.count], ['T9103', 'secret', '1'])
  assert.equal(running(server), before)

  // A secret set on the target, as `--to` hands it, is used by the publish that follows.
  makeSecretKey(server.data)
  await server.app.values({ kind: 'secret', name: 'SMTP_URL', value: 'smtp://mail.example.com:25' })
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(running(server), done.version)
})

test('[40-5] a hard publish while a run waits is T9103, which --stop-runs lets through, and try answers it with nothing changed', async (t) => {
  const { server, here, to } = await published(t)
  const { run } = notDropped(await server.app.start('approval', { order: 'first' }, { as: 'system' }))
  here.edit(tables, '    title: text({ min: 1, max: 80 }),', "    name: text({ min: 1, max: 80, was: ['title'] }),")
  here.edit('functions/orders.ts', "orders.add({ title: input('title')", "orders.add({ name: input('title')")
  await here.save()
  const before = running(server)
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.equal(tried.hard, true)
  assert.match(String(tried.refused), /^waiting/)
  const refused = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'waiting'])
  assert.equal(running(server), before)
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched, stopRuns: true })
  assert.equal(done.hard, true)
  assert.equal(running(server), done.version)
  assert.equal(server.app.runs.read(run)?.state, 'stopped')
})

test('[40-7] [16-2@8c] a new version whose health query fails never becomes live, nor one whose module does not load, nor one whose browser file holds a secret of the target', async (t) => {
  const { server, here, to } = await published(t)
  const before = running(server)
  const live = server.history.pointer('live')
  const refused = async (): Promise<void> => {
    await here.save()
    const answer = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
    assert.deepEqual([answer?.code, answer?.fields?.reason], ['T9103', 'health'], String(answer?.message))
    assert.equal(running(server), before)
    assert.equal(server.history.pointer('live'), live)
    assert.equal(server.app.versions().length, 1, 'the version that failed is dropped again')
  }
  // A health query that fails.
  here.edit(project, "title: 'Shop' }", "title: 'Shop', publish: { health: 'healthy' } }")
  writeFileSync(
    join(here.project, 'functions', 'health.ts'),
    "import { number, query } from 'tentjs'\n\nexport const healthy = query('healthy', {\n  access: 'nobody',\n  output: number(),\n  run: ({ db }) => {\n    if (db.orders.count() >= 0) throw new Error('down')\n    return 1\n  },\n})\n",
  )
  await refused()
  // A module that loads where it is built and not where it runs.
  writeFileSync(
    join(here.project, 'functions', 'health.ts'),
    "import { number, query } from 'tentjs'\n\nif (import.meta.url.includes('/versions/')) throw new Error('this module does not load here')\n\n// Code, so that the file is built into a module that the server loads.\nexport const healthy = query('healthy', { access: 'nobody', output: number(), run: () => Number('1') })\n",
  )
  await refused()
  // A browser file that holds the value of a secret of the target.
  writeFileSync(
    join(here.project, 'functions', 'health.ts'),
    "import { number, query } from 'tentjs'\n\nexport const healthy = query('healthy', { access: 'nobody', output: number(), run: () => 1 })\n",
  )
  mkdirSync(join(here.project, 'screens'), { recursive: true })
  writeFileSync(
    join(here.project, 'screens', 'home.tsx'),
    "import { screen } from 'tentjs/ui'\nimport { held } from '../helpers/held'\n\nexport const home = screen('home', {\n  path: '/',\n  access: 'anyone',\n  view: () => <span>{String(held.length)}</span>,\n})\n",
  )
  // A helper that the view imports is built into the browser files with the text it holds.
  mkdirSync(join(here.project, 'helpers'), { recursive: true })
  writeFileSync(join(here.project, 'helpers', 'held.ts'), "export const held: string = 'value-of-the-target-secret'\n")
  makeSecretKey(server.data)
  await server.app.values({ kind: 'secret', name: 'TARGET_ONLY', value: 'value-of-the-target-secret' })
  await refused()
})
