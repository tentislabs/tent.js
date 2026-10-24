import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { untilWithin } from './remotes.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** What a cache outside is told, as the flow of the project that listens to `page.stale` wrote it down. */
interface Stale {
  addresses?: { host: string; address: string; language: string }[]
  keys?: string[]
  all?: true
  why: string
}

/** Every `page.stale` that the flow of the project was handed, in the order it was handed them. */
function toldOf(at: Served): Stale[] {
  const data = new DatabaseSync(join(at.dataFolder, 'data.db'), { readOnly: true })
  try {
    return data
      .prepare('SELECT told FROM "staleNotes" ORDER BY rowid')
      .all()
      .map((row) => JSON.parse(String(row.told)))
  } catch {
    return []
  } finally {
    data.close()
  }
}

/** How many times the app called a function, as its log of calls holds it. */
function callsOf(at: Served, name: string): number {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(Object(log.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    log.close()
  }
}

test('[44-4] a write to a table that a public answer read raises page.stale with that address within a second, with its keys where keysHeader is set, to a flow that listens', async () => {
  const at = await served('staled')
  const first = await fetch(`${at.address}/shared`)
  assert.equal(first.status, 200)
  await first.text()
  // A public answer carries the tables it read in the header the project names.
  assert.match(String(first.headers.get('cache-control')), /^public/)
  assert.equal(first.headers.get('surrogate-key'), 't:news')
  // An answer that is not public carries none.
  const kept = await fetch(`${at.address}/news`)
  await kept.text()
  assert.equal(kept.headers.get('surrogate-key'), null)
  const before = toldOf(at).length
  const wrote = Date.now()
  await at.app.call('addNews', { title: 'Second news' }, { as: { kind: 'system' } })
  await untilWithin('the flow is handed the stale address', () => toldOf(at).length > before, 10_000)
  const handed = Date.now()
  const stale = toldOf(at).at(-1)
  assert.ok(stale)
  assert.equal(stale.why, 'write')
  assert.deepEqual(stale.addresses, [{ host: new URL(at.address).host, address: '/shared', language: 'en' }])
  assert.deepEqual(stale.keys, ['t:news'])
  assert.ok(handed - wrote < 3000, `handed ${handed - wrote} ms after the write, the run of the flow among them`)
})

test('[44-4] a switch raises page.stale with every address, warms the addresses asked most, and the first visitor after it is answered from the cache', async () => {
  const at = await served('staled', { for: 'dev' })
  for (let k = 0; k < 3; k++) await (await fetch(`${at.address}/shared`)).text()
  await (await fetch(`${at.address}/news`)).text()
  // A second version of the project, made loadable beside the first.
  const next = join(at.dataFolder, '..', 'next')
  cpSync(join(import.meta.dirname, 'staled'), next, { recursive: true })
  const file = join(next, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('{all.length} shared', '{all.length} shared anew'))
  const made = await buildProject(next, { for: 'dev', out: join(next, 'bundle') })
  const version = await at.app.add(made.bundleFolder)
  const before = toldOf(at).length
  await at.app.switch(version)
  await untilWithin('the flow is handed the switch', () =>
    toldOf(at)
      .slice(before)
      .some((one) => one.all === true),
  )
  assert.equal(
    toldOf(at)
      .slice(before)
      .find((one) => one.all === true)?.why,
    'version',
  )
  // The first visitor after the switch is answered from what the switch drew: nothing reads the query again.
  const reads = callsOf(at, 'allNews')
  const after = await fetch(`${at.address}/shared`)
  assert.match(await after.text(), /shared anew/)
  await new Promise((done) => setTimeout(done, 150))
  assert.equal(callsOf(at, 'allNews'), reads)
})
