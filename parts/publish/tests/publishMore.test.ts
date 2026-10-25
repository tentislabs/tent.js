import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { createEngine, makeSecretKey } from '../../engine/index.ts'
import { followServer, publish, push } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { ada, closing, computer, fetched, folderOf, sent, started } from './server.ts'

const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'

/** What a promise was refused with, or nothing where it was kept. */
const refusal = (
  done: Promise<unknown>,
): Promise<{ code?: string; message?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: Record<string, string> }) => error,
  )

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

/** A server, a computer, and a first publish of the project as it lies. */
async function published(
  t: TestContext,
  open?: { address?: string | string[]; insecure?: boolean },
): Promise<{ server: Server; here: Computer; to: ReturnType<Server['key']>; folder: string }> {
  const folder = folderOf(t)
  const server = await started(t, folder, open ? { open } : {})
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  return { server, here, to, folder }
}

test('[40-15b] [16-2@8c] a point that says checked over files that fail the check is T9101, and one pushed with --unchecked is still not published', async (t) => {
  const { server, here, to } = await published(t)
  here.edit(functions, '.where({ paid: false })', '.where({ nothing: false })')
  const lying = here.history.record(here.project, { by: ada, kind: 'command', checked: true })
  const said = await refusal(
    publish({ project: here.project, history: here.history, to, fetch: fetched, point: lying.id }),
  )
  assert.deepEqual([said?.code, said?.fields?.reason], ['T9101', 'check'], String(said?.message))
  const failing = here.history.record(here.project, { by: ada, kind: 'command', checked: false })
  assert.equal((await refusal(push({ history: here.history, to, fetch: fetched })))?.code, 'T9101')
  await push({ history: here.history, to, fetch: fetched, unchecked: true })
  assert.equal(server.history.pointer('main'), failing.id, 'it is shared')
  const refused = await refusal(
    publish({ project: here.project, history: here.history, to, fetch: fetched, point: failing.id }),
  )
  assert.equal(refused?.code, 'T9101', 'and never published')
})

test('[40-15b] a second publish at once is T9103', async (t) => {
  const { here, to, server } = await published(t)
  // A second publish is sent again and again while a first one is under way. A quick computer may end a publish
  // between two of them: the publish is made again, five times at most, until one is met under way.
  const codes = new Set<string>()
  for (let round = 0; round < 5 && !codes.has('busy'); round++) {
    here.edit(
      tables,
      '    note: text({ optional: true, max: NOTE_LENGTH }),',
      `    note: text({ optional: true, max: NOTE_LENGTH }),
    rush${round}: boolean({ optional: true }),`,
    )
    await here.save()
    let done = false
    const first = publish({
      project: here.project,
      history: here.history,
      to,
      fetch: fetched,
      acceptImpact: true,
    }).finally(() => {
      done = true
    })
    while (!done) {
      const answer = await sent(server, '/_t/publish', {}, to.key)
      codes.add(String(Object(answer.answer.error).code))
      if (Object(answer.answer.error).fields?.reason === 'busy') codes.add('busy')
    }
    await first
  }
  assert.ok(codes.has('busy'), `one publish runs at a time: ${[...codes]}`)
})

test('[40-15b] over plain http the addresses are found only from this computer, and on a server opened with insecure', async (t) => {
  // A request that names another host than this computer, as one of another computer does.
  const asked = (server: Server): Promise<number> =>
    new Promise((done, failed) => {
      const { port } = new URL(server.address)
      const sending = request(
        {
          host: '127.0.0.1',
          port,
          path: '/_t/sync/have',
          method: 'POST',
          headers: { host: 'shop.example.com', 'content-type': 'application/json' },
        },
        (answer) => {
          answer.resume()
          answer.on('end', () => done(answer.statusCode ?? 0))
        },
      )
      sending.on('error', failed)
      sending.end(JSON.stringify({ points: [], blobs: [] }))
    })
  const closed = await started(t, folderOf(t), { open: { address: '*' } })
  assert.equal(await asked(closed), 404, 'not found over plain http from another name')
  const open = await started(t, folderOf(t), { open: { address: '*', insecure: true } })
  assert.equal(await asked(open), 403, 'found, and refused for want of a key')
})

test('[40-15b] --back with a waiting run is refused, and --stop-runs lets it through', async (t) => {
  const { server, here, to } = await published(t)
  const first = running(server)
  here.edit(
    tables,
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ optional: true }),',
  )
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.start('approval', { order: 'waits' }, { as: 'system' })
  const refused = await refusal(
    publish({ project: here.project, history: here.history, to, fetch: fetched, back: true }),
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'waiting'])
  const back = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    back: true,
    stopRuns: true,
  })
  assert.equal(back.version, first)
  assert.equal(running(server), first)
})

test('[40-15b] an older point with another lock file is published with --install', async (t) => {
  const { server, here, to } = await published(t)
  const lock = (name: string): string =>
    `${JSON.stringify({ name: 'shop', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'shop', version: '1.0.0', description: name } } }, null, 2)}\n`
  writeFileSync(
    join(here.project, 'package.json'),
    `${JSON.stringify({ name: 'shop', version: '1.0.0', private: true })}\n`,
  )
  writeFileSync(join(here.project, 'package-lock.json'), lock('older'))
  here.edit(functions, ".limit(input('limit'))", '.limit(7)')
  const older = await here.save()
  writeFileSync(join(here.project, 'package-lock.json'), lock('newer'))
  await here.save()
  const stopped = await refusal(
    publish({ project: here.project, history: here.history, to, fetch: fetched, point: older }),
  )
  assert.deepEqual([stopped?.code, stopped?.fields?.reason], ['T9101', 'lock'])
  const done = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    point: older,
    install: true,
  })
  assert.equal(running(server), done.version)
})

test('[40-15b] a secret set through the values of a far server is used by the next publish, and is in no answer, no row of the log and no point', async (t) => {
  const { server, here, to } = await published(t)
  makeSecretKey(server.data)
  const value = 'smtp://a-value-nobody-reads.example.com:25'
  const set = await sent(server, '/_t/publish/values', { kind: 'secret', name: 'SMTP_URL', value }, to.key)
  assert.equal(set.status, 200)
  const listed = await sent(server, '/_t/publish/values', { list: true }, to.key)
  assert.deepEqual(Object(listed.answer.value).secrets, ['SMTP_URL'])
  assert.ok(!JSON.stringify([set.answer, listed.answer]).includes(value))
  here.edit(
    'tent.ts',
    "title: 'Shop' }",
    "title: 'Shop', mail: { from: 'shop@example.com', send: secret('SMTP_URL') } }",
  )
  here.edit('tent.ts', "import { project } from 'tentjs'", "import { project, secret } from 'tentjs'")
  await here.save()
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(running(server), done.version)
  // The log is kept with its write-ahead file: rows not yet in the file of the log stand beside it.
  for (const name of readdirSync(server.data).filter((one) => one.startsWith('logs.db')))
    assert.ok(!readFileSync(join(server.data, name)).includes(Buffer.from(value)), `${name} holds no value`)
  for (const point of server.history.list({ pointer: 'live' }))
    for (const print of [...Object.values(point.files ?? {}), ...(point.description ? [point.description] : [])])
      assert.ok(!new TextDecoder().decode(server.history.blob(print)).includes(value), 'no point holds it')
})

test('[40-15b] a server that follows takes the new version within its minute, and goes back when the server it follows went back', async (t) => {
  const { server, here, to, folder } = await published(t)
  const engine = createEngine({ port: 0 })
  const bundle = server.key(['bundle'])
  const follower = await followServer({
    engine,
    from: bundle,
    fetch: fetched,
    dataFolder: join(folder, 'follower'),
    every: 60_000,
  })
  closing(t, async () => {
    follower.close()
    await engine.close()
  })
  const first = running(server)
  assert.equal(
    follower
      .app()
      ?.versions()
      .find((one) => one.running)?.id,
    first,
    'with nothing running, it opens what is live there',
  )
  here.edit(
    tables,
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ optional: true }),',
  )
  await here.save()
  const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await follower.now()
  assert.equal(
    follower
      .app()
      ?.versions()
      .find((one) => one.running)?.id,
    next.version,
  )
  await publish({ project: here.project, history: here.history, to, fetch: fetched, back: true })
  await follower.now()
  assert.equal(
    follower
      .app()
      ?.versions()
      .find((one) => one.running)?.id,
    first,
  )
  // A key of `bundle` fetches what is live and nothing else.
  const source = Object.values(here.history.read(String(here.history.pointer('now')))?.files ?? {})[0]
  const asked = await sent(server, '/_t/sync/blobs', { want: [source] }, bundle.key)
  assert.equal(Object(asked.answer.error).code, 'T9104')
})
