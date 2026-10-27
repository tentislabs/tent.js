import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import {
  beat,
  callsOf,
  codeOf,
  current,
  level,
  logRows,
  machinesOf,
  moment,
  projectOf,
  readersHeld,
  send,
  titles,
  until,
  writerOf,
} from './many.ts'
import { watcher, writeOf } from './watched.ts'

/** Answers what says whether a promise has ended. */
function watched(work: Promise<unknown>): () => boolean {
  let ended = false
  const end = (): void => {
    ended = true
  }
  work.then(end, end)
  return () => ended
}

const system = { as: 'system' } as const

/** Writes an order on the writer as the system, with no request. */
const order = (app: TestApp, title: string): Promise<unknown> =>
  app.write([{ add: 'orders', values: { title } }], system)

/** The number of the epoch that a machine stands in, as a mark names it. */
const epochOf = async (app: TestApp): Promise<string> =>
  String((await send(app, 'listOrders')).headers.get('tent-at')).split('.')[0]

/**
 * Changes one text of the project of a test for another, builds the project into a folder of its own, and answers
 * that folder: one more version of the app.
 */
async function nextVersion(t: TestContext, name: string, file: string, from: string, to: string): Promise<string> {
  const folder = projectOf(t)
  const text = readFileSync(join(folder, file), 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(join(folder, file), text.replace(from, to))
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', name) })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  return built.bundleFolder
}

/** The id of the version that a machine runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

test('[29-8] a watch on a reader is answered with no request reaching the writer, and what it is sent names the write it was worked out at', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await level(app, near, far)
  const before = callsOf(t, 'data', 'listOrders')
  for (const reader of [near, far]) {
    const page = watcher(reader)
    const first = await page.watch('a', 'listOrders')
    assert.deepEqual([first.t, Object(first.value).length], ['result', (await titles(reader)).length])
    // `at` is the write the answer was worked out at, in the form of `Tent-At`.
    assert.equal(first.at, `${await epochOf(app)}.${reader.at().n}`)
    await send(app, 'addOrder', { title: `two for ${reader.at().n}` })
    await until('the page of the reader is sent the row', () => page.of('rows', 'a').length === 1)
    const [rows] = page.of('rows', 'a')
    assert.equal(Object(rows.put).length, 1)
    assert.equal(writeOf(rows), app.at().n)
    page.close()
  }
  // The reader ran the query itself: the writer was asked for it only by this test, once for the number of the epoch.
  assert.equal(callsOf(t, 'data', 'listOrders'), before + 2)
  // A page of the writer is told the write too, on an app that has a reader.
  const onWriter = watcher(app)
  assert.equal(writeOf(await onWriter.watch('a', 'listOrders')), app.at().n)
})

test('[29-8] an app on one machine names no write in what a page is sent', async (t) => {
  const app = await writerOf(t)
  await order(app, 'one')
  const page = watcher(app)
  const first = await page.watch('a', 'listOrders')
  assert.deepEqual([first.t, 'at' in first], ['result', false])
  await order(app, 'two')
  await until('the page is sent the row', () => page.of('rows', 'a').length === 1)
  assert.equal('at' in page.of('rows', 'a')[0], false)
})

test('[29-8] a page that watches on the far reader and calls a change there is sent its rows no later than the answer of its call', async (t) => {
  const { far } = await machinesOf(t)
  const page = watcher(far)
  await page.watch('a', 'listOrders')
  for (const title of ['mine', 'mine too', 'and a third']) {
    const held = page.of('rows', 'a').length + page.of('result', 'a').length
    const answer = await send(far, 'addOrder', { title })
    assert.equal(answer.status, 200)
    // The answer of the call has arrived, and what the reader sent the page before it is taken in one turn of the
    // runtime, with no time given to it: it holds the row.
    await new Promise((done) => setImmediate(done))
    const sent = [...page.of('rows', 'a'), ...page.of('result', 'a')]
    assert.equal(sent.length, held + 1, title)
    assert.ok(JSON.stringify(page.got.at(-1)).includes(`"${title}"`), title)
  }
})

test('[29-8] pages on three machines that watch one query end with the same answer, each in the order its machine applied, and none is sent a row before its write is settled', async (t) => {
  const { app, near, far } = await machinesOf(t)
  const machines = [app, near, far]
  const pages = machines.map(watcher)
  for (const page of pages) await page.watch('a', 'listOrders')
  const sent = (): number[] => pages.map((page) => page.got.length)
  const before = sent()

  // A write that waits for the near reader is committed on the writer and applied on the far reader, and is
  // settled on neither: no page is sent its row, on any machine.
  near.hold()
  const held = app.at().n
  const write = send(app, 'addOrder', { title: 'held' })
  await until('the far reader holds the write that waits', () => app.at().n === held + 1 && far.at().n === held + 1)
  await moment(300)
  assert.deepEqual(sent(), before)
  near.release()
  assert.equal((await write).status, 200)
  await until('every page is sent the row', () => pages.every((page, i) => page.got.length > before[i]))
  for (const page of pages) assert.equal(writeOf(page.got.at(-1)), held + 1)

  // Many writes, from every machine at once: each page ends with the same answer.
  await Promise.all(Array.from({ length: 30 }, (_, i) => send(machines[i % 3], 'addOrder', { title: `order ${i}` })))
  await level(app, near, far)
  const last = app.at().n
  await until('every page was sent what the last write left', () =>
    pages.every((page) => writeOf(page.got.at(-1)) === last),
  )
  const marks = pages.map((page) => page.got.at(-1)?.mark)
  assert.deepEqual(marks, [marks[0], marks[0], marks[0]])
  // What a page is sent stands at a write of its machine, and never at an earlier one than the message before.
  for (const [i, page] of pages.entries()) {
    const numbers = page.got.map(writeOf)
    assert.equal(numbers.includes(undefined), false, `machine ${i}`)
    assert.deepEqual(
      numbers,
      [...numbers].sort((a, b) => Number(a) - Number(b)),
      `machine ${i}`,
    )
  }
})

test('[29-8] a change that holds tables marks the groups that read one of them and no other, and a change that holds all marks every group', async (t) => {
  const { app, near, far } = await machinesOf(t)
  await send(app, 'addOrder', { title: 'one' })
  await send(app, 'addCustomer', { name: 'Ada' })
  await level(app, near, far)
  const page = watcher(far)
  await page.watch('orders', 'listOrders')
  await page.watch('customers', 'listCustomers')
  // The far reader is the third machine of the test: its log holds each run of a group.
  const runs = (): number[] => ['listOrders', 'listCustomers'].map((name) => callsOf(t, 'reader-3', name))
  const first = runs()

  // A raw SQL write that states its one table: its change holds `tables`, and no row.
  assert.equal((await send(app, 'statedWrite')).status, 200)
  await level(app, near, far)
  await until('the group that reads the table was run again', () => runs()[0] === first[0] + 1)
  await moment(100)
  assert.deepEqual(runs(), [first[0] + 1, first[1]])

  // A raw SQL write that states nothing: its change holds `all`.
  assert.equal((await send(app, 'rawWrite')).status, 200)
  await level(app, near, far)
  await until('every group was run again', () => runs()[0] === first[0] + 2 && runs()[1] === first[1] + 1)
  // The answers did not change, so the page was sent nothing more.
  assert.equal(page.got.length, 2)
})

test('[29-8] a watch that names a number the far reader does not hold yet is answered once it does, and one that names a made-up number once the reader has applied the number of its next beat', async (t) => {
  const { app, far } = await machinesOf(t)
  const epoch = await epochOf(app)
  const page = watcher(far)

  // The far reader lacks a write that the writer holds: a watch that names it waits for it.
  far.hold()
  await order(app, 'one')
  const wanted = app.at().n
  assert.ok(far.at().n < wanted)
  page.ask('a', 'listOrders', { seen: `${epoch}.${wanted}` })
  await moment(300)
  assert.equal(page.got.length, 0, JSON.stringify(page.got))
  far.release()
  await until('the watch was answered', () => page.got.length === 1)
  assert.deepEqual([page.got[0].t, Object(page.got[0].value).length, writeOf(page.got[0])], ['result', 1, wanted])

  // A number that no write has, and a mark that does not read: each watch waits for the answer to a beat that the
  // reader sends after the watch arrived. While the link carries nothing no such answer arrives, however many
  // beats the reader sends.
  await level(app, far)
  far.hold()
  page.ask('b', 'listOrders', { seen: `${epoch}.${wanted + 1000}` })
  page.ask('c', 'listOrders', { seen: 'no mark at all' })
  await beat(app)
  await moment(300)
  assert.deepEqual([page.of('result', 'b').length, page.of('result', 'c').length], [0, 0])
  far.release()
  await until(
    'the two watches were answered',
    () => page.of('result', 'b').length + page.of('result', 'c').length === 2,
  )
  // A mark of an older epoch is held already.
  assert.equal((await page.watch('d', 'listOrders', { seen: `0.${wanted + 1000}` })).t, 'result')
  // The writer holds every write it ever answered: it waits for nothing.
  const onWriter = watcher(app)
  assert.equal((await onWriter.watch('a', 'listOrders', { seen: `${epoch}.${wanted + 1000}` })).t, 'result')
})

test('[29-8] with two versions loadable a page of the older one is served by a reader, and app.switch waits for both readers to hold the version', async (t) => {
  const { app, near, far } = await machinesOf(t)
  const first = running(app)
  for (const title of ['one', 'two', 'three']) await order(app, title)
  await level(app, near, far)

  // A second version, whose list holds one row at most, is added on the writer: every reader fetches it at once.
  const limited = "orders.oldest('createdAt').limit(1000)"
  const second = await app.add(
    await nextVersion(t, 'second', 'functions/functions.ts', limited, limited.replace('1000', '1')),
  )
  await until('both readers hold the second version', () =>
    [near, far].every((one) => one.versions().some((held) => held.id === second)),
  )
  assert.deepEqual(
    [app, near, far].map((one) => running(one)),
    [first, first, first],
  )
  // The versions are the writer's: a reader adds, switches and drops nothing by itself.
  assert.equal(await codeOf(near.switch(second)), 'T0030')
  assert.equal(await codeOf(far.drop(second)), 'T0030')
  // Each version that can be loaded serves the pages that name it, on a reader as on the writer.
  const before = callsOf(t, 'data', 'listOrders')
  for (const reader of [near, far]) {
    const page = watcher(reader)
    assert.equal(Object((await page.watch('old', 'listOrders', { version: first })).value).length, 3)
    assert.equal(Object((await page.watch('new', 'listOrders', { version: second })).value).length, 1)
    assert.equal(Object((await send(reader, 'listOrders', {}, { version: second })).value).length, 1)
    assert.equal(Object((await send(reader, 'listOrders', {}, { version: first })).value).length, 3)
  }
  assert.equal(callsOf(t, 'data', 'listOrders'), before)

  // A third version, added while the link of the near reader carries nothing: the switch waits for that reader.
  near.hold()
  const third = await app.add(
    await nextVersion(t, 'third', 'functions/functions.ts', limited.replace('1000', '1'), limited.replace('1000', '2')),
  )
  await until('the far reader holds the third version', () => far.versions().some((held) => held.id === third))
  const switching = app.switch(third)
  const ended = watched(switching)
  await moment(400)
  assert.deepEqual([ended(), running(app)], [false, first])
  near.release()
  await switching
  await level(app, near, far)
  await until('each machine runs the third version', () => [app, near, far].every((one) => running(one) === third))
  // A request that names no version is served by the one that runs, on each machine.
  for (const one of [app, near, far]) assert.equal(Object((await send(one, 'listOrders')).value).length, 2)
  // And the older versions are still loadable there: a page of the first one is served by a reader.
  const page = watcher(far)
  assert.equal(Object((await page.watch('old', 'listOrders', { version: first })).value).length, 3)
})

test(
  '[29-8] a reader that is not ready within versionWait is closed, joins again, and serves the new version',
  readersHeld,
  async (t) => {
    // A reader of this app may be behind for two minutes, so a link that carries nothing is not given up before
    // the time that a switch gives a reader has passed.
    const { app, near, far } = await machinesOf(t, (folder) => {
      const file = join(folder, 'tent.ts')
      const stated = "{ title: 'Many machines' }"
      assert.ok(readFileSync(file, 'utf8').includes(stated))
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(stated, "{ title: 'Many machines', limits: { behind: '2 minutes' } }"),
      )
    })
    const first = running(app)
    await order(app, 'one')
    await order(app, 'two')
    await level(app, near, far)
    near.hold()
    const limited = "orders.oldest('createdAt').limit(1000)"
    const second = await app.add(
      await nextVersion(t, 'second', 'functions/functions.ts', limited, limited.replace('1000', '1')),
    )
    await until('the far reader holds the second version', () => far.versions().some((held) => held.id === second))
    const switching = app.switch(second)
    const ended = watched(switching)
    // Just short of the time it gives a reader, the switch still waits.
    app.clock.advance('59 seconds')
    await moment(200)
    assert.deepEqual([ended(), running(app), running(near)], [false, first, first])
    // Past it, the link of the reader that is not ready is closed, and the switch is made without it.
    app.clock.advance('2 seconds')
    await switching
    assert.equal(running(app), second)
    await until('the far reader runs the second version', () => running(far) === second)
    // The writer holds that reader no more: its link was closed.
    assert.deepEqual(
      app.machines().map((one) => one.role),
      ['writer', 'reader'],
    )
    // The reader joins again, fetches the version, and serves it once it is current.
    near.release()
    await until('the near reader runs the second version', () => running(near) === second)
    await current(app, near)
    await level(app, near, far)
    const before = callsOf(t, 'data', 'listOrders')
    assert.equal(Object((await send(near, 'listOrders')).value).length, 1)
    assert.equal(callsOf(t, 'data', 'listOrders'), before)
  },
)

test(
  '[29-6@6] a reader that is not current closes its live connections and refuses a new one with T0029',
  readersHeld,
  async (t) => {
    const { app, near } = await machinesOf(t)
    const page = watcher(near)
    await page.watch('a', 'listOrders')
    near.cut()
    await beat(app, 7)
    assert.equal(near.at().current, false)
    await until('the live connection of the reader was closed', () => page.closed())
    assert.equal(await codeOf(() => watcher(near)), 'T0029')
    // Joined again and current, it takes a live connection as before.
    near.join()
    await current(app, near)
    const again = watcher(near)
    assert.equal((await again.watch('a', 'listOrders')).t, 'result')
  },
)

test(
  '[29-6@6] after a switch to a version that states a shorter behind, a reader that was cut off before it is waited for by the longer one',
  readersHeld,
  async (t) => {
    const { app, near, far } = await machinesOf(t)
    const shorter = await app.add(
      await nextVersion(
        t,
        'shorter',
        'tent.ts',
        "{ title: 'Many machines' }",
        "{ title: 'Many machines', limits: { behind: '2 seconds' } }",
      ),
    )
    await until('both readers hold the version', () =>
      [near, far].every((one) => one.versions().some((held) => held.id === shorter)),
    )
    // The near reader is cut off, and then the version that lets a reader be behind for two seconds is switched to.
    near.cut()
    await app.switch(shorter)
    const write = send(app, 'addOrder', { title: 'after the switch' })
    const ended = watched(write)
    // Four seconds on, the write still waits: the reader may be current for as long as the version before let it.
    await beat(app, 4)
    assert.equal(ended(), false)
    await beat(app, 3)
    assert.equal((await write).status, 200)
    // A reader that is cut off under the new version is waited for by the shorter time.
    near.join()
    await current(app, near)
    await beat(app, 6)
    await current(app, near)
    near.cut()
    const second = send(app, 'addOrder', { title: 'under the shorter one' })
    const secondEnded = watched(second)
    await beat(app, 4)
    assert.equal(secondEnded(), true)
    assert.equal((await second).status, 200)
  },
)

test('[29-6@6] a version that a reader cannot load is never ready there, and the log of the reader says so as the log of the writer does', async (t) => {
  const { app, near, far } = await machinesOf(t, (folder) => {
    const file = join(folder, 'tent.ts')
    const stated = "{ title: 'Many machines' }"
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(stated, "{ title: 'Many machines', limits: { behind: '2 minutes' } }"),
    )
  })
  const first = running(app)
  await level(app, near, far)
  // The code of the second version loads where a file of the test is not there yet, and nowhere else: a file, which
  // the code reads in whatever room it runs. The near reader is told of the version while its link carries
  // nothing, and fetches it once the file is there.
  const marker = join(process.cwd(), 'results', 'test', `no-load-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(marker, '..'), { recursive: true })
  t.after(() => rmSync(marker, { force: true }))
  near.hold()
  const head = "const open = anyone('a test calls it from every machine')"
  const second = await app.add(
    await nextVersion(
      t,
      'second',
      'functions/functions.ts',
      head,
      `if (process.getBuiltinModule('node:fs').existsSync(${JSON.stringify(marker)})) throw new Error('made for a newer engine')\n${head}`,
    ),
  )
  await until('the far reader holds the second version', () => far.versions().some((held) => held.id === second))
  writeFileSync(marker, '')
  near.release()
  const said = (machine: string, words: RegExp): Record<string, unknown>[] =>
    logRows(t, machine, 'lines').filter((row) => words.test(String(row.message)))
  await until(
    'the near reader said that it cannot load the version',
    () => said('reader-2', /cannot be loaded/).length > 0,
  )
  const [line] = said('reader-2', /cannot be loaded/)
  assert.deepEqual([line.level, String(line.data).includes(second)], ['error', true])
  assert.match(String(line.data), /made for a newer engine/)
  assert.equal(
    near.versions().some((held) => held.id === second),
    false,
  )
  // The switch waits for it for the time it gives a reader, and is then made without it: the writer says so too.
  const switching = app.switch(second)
  app.clock.advance('61 seconds')
  await switching
  assert.deepEqual([running(app), running(near)], [second, first])
  assert.ok(said('data', /did not hold a version in time/).length > 0)
})
