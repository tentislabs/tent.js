import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { keyFile, keyText, newKey } from '../values/key.ts'
import { readValues, valuesFile, writeValues } from '../values/files.ts'
import { secretBound } from '../values/secrets.ts'
import { openText, sealText } from '../values/sealing.ts'
import type { Link } from '../index.ts'
import { threadShares } from '../work/threadShares.ts'
import { engineOf, running, send, userOf, workFolder } from './apps.ts'
import { counting } from './countingApps.ts'
import { helped } from './helping.ts'
import { addBoardUser, cookieOf, runsOf, watcher } from './watching.ts'
import { notDropped } from './started.ts'
import { joiningKeys } from './workLink.ts'
import { person, untilAsync, writerFor } from './workUse.ts'

// What the mending of a review of the whole holds, where the review gave a line and no test.

test('[22-14] a writer that finds a new key beside the key a variable gives undoes the replacing that was stopped: a value sealed under the new key opens under the given one, and the new key is left for the command', async (t) => {
  const run = await running(t, { project: 'valued' })
  const [key, next] = [newKey(), newKey()]
  const before = process.env.TENT_SECRET_KEY
  process.env.TENT_SECRET_KEY = keyText(key)
  t.after(() => {
    if (before === undefined) delete process.env.TENT_SECRET_KEY
    else process.env.TENT_SECRET_KEY = before
  })
  await run.app.close()
  // A run of the command that was stopped half way: one secret is sealed under the new key, the other is not yet.
  const file = valuesFile(run.dataFolder, 'secrets', 'test')
  writeValues(file, 'secrets', {
    MOVED: sealText(next, 'sealed under the new key', secretBound('test', 'MOVED')),
    STAYED: sealText(key, 'sealed under the given key', secretBound('test', 'STAYED')),
  })
  writeFileSync(keyFile(run.dataFolder, '.next'), `${keyText(next)}\n`)
  const app = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  t.after(() => app.close())
  assert.equal(
    existsSync(keyFile(run.dataFolder, '.next')),
    true,
    'the new key, which the command takes away, was taken',
  )
  const held = readValues(file, 'secrets')
  assert.deepEqual(
    ['MOVED', 'STAYED'].map((name) => openText(key, String(held[name]), secretBound('test', name))),
    ['sealed under the new key', 'sealed under the given key'],
  )
})

test('[20-7] what reaches the counts for a person after their removal, as a reader hands its batch on, is written as removed', async (t) => {
  const run = await counting(t, {
    change: (description) => {
      Reflect.set(description.project, 'countBy', 'caller')
    },
  })
  const { token } = JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8'))
  const removed = await send(run.app, `${run.origin}/_t/admin/data`, {
    body: JSON.stringify({ args: { what: 'user', do: 'remove', id: 'maya-after-review', yes: true } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  // A call that was made for her on another machine, whose count arrives once she is gone.
  await run.app.call('addNote', { title: 'by maya, elsewhere' }, { as: userOf('maya-after-review') })
  const rows = await run.counted()
  assert.deepEqual(
    rows.filter((row) => row.user === 'maya-after-review' || row.caller === 'user:maya-after-review'),
    [],
  )
  assert.ok(rows.some((row) => row.caller === 'removed' && row.name === 'addNote'))
})

test('[51-2] a worker counts the progress of a task in n, and after a go sends again each progress that was not saved', async (t) => {
  const writer = await writerFor(t)
  const sent: number[] = []
  let links = 0
  const engine = engineOf(t, { makers: { clock: () => writer.clock } })
  const worker = await engine.work({
    from: 'http://writer.test',
    key: joiningKeys.free,
    kinds: ['gpu'],
    folder: join(workFolder(t), 'worker'),
    insecure: true,
    reach: () => ({
      request: (request, how) => writer.app().request(request, how),
      link: (request): Link => {
        const link = writer.app().link(request)
        const first = links++ === 0
        return {
          ...link,
          send(frame) {
            const message = typeof frame === 'string' ? Object(JSON.parse(frame)) : {}
            if (message.t === 'progress') sent.push(Number(message.n))
            // The first progress is lost with its link, which is closed before the writer heard it.
            if (first && message.t === 'progress') {
              setImmediate(() => link.close())
              return
            }
            link.send(frame)
          },
        }
      },
    }),
  })
  t.after(() => worker.close({ now: true }))
  await untilAsync('the worker is ready', () =>
    writer
      .app()
      .workers()
      .some((listed) => Reflect.get(Object(listed), 'ready').length > 0),
  )
  const ada = await person(writer.app(), 'Ada')
  const { run } = notDropped(await writer.app().start('stepped', { n: 5 }, { as: ada }))
  await untilAsync('the first link was lost', () => sent.length > 0 && links === 1)
  // The worker dials again a beat later, on the clock of the test.
  await untilAsync('the worker dialled again', async () => {
    writer.advance(1000)
    await new Promise((done) => setTimeout(done, 20))
    return links > 1
  })
  assert.equal(await writer.app().runs.wait(run), 5)
  assert.deepEqual(sent, [1, 1, 2])
})

test('[21-8] a group that watches working runs again for the runs of its own caller alone: a run of another person costs it nothing', async (t) => {
  const h = await helped(t)
  h.say(() => ({ text: 'Fine.' }))
  const [ada, bo] = [await addBoardUser(h.app, 'Ada'), await addBoardUser(h.app, 'Bo')]
  const page = watcher(h.app, h.origin, { cookie: cookieOf(h.app, bo), as: bo })
  await page.watch('w', 'helper.working', {})
  const asked = (): number => runsOf(h.dataFolder, 'helper.working')
  const before = asked()
  assert.ok(before > 0, 'the watch of working is written into the log of calls')
  const as = userOf(ada)
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as })), 'id'))
  const { run } = notDropped(await h.app.start('helper', { message: 'Go.', thread: chat }, { as }))
  await h.app.runs.wait(run)
  await new Promise((done) => setTimeout(done, 200))
  assert.equal(asked(), before, "Bo's working ran again for the run of Ada")
})

test('[21-22] the processor time of the thread of a worker is shared among the tasks at work on it, so the tasks of one thread never count more than it worked', () => {
  let clock = 0
  const shares = threadShares(() => clock)
  shares.begin('a')
  clock = 10
  shares.begin('b')
  clock = 30
  const a = shares.end('a')
  clock = 40
  const b = shares.end('b')
  assert.deepEqual([a, b], [20, 20])
})
