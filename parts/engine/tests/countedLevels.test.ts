import assert from 'node:assert/strict'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import { testApp } from '../../test/index.ts'
import { counts } from '../index.ts'
import type { App } from '../index.ts'
import { workFolder } from './apps.ts'
import { counting } from './countingApps.ts'
import { rowsIn } from './modeling.ts'

const hour = 3_600_000

/** Keeps a loose file for a week, so that no sweep takes it while the test lets hours pass. */
const kept = (description: Description): void => {
  Object.assign(description.project, { limits: { ...Object(description.project.limits), looseKept: 7 * 24 * hour } })
}

/** Uploads a text as a visitor of the app, and answers how many bytes it holds. */
async function uploaded(app: App, origin: string, text: string): Promise<number> {
  const bytes = new TextEncoder().encode(text).length
  const answer = await app.request(
    new Request(`${origin}/_t/files?name=paper.txt`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'content-length': String(bytes), origin },
      body: text,
    }),
  )
  assert.equal(answer.status, 200, await answer.clone().text())
  await answer.text()
  return bytes
}

/** The sum of one unit over the counts of a data folder that is closed, read with no engine in between. */
const closedSum = (dataFolder: string, unit: string): number =>
  Number(rowsIn(dataFolder, 'data.db', `SELECT SUM(amount) AS n FROM _t_counts WHERE unit = '${unit}'`)[0]?.n ?? 0)

test('[21-22] a file that stood for an hour adds its bytes times an hour to fileByteSeconds, and fileBytesPeak holds the most', async (t) => {
  const { app, origin, advance, dataFolder } = await counting(t, { change: kept })
  const size = await uploaded(app, origin, 'The words of a paper that stands for an hour.')
  for (let step = 0; step < 6; step++) advance(hour / 6)
  await app.close()
  assert.equal(closedSum(dataFolder, 'fileByteSeconds'), size * 3600)
  assert.equal(closedSum(dataFolder, 'fileBytesPeak'), size)
})

test('[21-22] dataByteSeconds grows by the size times the time between two measures, and dataBytesPeak holds the highest that was measured', async (t) => {
  const { app, advance, dataFolder } = await counting(t)
  advance(hour)
  advance(hour)
  await app.close()
  const peak = closedSum(dataFolder, 'dataBytesPeak')
  const seconds = closedSum(dataFolder, 'dataByteSeconds')
  assert.ok(peak > 0)
  // Two hours of data, never more than the highest size for both; the file may grow as it closes, which the peak holds
  // and no hour counts, so at least half an hour of the highest.
  assert.ok(seconds > peak * 1800 && seconds <= peak * 7200, `${seconds} for a peak of ${peak}`)
})

test('[21-22] an app that was closed, or slept, for an hour books that hour of its files and of its data at its next opening', async (t) => {
  const run = await counting(t, { change: kept })
  const size = await uploaded(run.app, run.origin, 'A paper that waits while the app is closed.')
  run.advance(10 * 60_000)
  await run.app.close()
  run.advance(hour)
  const again = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  await again.close()
  // Ten minutes open, and an hour closed, booked at the second opening.
  assert.equal(closedSum(run.dataFolder, 'fileByteSeconds'), size * (600 + 3600))
  assert.ok(closedSum(run.dataFolder, 'dataByteSeconds') > 0)
  // An app that falls asleep books the time it slept at its waking, as one that closed.
  const sleepy = await run.engine.open(run.bundle.folder, {
    dataFolder: run.dataFolder,
    mode: 'test',
    sleepAfter: '10 minutes',
  })
  run.advance(11 * 60_000)
  run.advance(hour)
  await sleepy.ready()
  await sleepy.close()
  assert.equal(closedSum(run.dataFolder, 'fileByteSeconds'), size * (600 + 3600 + 660 + 3600))
})

test('[21-22] after a kill no hour is booked twice: the span is booked from the moment that the counts hold', async (t) => {
  const folder = join(workFolder(t), 'shop')
  cpSync(join(import.meta.dirname, 'countedShop'), folder, { recursive: true })
  const app = await testApp({ folder })
  t.after(() => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  const size = new TextEncoder().encode('A paper of a shop that is killed.').length
  await app.as(ada).call('keepPaper', { text: 'A paper of a shop that is killed.' })
  app.clock.advance('1 minute')
  await app.kill()
  app.clock.advance('1 hour')
  await app.restart()
  app.clock.advance('1 minute')
  const rows: unknown = await app.read(counts.where({ unit: 'fileByteSeconds' }), { as: 'system' })
  const seconds = (Array.isArray(rows) ? rows : []).reduce((all: number, one) => all + Number(Object(one).amount), 0)
  // A minute, an hour and a minute, and the moments that the program itself took: never two hours.
  assert.ok(seconds >= size * 3720 && seconds < size * 3780, `${seconds / size} seconds of the paper`)
})
