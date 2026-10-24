import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { bundled, engineOf, system, workFolder } from './apps.ts'
import { addCard } from './watching.ts'

test('[40-3b] app.facts with back says, with nothing changed, whether the data can follow a way back: a rename and what was added since are no finding, and rows that do not fit the older files are T2001', async (t) => {
  const work = workFolder(t)
  const first = await bundled(t, { project: 'board' }, work)
  const newer = await bundled(
    t,
    {
      project: 'board',
      change: (d: Description) => {
        const columns = Object(d.tables.cards.columns)
        columns.heading = { ...columns.title, was: ['title'] }
        delete columns.title
        columns.colour = { kind: 'text', optional: true }
        d.tables.labels = { columns: { name: { kind: 'text' } }, access: { read: { rule: 'anyone', why: 'open' } } }
        for (const fn of Object.values(d.functions))
          Object.assign(fn, JSON.parse(JSON.stringify(fn).replaceAll('"title"', '"heading"')))
      },
    },
    work,
  )
  const engine = engineOf(t)
  const app = await engine.open(first.folder, { dataFolder: join(work, 'data'), mode: 'development' })
  await addCard(app, 'a', 1)
  await app.switch(await app.add(newer.folder))
  const older = first.description

  // Without `back` the older files are refused, for what is gone with no statement.
  const plain = await app.facts(older)
  assert.ok(plain.tableFindings.some((one) => /^T200[2-4]$/.test(one.code)))
  // With `back` the data can follow: the rename is turned round, and what was added since is retired.
  assert.deepEqual((await app.facts(older, { back: true })).tableFindings, [])

  // An older description that requires what a row does not hold: the data cannot follow, and it says which rows.
  const strict: Description = structuredClone(older)
  Object.assign(Object(strict.tables.cards.columns), { owner: { kind: 'text' } })
  const found = (await app.facts(strict, { back: true })).tableFindings
  assert.deepEqual(
    found.map((one) => one.code),
    ['T2001'],
  )
  // Nothing was changed by the asking: the app reads its row under the newer name.
  const rows = Object(await app.read({ from: 'cards' }, { as: system }))
  assert.deepEqual(
    rows.map((row: Record<string, unknown>) => row.heading),
    ['a'],
  )
})
