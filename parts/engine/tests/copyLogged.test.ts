import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { bundled, logRows } from './apps.ts'
import { addNote, current, keys, machineAddress, readerIn, worldOf, writerIn } from './machines.ts'

/** The id of a key, as the log names a caller that is one: the first 16 characters of its fingerprint. */
const idOf = (key: string): string => fingerprintOf(new TextEncoder().encode(key)).slice(0, 16)

test('[16-4@4] each request to an address of the link writes one row of calls on the machine that answered it: of the kind copy, with the id of its key as its caller', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, {}, world.work))
  const writerData = join(world.work, 'writer')
  // Two readers start on empty folders: each asks for the versions, their files, the data, and opens the link.
  const near = await readerIn(world, 'near')
  const far = await readerIn(world, 'far')
  await current(world, near)
  await current(world, far)
  await addNote(app, 'one')
  const rows = logRows(writerData, 'calls').filter((row) => row.kind === 'copy')
  for (const [kind, key] of [
    ['near', keys.near],
    ['far', keys.far],
  ] as const) {
    const mine = rows.filter((row) => row.callerId === idOf(key))
    const names = new Set(mine.map((row) => row.name))
    for (const name of ['copy/versions', 'copy/blob', 'copy/data', 'copy'])
      assert.equal(names.has(name), true, `the ${kind} reader asked for ${name}: ${[...names].join(', ')}`)
    assert.deepEqual([...new Set(mine.map((row) => [row.callerKind, row.ok].join(' ')))], ['key 1'])
  }
  // One row for one request. How often a reader asked is not the test's to say: a reader whose clock ran on while
  // its request was under way asks again. So the rows are held against the requests that the readers made.
  const made = (under: string): number =>
    Object.entries(world.asked)
      .filter(([path]) => path === under || path.startsWith(`${under}/`))
      .reduce((sum, [, count]) => sum + count, 0)
  for (const name of ['copy/versions', 'copy/blob', 'copy/data'])
    assert.equal(rows.filter((row) => row.name === name).length, made(`/_t/${name}`), name)
  // The link is opened by no request of that kind: each opening is one reader that joined.
  assert.equal(
    rows.filter((row) => row.name === 'copy').length,
    world.heard.filter((one) => one === 'reader.joined writer').length,
  )
  assert.equal(
    rows.length,
    rows.filter((row) => [idOf(keys.near), idOf(keys.far)].includes(String(row.callerId))).length,
  )
  // A request with a key that is none finds nothing, and writes no row: the address is not there for it.
  const before = logRows(writerData, 'calls').length
  const asked = (key: string, path: string, method = 'GET'): Promise<Response> =>
    app.request(new Request(`${machineAddress.writer}${path}`, { method, headers: { authorization: `Bearer ${key}` } }))
  assert.equal((await asked(keys.none, '/_t/copy/versions')).status, 404)
  assert.equal(logRows(writerData, 'calls').length, before)
  // A request that is refused past its key is a row too, with its code.
  assert.equal((await asked(keys.near, '/_t/copy/blob/nothing')).status, 404)
  assert.equal((await asked(keys.near, '/_t/copy/took', 'POST')).status, 400)
  const refused = logRows(writerData, 'calls').slice(before)
  assert.deepEqual(
    refused.map((row) => [row.name, row.kind, row.callerId, row.ok, row.code]),
    [
      ['copy/blob', 'copy', idOf(keys.near), 0, 'T0001'],
      ['copy/took', 'copy', idOf(keys.near), 0, 'T0002'],
    ],
  )
})
