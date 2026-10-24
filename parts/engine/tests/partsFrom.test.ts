import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fetchPart } from '../index.ts'
import { nobody, running, workFolder } from './apps.ts'
import type { Packed } from './archives.ts'
import { lineOf, partServer, placeOf, tgzOf } from './archives.ts'

const tool: Packed[] = [
  { path: 'package', folder: true },
  { path: 'package/tool.txt', text: 'the tool' },
]

/** Lays down what the one action of the project fetches, for the length of a test. */
function fetches(t: { after(fn: () => void): void }, work: () => Promise<string>): void {
  Reflect.set(globalThis, 'partOfTheTest', work)
  t.after(() => Reflect.deleteProperty(globalThis, 'partOfTheTest'))
}

test('[22-6@7a] parts of createEngine names the address that serves every part and the folder they lie in, for each call of its apps', async (t) => {
  const bytes = tgzOf(tool)
  const mirror = await partServer(t, { '/mirror/tool-1.2.0.tgz': bytes })
  // The address of the list is one of the open internet: the address of the program is asked in its place.
  const list = [lineOf('tool', '1.2.0', 'https://parts.example.test/files/tool-1.2.0.tgz', bytes)]
  const folder = workFolder(t)
  const run = await running(t, { project: 'parted', engine: { parts: { from: `${mirror.origin}/mirror`, folder } } })
  // The call states neither an address nor a folder: both are those that the program gave its engine.
  fetches(t, () => fetchPart('tool', { list }))
  const place = String(await run.app.call('readsPart', {}, { as: nobody }))
  assert.equal(place, placeOf(folder, 'tool', '1.2.0'))
  assert.equal(readFileSync(join(place, 'package', 'tool.txt'), 'utf8'), 'the tool')
  assert.deepEqual(mirror.asked, ['/mirror/tool-1.2.0.tgz'])
  // What a call states itself still wins.
  const other = workFolder(t)
  fetches(t, () => fetchPart('tool', { list, folder: other }))
  assert.equal(await run.app.call('readsPart', {}, { as: nobody }), placeOf(other, 'tool', '1.2.0'))
})

test('[22-6@7a] the wait for a part does not count on the time of the call that needed it: an action that may take 400 ms is answered after a fetch of more than a second', async (t) => {
  const bytes = tgzOf(tool)
  const slow = await partServer(t, { '/tool-1.2.0.tgz': bytes }, 1200)
  const list = [lineOf('tool', '1.2.0', `${slow.origin}/tool-1.2.0.tgz`, bytes)]
  const folder = workFolder(t)
  const run = await running(t, { project: 'parted', engine: { parts: { folder } }, open: { mode: 'development' } })
  fetches(t, () => fetchPart('tool', { list }))
  const began = performance.now()
  assert.equal(await run.app.call('readsPart', {}, { as: nobody }), placeOf(folder, 'tool', '1.2.0'))
  assert.ok(performance.now() - began >= 1000, 'the fetch was waited for')
  // The same wait with no fetch in it passes the time of the call.
  await assert.rejects(run.app.call('waits', {}, { as: nobody }), { code: 'T0008' })
})
