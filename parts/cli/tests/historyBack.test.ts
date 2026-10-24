import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { developed, history, pointsOf, projectOf, saved, system, untilTried, why, wrote } from './historyDev.ts'
import { typed } from './typed.ts'

/** The files of a project as they stand, by their names, but for the engine's own folder. */
const textsOf = (folder: string, names: string[]): Record<string, string> =>
  Object.fromEntries(names.map((name) => [name, readFileSync(join(folder, name), 'utf8')]))

const rowsOf = async (dev: Dev, column: string): Promise<unknown[]> =>
  Object(await dev.app().read({ from: 'items', sort: [{ by: 'createdAt' }] }, { as: system })).map(
    (row: Record<string, unknown>) => row[column] ?? null,
  )

test('[40-14b] a save at the first moment of tent dev is seen, made once, and so is one made while the session starts', async (t) => {
  // One save while the session builds the project the first time. The session is ended before its folder goes.
  const ending: { dev?: Promise<Dev> } = {}
  t.after(async () => (await ending.dev?.catch(() => undefined))?.close())
  const during = projectOf(t, 'history-early-during')
  const functions = readFileSync(join(during, 'functions.ts'), 'utf8')
  const starting = startDev(during, { port: 0, out: () => undefined })
  ending.dev = starting
  await new Promise((done) => setTimeout(done, 30))
  writeFileSync(join(during, 'functions.ts'), functions.replace('limit(100)', 'limit(5)'))
  const one = await starting
  await added(one)
  await untilTried('the save made during the start runs', async () => (await listed(one)) === 5)

  // One save at the first moment after the session answered, made once.
  const dev = await developed(t, 'history-early-after')
  const text = readFileSync(join(dev.folder, 'functions.ts'), 'utf8')
  writeFileSync(join(dev.folder, 'functions.ts'), text.replace('limit(100)', 'limit(6)'))
  await added(dev)
  await untilTried('the save at the first moment runs', async () => (await listed(dev)) === 6)
})

/** Adds nine rows, so that the starter data and they are ten. */
async function added(dev: Dev): Promise<void> {
  for (let n = 0; n < 9; n++) await dev.app().call('addItem', { title: `row ${n}` }, { as: system })
}

/** How many rows the query `allItems` of the running version answers. */
const listed = async (dev: Dev): Promise<number> => Object(await dev.app().call('allItems', {}, { as: system })).length

test('[40-3b] through tent dev, going back across a column and a table renamed with was: each takes its old name again with its values, and going forward renames them again', async (t) => {
  const dev = await developed(t, 'history-back-renamed')
  const folder = dev.folder
  await dev.app().call('addItem', { title: 'added' }, { as: system })
  await history(folder, 'save', 'before')
  const old = textsOf(folder, ['tables.ts', 'functions.ts', 'seed.ts'])

  await wrote(dev, {
    'tables.ts': `import { anyone, table, text } from 'tentjs'\n\nexport const things = table('things', {\n  columns: { name: text({ was: 'title' }) },\n  access: { read: 'anyone', add: ${why} },\n  was: 'items',\n})\n`,
    'functions.ts': `import { anyone, change, input, query, text } from 'tentjs'\nimport { things } from './tables'\n\nexport const allItems = query('allItems', { access: 'anyone', rows: things.oldest('createdAt').limit(100) })\n\nexport const addItem = change('addItem', {\n  access: ${why},\n  input: { title: text() },\n  set: things.add({ name: input('title') }),\n})\n`,
    'seed.ts':
      "import { seed } from 'tentjs'\n\nexport default seed(({ db }) => {\n  db.things.add({ name: 'seeded' })\n})\n",
  })
  await dev.app().call('addItem', { title: 'renamed' }, { as: system })
  await history(folder, 'save', 'after')

  const back = await history(folder, 'back', 'before')
  assert.deepEqual(back.findings, [])
  assert.equal(back.version, dev.version())
  assert.deepEqual(textsOf(folder, ['tables.ts', 'functions.ts', 'seed.ts']), old)
  assert.deepEqual(await rowsOf(dev, 'title'), ['seeded', 'added', 'renamed'], 'the old names hold the values')

  await history(folder, 'back', 'after')
  const rows = Object(await dev.app().read({ from: 'things', sort: [{ by: 'createdAt' }] }, { as: system }))
  assert.deepEqual(
    rows.map((row: Record<string, unknown>) => row.name),
    ['seeded', 'added', 'renamed'],
  )
})

test('[40-3b] where the data cannot follow the older files, tent history back ends with 2 and the code of why, changes no file, and the app runs as it ran', async (t) => {
  const dev = await developed(t, 'history-back-refused')
  const folder = dev.folder
  await history(folder, 'save', 'strict')
  await saved(dev, 'tables.ts', 'columns: { title: text() }', 'columns: { title: text({ optional: true }) }')
  // A row with no title: the older files require one.
  await dev.app().write([{ add: 'items', values: {} }], { as: system })
  await history(folder, 'save', 'loose')
  const files = textsOf(folder, ['tables.ts', 'functions.ts', 'seed.ts', 'tent.ts'])
  const version = dev.version()
  const points = (await pointsOf(folder)).length

  const refused = await typed(folder, 'history', 'back', 'strict', '--json')
  assert.equal(refused.ended, 2, refused.printed)
  assert.equal(refused.answer.findings?.[0].code, 'T2001')
  assert.match(refused.answer.findings?.[0].message ?? '', /title/)
  assert.deepEqual(textsOf(folder, ['tables.ts', 'functions.ts', 'seed.ts', 'tent.ts']), files, 'no file changed')
  assert.equal(dev.version(), version, 'the app runs the version it ran')
  assert.equal((await pointsOf(folder)).length, points, 'no point was recorded')
})

test('[40-3a] tent history back that would write over a file that no point holds ends with 2 and T0013, names the file, and changes nothing', async (t) => {
  const dev = await developed(t, 'history-back-unheld', { limits: '{ historyFileSize: 1024 }' })
  const folder = dev.folder
  writeFileSync(join(folder, 'notes.txt'), 'small')
  await history(folder, 'save', 'small')
  writeFileSync(join(folder, 'notes.txt'), 'x'.repeat(2000))
  await history(folder, 'save', 'large')
  const files = textsOf(folder, ['tables.ts', 'functions.ts', 'notes.txt'])

  const refused = await typed(folder, 'history', 'back', 'small', '--json')
  assert.equal(refused.ended, 2, refused.printed)
  assert.equal(refused.answer.findings?.[0].code, 'T0013', refused.printed)
  assert.match(refused.answer.findings?.[0].message ?? '', /notes\.txt/)
  assert.deepEqual(textsOf(folder, ['tables.ts', 'functions.ts', 'notes.txt']), files)
})

test('[40-14b] where the type checker answers after the save is recorded, the point is marked as not checked, and the save that mends it is a point that passed', async (t) => {
  // The functions of the project hold a change that is code, which the type checker reads.
  const functions = readFileSync(join(import.meta.dirname, 'devs', 'functions.ts'), 'utf8')
  const dev = await developed(t, 'history-typed', { limits: "{ historyJoin: '1 ms' }", functions })
  const folder = dev.folder
  // A save that the build takes and the type checker refuses: a number where a text is declared.
  await saved(dev, 'functions.ts', "['stamped', 'first'].join(' ')", '7')
  await untilTried(
    'the type checker marks the point',
    async () => (await pointsOf(folder))[0].checked === false,
    12_000,
  )
  await saved(dev, 'functions.ts', '7', "['stamped', 'again'].join(' ')")
  await untilTried(
    'the mended save is a point that passed',
    async () => (await pointsOf(folder))[0].checked === true && !dev.findings().some((one) => one.level === 'error'),
    12_000,
  )
})
