import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { bundled, engineOf, running, system, testClock, workFolder } from './apps.ts'
import { addCard } from './watching.ts'

const day = 86_400_000

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => boolean): Promise<void> {
  for (let n = 0; n < 2000; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 5))
  }
  assert.fail(`never: ${what}`)
}

test('[40-3b] a share of the upkeep that is given again under its name takes the place of the first: the first is carried out no more, and the second once with each daily upkeep', async (t) => {
  const { clock, advance } = testClock()
  const run = await running(t, { engine: { makers: { clock: () => clock } } })
  let first = 0
  let second = 0
  run.engine.give('upkeep', 'history', { daily: () => void first++ }, run.app)
  await until('the first share at its giving', () => first === 1)
  // The history of a project is closed and opened again, and its share is given again under the same name.
  run.engine.give('upkeep', 'history', { daily: () => void second++ }, run.app)
  await until('the second share at its giving', () => second === 1)
  advance(day)
  await until('the upkeep of the first day', () => second === 2)
  await new Promise((ended) => setTimeout(ended, 20))
  assert.equal(first, 1, 'the share that was replaced is carried out no more')
  assert.equal(second, 2, 'the share is carried out once with each daily upkeep')
})

test('[40-3b] a switch with back across a column that was renamed with was: the older version reads the values under the old name, and going forward again reads them under the new one', async (t) => {
  const work = workFolder(t)
  const first = await bundled(t, { project: 'board' }, work)
  const renamed = await bundled(
    t,
    {
      project: 'board',
      change: (d: Description) => {
        const columns = Object(d.tables.cards.columns)
        columns.heading = { ...columns.title, was: ['title'] }
        delete columns.title
        for (const fn of Object.values(d.functions)) {
          const text = JSON.stringify(fn).replaceAll('"title"', '"heading"')
          Object.assign(fn, JSON.parse(text))
        }
      },
    },
    work,
  )
  const engine = engineOf(t)
  const app = await engine.open(first.folder, { dataFolder: join(work, 'data'), mode: 'development' })
  await addCard(app, 'a', 1)
  await app.switch(await app.add(renamed.folder))
  const read = async (column: string): Promise<unknown> =>
    Object(await app.read({ from: 'cards', sort: [{ by: 'rank' }] }, { as: system })).map(
      (row: Record<string, unknown>) => row[column] ?? null,
    )
  assert.deepEqual(await read('heading'), ['a'])

  await app.switch(await app.add(first.folder), { back: true })
  assert.deepEqual(await read('title'), ['a'], 'the older version reads the value it wrote')
  await app.switch(await app.add(renamed.folder))
  assert.deepEqual(await read('heading'), ['a'], 'going forward again reads the value under the new name')
})
