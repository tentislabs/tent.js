import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { logRows } from './apps.ts'
import { addCard, addBoardUser, board, runsOf, untilTried, watcher } from './watching.ts'

/** The lines of the log that say the data file was written from outside the engine. */
const saidOutside = (dataFolder: string): number =>
  logRows(dataFolder, 'lines').filter((row) => /from outside/.test(String(row.message))).length

/** The titles that a page was last sent for one watch, as one text. */
const lastOf = (got: Record<string, unknown>[], id: string): string =>
  JSON.stringify(got.filter((one) => one.id === id).at(-1) ?? null)

test('[20-8@6] a write of the data file from outside the engine is met by the next write of the engine: every live group is run again, and the log says that the file was written from outside', async (t) => {
  const { app, origin, dataFolder } = await board(t)
  const card = await addCard(app, 'first', 1)
  const page = watcher(app, origin)
  assert.equal((await page.watch('cards', 'allCards')).t, 'result')
  assert.equal((await page.watch('count', 'countCards')).value, 1)
  // The writes of the engine alone are no write from outside.
  await addCard(app, 'second', 2)
  await untilTried('the page was sent the second card', () => page.of('result', 'count').some((one) => one.value === 2))
  assert.equal(saidOutside(dataFolder), 0)

  // Another program opens the file against the rule, and writes a card and a title.
  const outside = new DatabaseSync(join(dataFolder, 'data.db'))
  try {
    outside.prepare('UPDATE "cards" SET "title" = ? WHERE "id" = ?').run('written outside', card)
    outside.prepare('DELETE FROM "cards" WHERE "title" = ?').run('second')
  } finally {
    outside.close()
  }
  const [sent, ran] = [page.got.length, runsOf(dataFolder, 'countCards')]

  // The next write of the engine touches no table that the page watches: its groups are run again all the same.
  await addBoardUser(app, 'ada')
  await untilTried('the page was sent the count as the file holds it', () =>
    lastOf(page.got, 'count').includes('"value":1'),
  )
  await untilTried('the page was sent the title that was written outside', () =>
    page.got.slice(sent).some((one) => JSON.stringify(one).includes('written outside')),
  )
  assert.ok(runsOf(dataFolder, 'countCards') > ran)
  assert.equal(saidOutside(dataFolder), 1)

  // It is said once for what was written: a later write of the engine finds nothing new.
  await addBoardUser(app, 'bob')
  await addCard(app, 'third', 3)
  await untilTried('the page was sent the third card', () => lastOf(page.got, 'count').includes('"value":2'))
  assert.equal(saidOutside(dataFolder), 1)
  page.close()
})
