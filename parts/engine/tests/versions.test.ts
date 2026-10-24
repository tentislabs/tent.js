import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf, finding } from '../../core/internal.ts'
import type { App } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, codeOf, engineOf, portOf, refusal, send, system, workFolder } from './apps.ts'
import { addCard, idsOf, untilTried, watcher } from './watching.ts'

/** The bundles of the board that the tests of this file switch between, each a change of the first by a hand. */
const changes: Record<string, (description: Description) => void> = {
  // The first cards alone: a plan that answers two rows at most.
  two: (d) => void Object.assign(Object(d.functions.allCards.plan), { limit: 2 }),
  // One more column, which only adds.
  colour: (d) => void Object.assign(Object(d.tables.cards.columns), { colour: { kind: 'text', optional: true } }),
  // A column that is gone with no statement: the table change is refused.
  gone: (d) => void Reflect.deleteProperty(Object(d.tables.cards.columns), 'rank'),
  // A column that must be unique from now on: the older versions could not go on writing the table.
  unique: (d) => void Object.assign(Object(Object(d.tables.cards.columns).title), { unique: true }),
}

/** An app of the board in one mode, with a bundle for each change that the test names. */
async function board(t: TestContext, mode: 'development' | 'test' | 'live', names: string[]) {
  const work = workFolder(t)
  const first = await bundled(t, { project: 'board' }, work)
  const more: Record<string, Bundle> = {}
  for (const name of names) more[name] = await bundled(t, { project: 'board', change: changes[name] }, work)
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  const app = await engine.open(first.folder, { dataFolder, mode })
  const origin = `http://localhost:${portOf(dataFolder)}`
  return { engine, app, first, more, dataFolder, origin, work }
}

/** The fingerprint of the bytes of each file of a folder, by its path, written with `/`. */
const printsOf = (folder: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(folder, { recursive: true })
      .map((one) => String(one).replaceAll('\\', '/'))
      .filter((one) => statSync(join(folder, one)).isFile())
      .sort()
      .map((one) => [one, fingerprintOf(readFileSync(join(folder, one)))]),
  )

/** The cards that a call through the door answers, by their titles, as the version that the call names answers them. */
async function titles(app: App, origin: string, version?: string): Promise<unknown> {
  const answer = await send(app, `${origin}/_t/call/allCards`, version === undefined ? {} : { version })
  return answer.error.code ?? (Array.isArray(answer.body.value) ? answer.body.value.map((row) => Object(row).title) : 0)
}

test('[21-17] app.add and app.switch make a second version the running one, a call that names a loadable version is served by it, and app.drop makes a version unloadable', async (t) => {
  const { app, first, more, origin, dataFolder, engine } = await board(t, 'test', ['two', 'colour'])
  for (const [title, rank] of [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ] as const)
    await addCard(app, title, rank)
  const heard: unknown[] = []
  engine.on('version.switched', (told) => void heard.push([told.app === app, told.from, told.to]))

  // The app runs the version it was opened with, which is the one version it can load.
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running, one.needed]),
    [[first.versionId, true, false]],
  )
  assert.equal(typeof app.versions()[0].addedAt, 'number')

  // One more version is made loadable: the bundle is copied into `versions/`, and the app goes on running the first.
  const two = await app.add(more.two.folder)
  assert.equal(two, more.two.versionId)
  assert.ok(existsSync(join(dataFolder, 'versions', two, 'description.json')), 'the bundle is copied')
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running]),
    [
      [first.versionId, true],
      [two, false],
    ],
  )
  assert.equal(await app.add(more.two.folder), two, 'a version that is loadable already is added once')
  assert.equal(app.versions().length, 2)
  // A call that names no version is served by the running one, and one that names a loadable version by that one.
  assert.deepEqual(await titles(app, origin), ['a', 'b', 'c'])
  assert.deepEqual(await titles(app, origin, two), ['a', 'b'])
  assert.deepEqual(await titles(app, origin, first.versionId), ['a', 'b', 'c'])
  assert.equal(await titles(app, origin, 'no-such-version'), 'T0007')

  // The switch: no table changes, so it is not hard, and it opens nothing again.
  assert.deepEqual(await app.switch(two), { hard: false, opens: false, steps: [] })
  assert.deepEqual(heard, [[true, first.versionId, two]])
  assert.equal(Object(app.description.functions.allCards.plan).limit, 2)
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running]),
    [
      [first.versionId, false],
      [two, true],
    ],
  )
  assert.deepEqual(await titles(app, origin), ['a', 'b'])
  assert.deepEqual(await app.call('allCards', {}, { as: system }), await app.call('allCards', {}, { as: system }))
  assert.equal(idsOf(await app.call('allCards', {}, { as: system })).length, 2)
  // On test data a page of the older version is still served by it, for as long as it can be loaded.
  assert.deepEqual(await titles(app, origin, first.versionId), ['a', 'b', 'c'])
  const health = await app.request(new Request(`${origin}/_t/health`))
  assert.equal(Object((await health.json()).value).version, two)
  // A switch to the version that runs changes nothing, and tells nobody.
  assert.deepEqual(await app.switch(two), { hard: false, opens: false, steps: [] })
  assert.equal(heard.length, 1)
  // A version that was never added cannot be switched to.
  assert.equal(await codeOf(app.switch('no-such-version')), 'T0007')

  // A version that a live connection watches is needed: it is not dropped. The running one never is.
  const page = watcher(app, origin)
  assert.equal((await page.watch('cards', 'allCards', {}, { version: first.versionId })).t, 'result')
  assert.equal(idsOf(page.got[0].value).length, 3, 'the watch is served by the version it names')
  assert.deepEqual(
    app.versions().map((one) => [one.running, one.needed]),
    [
      [false, true],
      [true, false],
    ],
  )
  assert.equal(await app.drop(first.versionId), false)
  assert.equal(await app.drop(two), false)
  page.send({ t: 'unwatch', id: 'cards' })
  await untilTried('the version is needed no more', () => !app.versions()[0].needed)
  // Dropped, it can be loaded no more: a call that names it is told the running one, and its copy is gone.
  assert.equal(await app.drop(first.versionId), true)
  assert.deepEqual(
    app.versions().map((one) => one.id),
    [two],
  )
  const gone = await send(app, `${origin}/_t/call/allCards`, { version: first.versionId })
  assert.deepEqual([gone.status, gone.error.code, gone.error.running], [409, 'T0007', two])
  assert.equal(existsSync(join(dataFolder, 'versions', first.versionId)), false)
  assert.equal(await app.drop(first.versionId), false, 'a version that is not loadable is not dropped')
  assert.equal((await page.watch('old', 'allCards', {}, { version: first.versionId })).t, 'failed')

  // A version with one more column: the switch applies the table change in its one write, and the rows stay.
  const colour = await app.add(more.colour.folder)
  const switched = await app.switch(colour)
  assert.deepEqual(
    [switched.hard, switched.opens, switched.steps.map((step) => [step.do, step.table, step.column])],
    [false, false, [['addColumn', 'cards', 'colour']]],
  )
  assert.deepEqual(heard.at(-1), [true, two, colour])
  const rows: unknown[] = Object(await app.read({ from: 'cards' }, { as: 'system' }))
  assert.equal(rows.length, 3)
  await app.write([{ add: 'cards', values: { title: 'd', rank: 4, colour: 'red' } }], { as: system })
})

test('[21-17] a switch whose table change is refused leaves the first version running and its tables as they were, and a hard switch drops the older versions at once', async (t) => {
  const { app, first, more, origin, engine } = await board(t, 'test', ['gone', 'unique', 'colour'])
  await addCard(app, 'a', 1)
  const heard: unknown[] = []
  engine.on('version.switched', (told) => void heard.push(told.to))
  const layout = (): string => JSON.stringify(Object(app.facts()))
  const columns = async (): Promise<string[]> =>
    Object.keys(Object(Object(await app.read({ from: 'cards' }, { as: 'system' }))[0])).sort()
  const before = [layout(), await columns()]

  // The column is gone with no statement: the switch fails with the finding, and nothing is changed.
  const gone = await app.add(more.gone.folder)
  const refused = await refusal(app.switch(gone))
  assert.equal(refused.code, 'T2002')
  assert.match(refused.message, /rank/)
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running]),
    [
      [first.versionId, true],
      [gone, false],
    ],
  )
  assert.deepEqual([layout(), await columns()], before)
  assert.deepEqual(heard, [])
  assert.deepEqual(await app.call('allCards', {}, { as: system }), await app.call('allCards', {}, { as: system }))
  assert.deepEqual(await titles(app, origin), ['a'])
  assert.equal(await app.drop(gone), true)

  // A page watches under the first version, and another version is loadable beside it.
  const colour = await app.add(more.colour.folder)
  const page = watcher(app, origin)
  assert.equal((await page.watch('cards', 'allCards', {}, { version: first.versionId })).t, 'result')
  const later = watcher(app, origin)
  assert.equal((await later.watch('count', 'countCards')).t, 'result')

  // A column becomes unique: the switch is hard, and the older versions are dropped at once.
  const unique = await app.add(more.unique.folder)
  const switched = await app.switch(unique)
  assert.equal(switched.hard, true)
  assert.deepEqual(
    switched.steps.map((step) => step.do),
    ['addUnique'],
  )
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running]),
    [[unique, true]],
  )
  assert.deepEqual(heard, [unique])
  assert.equal(await titles(app, origin, first.versionId), 'T0007')
  assert.equal(await titles(app, origin, colour), 'T0007')
  // The page that watched under a version which is gone is told to reload, and its watch is over.
  await untilTried('the page of the older version was told to reload', () => page.of('reload').length === 1)
  await addCard(app, 'b', 2)
  await untilTried('the page of the running version was sent the card', () => later.of('result', 'count').length === 2)
  assert.equal(page.got.filter((one) => one.id === 'cards').length, 1)
  // The table is as the new version asks: a second card of one title is refused.
  assert.equal(await codeOf(app.call('addCard', { title: 'b', rank: 3 }, { as: system })), 'T2101')
})

test('[21-17] [21-16@6] in the mode development a version is the list of its files, kept once by their fingerprints, a call that names the version it left is T0007, and every open page is told the new version', async (t) => {
  const { app, first, more, origin, dataFolder } = await board(t, 'development', ['two'])
  await addCard(app, 'a', 1)
  await addCard(app, 'b', 2)
  await addCard(app, 'c', 3)
  const versions = join(dataFolder, 'versions')
  const store = join(versions, 'files')
  const listed = (id: string): unknown => JSON.parse(readFileSync(join(versions, `${id}.json`), 'utf8'))
  // The version that the app was opened with is the list of its files: each is kept once by the fingerprint of its
  // bytes, and no folder of the version is made.
  assert.deepEqual(readdirSync(versions).sort(), [`${first.versionId}.json`, 'files'])
  assert.deepEqual(listed(first.versionId), { files: printsOf(first.folder), store })
  for (const print of Object.values(printsOf(first.folder)))
    assert.equal(fingerprintOf(readFileSync(join(store, print))), print)

  const page = watcher(app, origin)
  assert.equal(idsOf((await page.watch('cards', 'allCards', {}, { version: first.versionId })).value).length, 3)
  const two = await app.add(more.two.folder)
  // No copy and no folder: one list more, and the store gains only the files whose bytes it did not hold.
  assert.deepEqual(readdirSync(versions).sort(), [`${first.versionId}.json`, `${two}.json`, 'files'].sort())
  assert.deepEqual(listed(two), { files: printsOf(more.two.folder), store })
  assert.deepEqual(
    readdirSync(store).sort(),
    [...new Set([...Object.values(printsOf(first.folder)), ...Object.values(printsOf(more.two.folder))])].sort(),
  )
  // In development a page is served by the running version only: the one that was added is not served yet.
  assert.equal(await titles(app, origin, two), 'T0007')

  await app.switch(two)
  // Every open page is told the version that runs now, and the watches of the version it left are dropped.
  await untilTried('the page was told the new version', () => page.of('version').length === 1)
  assert.deepEqual(page.of('version')[0], { t: 'version', version: two })
  assert.equal(await titles(app, origin, first.versionId), 'T0007')
  const gone = await send(app, `${origin}/_t/call/allCards`, { version: first.versionId })
  assert.equal(gone.error.running, two)
  assert.deepEqual(await titles(app, origin, two), ['a', 'b'])
  await addCard(app, 'd', 0)
  const again = await page.watch('again', 'allCards', {}, { version: two })
  assert.deepEqual([again.t, idsOf(again.value).length], ['result', 2])
  assert.equal(page.got.filter((one) => one.id === 'cards').length, 1, 'the watch of the version that was left is over')
  // The page sends its watch again under the new version, as it follows it, and is served.
  assert.equal((await page.watch('cards', 'allCards', {}, { version: two })).t, 'result')

  // The version that was left is needed by nobody: it is dropped, and its list is gone.
  assert.deepEqual(
    app.versions().map((one) => [one.id, one.running, one.needed]),
    [
      [first.versionId, false, false],
      [two, true, true],
    ],
  )
  assert.equal(await app.drop(first.versionId), true)
  assert.deepEqual(readdirSync(versions).sort(), [`${two}.json`, 'files'])
  assert.ok(existsSync(join(first.folder, 'description.json')), 'the folder it was given belongs to whoever wrote it')
})

test('[21-16@6] in the mode development a page that opens its live connection after a switch it did not hear of is told the version that runs, and one of the running version is told nothing', async (t) => {
  const { app, first, more, origin } = await board(t, 'development', ['two'])
  const two = await app.add(more.two.folder)
  await app.switch(two)
  /** The messages a live connection that names a version is sent once it stands open. */
  const told = async (version: string): Promise<unknown[]> => {
    const end = app.live(new Request(`${origin}/_t/live?version=${version}`, { headers: { origin } }))
    const got: unknown[] = []
    end.each(
      (message) => void got.push(message),
      () => undefined,
    )
    // The connection is answered a sign of life, which is no message of a version.
    end.send({ t: 'watch', id: 'cards', query: 'allCards', input: {}, version: two })
    await untilTried('the watch was answered', () => got.some((one) => Object(one).id === 'cards'))
    end.close()
    return got.filter((one) => Object(one).t === 'version')
  }
  assert.deepEqual(await told(first.versionId), [{ t: 'version', version: two }])
  assert.deepEqual(await told(two), [])
})

test('[21-16@6] on test data and on live data an open page keeps its version: it is told nothing of a switch, and its watch is served by the version it names', async (t) => {
  for (const mode of ['test', 'live'] as const) {
    const { app, first, more, origin } = await board(t, mode, ['two'])
    for (const [title, rank] of [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ] as const)
      await addCard(app, title, rank)
    const page = watcher(app, origin)
    assert.equal(idsOf((await page.watch('cards', 'allCards', {}, { version: first.versionId })).value).length, 3)
    await app.switch(await app.add(more.two.folder))
    await addCard(app, 'd', 4)
    // The page is sent the new card by the version it was built from, and no word of the switch.
    await untilTried(`${mode}: the page was sent the card`, () => page.of('rows', 'cards').length === 1)
    assert.deepEqual(
      page.got.map((one) => one.t),
      ['result', 'rows'],
      mode,
    )
    assert.deepEqual(await titles(app, origin, first.versionId), ['a', 'b', 'c', 'd'], mode)
    assert.deepEqual(await titles(app, origin), ['a', 'b'], mode)
  }
})

test('[21-16@6] app.show sends what the build and the check found to every open page in the mode development, also to a page that opens later, and is refused in any other mode', async (t) => {
  const { app, origin } = await board(t, 'development', [])
  const found = [finding('T1005', 'A screen file imports a backend file as its text.')]
  const page = watcher(app, origin)
  await page.watch('cards', 'allCards')
  app.show(found)
  await untilTried('the open page was sent the findings', () => page.of('findings').length === 1)
  assert.deepEqual(page.of('findings')[0], { t: 'findings', findings: found })
  // A page that opens while they stand is sent them too.
  const late = watcher(app, origin)
  await late.watch('cards', 'allCards')
  assert.deepEqual(late.of('findings'), [{ t: 'findings', findings: found }])
  // An empty list takes the overlay away, and a page that opens after is sent nothing.
  app.show([])
  await untilTried(
    'the pages were sent the empty list',
    () => page.of('findings').length === 2 && late.of('findings').length === 2,
  )
  assert.deepEqual(page.of('findings')[1], { t: 'findings', findings: [] })
  const after = watcher(app, origin)
  await after.watch('cards', 'allCards')
  assert.deepEqual(after.of('findings'), [])

  const other = await board(t, 'test', [])
  assert.throws(() => other.app.show(found), { code: 'T0013' })
})

test('[21-17] two apps that are opened from one bundle, and two versions of one app, share no value that a function module keeps at its top', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project: 'board' }, work)
  const second = await bundled(t, { project: 'board', change: changes.two }, work)
  const engine = engineOf(t)
  const one = await engine.open(bundle.folder, {
    dataFolder: join(work, 'one'),
    mode: 'test',
    address: 'one.tent.test',
  })
  const other = await engine.open(bundle.folder, {
    dataFolder: join(work, 'other'),
    mode: 'test',
    address: 'other.tent.test',
  })
  const bump = (app: App): Promise<unknown> => app.call('bump', {}, { as: system })
  assert.deepEqual([await bump(one), await bump(one), await bump(one)], [1, 2, 3])
  // The other app counts for itself, from the start.
  assert.deepEqual([await bump(other), await bump(other)], [1, 2])
  assert.equal(await bump(one), 4)
  // A second version of the first app loads its modules anew: it counts from the start, and the first goes on.
  await one.switch(await one.add(second.folder))
  assert.deepEqual([await bump(one), await bump(other)], [1, 3])
})

test('[21-20@6] version.switched is heard once for each switch, with the app, the version that was left and the one that runs', async (t) => {
  const { app, first, more, engine } = await board(t, 'test', ['two', 'colour'])
  const heard: Record<string, unknown>[] = []
  engine.on('version.switched', (told) => void heard.push({ ...told }))
  const two = await app.add(more.two.folder)
  assert.deepEqual(heard, [], 'a version that is added is not switched to')
  await app.switch(two)
  assert.deepEqual(heard, [{ app, from: first.versionId, to: two }])
  const colour = await app.add(more.colour.folder)
  await app.switch(colour)
  await app.switch(colour)
  assert.deepEqual(heard.slice(1), [{ app, from: two, to: colour }])
})
