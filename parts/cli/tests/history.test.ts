import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { openHistory } from '../../history/index.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import type { Listed } from './historyDev.ts'
import { developed, history, pointsOf, projectOf, saved, system, titles, untilTried, why, wrote } from './historyDev.ts'
import { typed } from './typed.ts'

test('[40-14b] through tent dev a save is recorded as a point, a broken save with checked: false, and two saves within five seconds are one point', async (t) => {
  const dev = await developed(t, 'history-saves')
  const folder = dev.folder
  // The history starts at the files as they are: one point, which passed the check.
  const first = await pointsOf(folder)
  assert.deepEqual(
    first.map((one) => [one.kind, one.checked, one.files]),
    [['save', true, 5]],
  )
  // A save is one more point. It comes within five seconds of the first, so it takes that point's place.
  await saved(dev, 'functions.ts', 'limit(100)', 'limit(50)')
  await untilTried('the save is recorded', async () => (await pointsOf(folder))[0].id !== first[0].id)
  const second = await pointsOf(folder)
  assert.equal(second.length, 1, 'two saves within five seconds are one point')
  assert.equal(second[0].checked, true)

  // A broken save is recorded too, as not checked, and the version that ran keeps running.
  const good = dev.version()
  const whole = readFileSync(join(folder, 'functions.ts'), 'utf8')
  writeFileSync(
    join(folder, 'functions.ts'),
    `${whole}\nexport const broken = query('broken', { rows: items.limit(1) })\n`,
  )
  await untilTried('the broken save is recorded', async () => (await pointsOf(folder))[0].checked === false)
  assert.equal(dev.version(), good)
  assert.ok(dev.findings().some((one) => one.level === 'error'))
  // Mending it records a point that passed again.
  writeFileSync(join(folder, 'functions.ts'), whole)
  await untilTried('the mended save is recorded', async () => (await pointsOf(folder))[0].checked === true)
})

test('[40-14b] tent check keeps with a point the description the build gave before it added the built files, as tent dev keeps it, so the two are one', async (t) => {
  // The session is ended before its folder is removed: what a test asks for at its end is done in the order asked.
  let dev: Dev | undefined
  t.after(() => dev?.close())
  const folder = projectOf(t, 'history-checked')
  // The finished description adds what the build made of the files, the fingerprints of the sources among it; the
  // one kept with a point holds none of it, so the same files are described alike whoever built them.
  const kept = (): Record<string, unknown> => {
    const opened = openHistory(join(folder, '.tent'))
    try {
      const now = opened.find('now')
      const bytes = now?.description ? opened.blob(now.description) : undefined
      assert.ok(bytes, 'now holds a description')
      return JSON.parse(new TextDecoder().decode(bytes))
    } finally {
      opened.close()
    }
  }
  dev = await startDev(folder, { port: 0, out: () => undefined })
  await untilTried('the first build is recorded', async () => (await pointsOf(folder)).length === 1)
  const ofDev = kept()
  assert.equal(ofDev.sources, undefined, 'tent dev keeps nothing the build made')

  // The check of the same files marks the same point, and leaves its description as tent dev kept it.
  assert.equal((await typed(folder, 'check')).ended, 0)
  assert.equal((await pointsOf(folder)).length, 1)
  assert.deepEqual(kept(), ofDev)
})

test('[40-14b] saves that are further apart than historyJoin are a point each, and a named point is never joined', async (t) => {
  const dev = await developed(t, 'history-apart', { limits: "{ historyJoin: '1 ms' }" })
  const folder = dev.folder
  await saved(dev, 'functions.ts', 'limit(100)', 'limit(50)')
  await untilTried('the first save is recorded', async () => (await pointsOf(folder)).length === 2)
  const named = Object(await history(folder, 'save', 'before the change')).point
  assert.deepEqual([named.kind, named.name], ['named', 'before the change'])
  await saved(dev, 'functions.ts', 'limit(50)', 'limit(20)')
  await untilTried('the second save is recorded', async () => (await pointsOf(folder)).length === 4)
  assert.deepEqual(
    (await pointsOf(folder)).map((one) => one.kind),
    ['save', 'named', 'save', 'save'],
  )
})

test('[40-2] [15-6@7d] a table, a column and a function renamed with was: compare says renamed and the rows survive; without was it is an error of the check, and nothing is dropped', async (t) => {
  const dev = await developed(t, 'history-renames')
  const folder = dev.folder
  await dev.app().call('addItem', { title: 'added' }, { as: system })
  assert.deepEqual(await titles(dev), ['seeded', 'added'])
  await history(folder, 'save', 'before')

  // The three renames in one save, each with `was`. The starter data is not applied again.
  const renamed = {
    'seed.ts':
      "import { seed } from 'tentjs'\n\nexport default seed(({ db }) => {\n  db.things.add({ name: 'seeded' })\n})\n",
    'functions.ts': `import { anyone, change, input, query, text } from 'tentjs'\nimport { things } from './tables'\n\nexport const everyItem = query('everyItem', { access: 'anyone', rows: things.oldest('createdAt').limit(100), was: 'allItems' })\n\nexport const addItem = change('addItem', {\n  access: ${why},\n  input: { title: text() },\n  set: things.add({ name: input('title') }),\n})\n`,
    'tables.ts': `import { anyone, table, text } from 'tentjs'\n\nexport const things = table('things', {\n  columns: { name: text({ was: 'title' }) },\n  access: { read: 'anyone', add: ${why} },\n  was: 'items',\n})\n`,
  }
  await wrote(dev, renamed)
  assert.deepEqual(await titles(dev, 'everyItem'), ['seeded', 'added'], 'the rows survive')
  await history(folder, 'save', 'after')

  // Compare says renamed, as lines and as records.
  const lines = (await typed(folder, 'history', 'compare', 'before', 'after')).printed.split('\n')
  for (const line of [
    'table things: renamed from items',
    'table things: column "title" renamed to "name"',
    'query everyItem: renamed from allItems',
  ])
    assert.ok(lines.includes(line), `${line}\n${lines.join('\n')}`)
  const records = (await typed(folder, 'history', 'compare', 'before', 'after', '--json')).answer.value
  assert.ok(Array.isArray(records))
  assert.deepEqual(
    records.filter((one: { change: string }) => one.change === 'renamed'),
    [
      { change: 'renamed', what: 'table', name: 'things', was: 'items' },
      { change: 'renamed', what: 'column', name: 'things.name', was: 'things.title' },
      { change: 'renamed', what: 'query', name: 'everyItem', was: 'allItems' },
    ],
  )
  for (const record of records)
    assert.deepEqual(
      Object.keys(record).filter(
        (key) => !['change', 'what', 'name', 'was', 'path', 'from', 'to', 'lines'].includes(key),
      ),
      [],
    )

  // The same rename with no `was`: the table would be dropped, so the check refuses it and nothing changes.
  const good = dev.version()
  for (const [file, text] of Object.entries(renamed))
    writeFileSync(join(folder, file), text.replaceAll('things', 'stuff').replace("  was: 'items',\n", ''))
  await untilTried('the refusal is found', () => dev.findings().some((one) => /^T200[2-4]$/.test(one.code)))
  assert.equal(dev.version(), good)
  assert.deepEqual(await titles(dev, 'everyItem'), ['seeded', 'added'], 'nothing is dropped')
})

test('[40-3b] [15-6@7d] through tent dev, going back 1, 3 and 10 points and forward again across table changes, a column added since among them: no row is lost, and the app runs at each point', async (t) => {
  const dev = await developed(t, 'history-back')
  const folder = dev.folder
  const text = (name: string): string => readFileSync(join(folder, name), 'utf8')
  const written: Record<string, Record<string, string>> = {}
  let limit = 100
  for (let n = 1; n <= 10; n++) {
    // Each point changes a function. The fourth adds a column, and the seventh a table.
    if (n === 4)
      await saved(
        dev,
        'tables.ts',
        'columns: { title: text() }',
        'columns: { title: text(), note: text({ optional: true }) }',
      )
    if (n === 7)
      await saved(
        dev,
        'tables.ts',
        "import { anyone, table, text } from 'tentjs'\n",
        `import { anyone, table, text } from 'tentjs'\n\nexport const labels = table('labels', { columns: { name: text() }, access: { read: 'anyone', add: ${why} } })\n`,
      )
    await saved(dev, 'functions.ts', `limit(${limit})`, `limit(${limit - 1})`)
    limit--
    await dev.app().call('addItem', { title: `item ${n}` }, { as: system })
    if (n === 5) {
      const [row] = Object(
        await dev.app().read({ from: 'items', where: { col: 'title', is: 'item 5' } }, { as: system }),
      )
      await dev
        .app()
        .write([{ change: 'items', id: row.id, values: { note: 'kept through going back' } }], { as: system })
    }
    await history(folder, 'save', `p${n}`)
    written[`p${n}`] = { tables: text('tables.ts'), functions: text('functions.ts') }
  }
  const all = ['seeded', ...Array.from({ length: 10 }, (_, n) => `item ${n + 1}`)]
  assert.deepEqual(await titles(dev), all)

  for (const steps of [1, 3, 10]) {
    const to = `p${10 - steps === 0 ? 1 : 10 - steps}`
    const back = await history(folder, 'back', to)
    assert.deepEqual(Object.keys(back).sort(), ['findings', 'note', 'point', 'version'])
    assert.deepEqual(back.findings, [], `${steps} points back`)
    assert.equal(Object(back.point).kind, 'back')
    assert.equal(back.version, dev.version())
    assert.equal(text('tables.ts'), written[to].tables, `${steps} points back, the files match`)
    assert.equal(text('functions.ts'), written[to].functions)
    // The app runs at the older point, and no row is lost: a column that was added since is retired, not dropped.
    assert.deepEqual(await titles(dev), all, `${steps} points back, every row is there`)
    await dev.app().call('addItem', { title: `added ${steps} back` }, { as: system })
    all.push(`added ${steps} back`)

    // Forward again.
    const forward = await history(folder, 'back', 'p10')
    assert.deepEqual(forward.findings, [])
    assert.equal(text('tables.ts'), written.p10.tables)
    assert.deepEqual(await titles(dev), all, `forward again after ${steps} points back`)
    const [noted] = Object(
      await dev.app().read({ from: 'items', where: { col: 'title', is: 'item 5' } }, { as: system }),
    )
    assert.equal(noted.note, 'kept through going back', 'the column is revived with its values')
  }
  // The list holds each point of the way: nothing of the history was cut off.
  const listed = await history(folder, '--newest', '200')
  assert.deepEqual(Object.keys(listed).sort(), ['now', 'points'])
  const kinds = Object(listed).points.map((one: Listed) => one.kind)
  assert.equal(kinds.filter((kind: string) => kind === 'back').length, 6)
  assert.equal(kinds.filter((kind: string) => kind === 'named').length, 10)
})

test('[40-14b] [15-6@7d] with no tent dev running a command records the files alone, tent history export writes one commit for each named point, and going back writes the files of the point', async (t) => {
  const folder = projectOf(t, 'history-alone')
  const settings = join(folder, '..', 'gitconfig')
  writeFileSync(settings, '')
  const held = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM }
  process.env.GIT_CONFIG_GLOBAL = settings
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  t.after(() => {
    for (const [name, value] of [
      ['GIT_CONFIG_GLOBAL', held.global],
      ['GIT_CONFIG_NOSYSTEM', held.system],
    ] as const)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  })
  assert.equal((await typed(folder, 'history')).printed, 'The history holds no point yet.')
  const one = Object(await history(folder, 'save', 'one')).point
  assert.deepEqual(Object.keys(one).sort(), ['at', 'by', 'files', 'id', 'kind', 'name'])
  assert.deepEqual([one.kind, one.name, one.by, one.checked], ['named', 'one', { kind: 'person' }, undefined])
  const functions = readFileSync(join(folder, 'functions.ts'), 'utf8')
  writeFileSync(join(folder, 'functions.ts'), functions.replace('limit(100)', 'limit(7)'))
  await history(folder, 'save', 'two')
  writeFileSync(join(folder, 'functions.ts'), functions.replace('limit(100)', 'limit(8)'))
  await history(folder, 'save', 'three')

  // The list, as text and as records.
  const lines = (await typed(folder, 'history')).printed.split('\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^[0-9a-f]{8} {2}\d{4}-\d\d-\d\dT[\d:.]+Z {2}named {2}"three"$/)
  // With no build at hand the points hold no description, and are compared file by file.
  assert.equal((await typed(folder, 'history', 'compare', 'one', 'two')).printed, 'file functions.ts: changed')
  assert.equal((await typed(folder, 'history', 'compare', 'two', 'two')).printed, 'Nothing changed.')
  assert.deepEqual((await typed(folder, 'history', 'compare', 'one', 'two', '--json')).answer.value, [
    { change: 'changed', what: 'file', name: 'functions.ts', lines: 1 },
  ])
  // A point that is not there ends the command with 2, and says the code.
  const missing = await typed(folder, 'history', 'compare', 'one', 'no-such-point', '--json')
  assert.equal(missing.ended, 2)
  assert.equal(missing.answer.findings?.[0].code, 'T9107')

  // The export: one commit for each named point, oldest first.
  const out = join(folder, '..', 'exported')
  const exported = await history(folder, 'export', '--out', out)
  assert.deepEqual(Object.keys(exported).sort(), ['commits', 'note'])
  assert.equal(exported.commits, 3)
  const log = spawnSync('git', ['log', '--reverse', '--format=%s|%an'], { cwd: out, encoding: 'utf8' })
  assert.deepEqual(log.stdout.trim().split('\n'), ['one|person', 'two|person', 'three|person'])
  assert.equal(readFileSync(join(out, 'functions.ts'), 'utf8'), functions.replace('limit(100)', 'limit(8)'))
  assert.equal(Object(await history(folder, 'export', '--out', out)).commits, 0)

  // Going back with no session running starts one for the length of the command, and leaves nothing running.
  const back = await history(folder, 'back', 'one')
  assert.equal(Object(back.point).kind, 'back')
  assert.equal(readFileSync(join(folder, 'functions.ts'), 'utf8'), functions)
  assert.equal((await pointsOf(folder))[0].kind, 'back')
})
