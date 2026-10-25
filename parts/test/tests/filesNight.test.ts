import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { measure, held } from '../../../rig/budgets.ts'
import {
  addOrder,
  addTeam,
  besideOf,
  command,
  deskBundle,
  deskOf,
  fileOf,
  teamFilesIn,
  listed,
  openOn,
  titlesOf,
} from './desks.ts'
import { moment, until } from './many.ts'

const system = { as: { kind: 'system' } } as const

test('[50-6] [night] 500 tenants are written to with openFiles at 50: no more than 50 files are open, every write is there afterwards, and a quiet file is closed after fileCloseAfter', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const teams: string[] = []
  let most = 0
  for (let i = 0; i < 500; i++) {
    const team = await addTeam(app, `team ${i}`)
    teams.push(team)
    await addOrder(app, team, `the order of ${i}`)
    // A second write to a tenant that was written to a while ago finds its file closed, and opens it again.
    if (i >= 100 && i % 7 === 0) await addOrder(app, teams[i - 100], `a later order of ${i - 100}`)
    if (i % 20 === 19) {
      const open = (await listed(app, dataFolder)).files.filter((one) => one.open).length
      most = Math.max(most, open)
      assert.ok(open <= 50, `${open} files are open after ${i + 1} tenants`)
    }
  }
  assert.equal(most, 50)
  const all = (await listed(app, dataFolder)).files
  assert.equal(all.length, 500)
  assert.equal(teamFilesIn(dataFolder).length, 500)
  assert.equal(new Set(all.map((one) => one.layout)).size, 1)
  // Every write is there afterwards, read with no more than 50 files open at any moment.
  for (const [i, team] of teams.entries()) {
    const later = i >= 0 && i + 100 < 500 && (i + 100) % 7 === 0
    assert.deepEqual(
      await titlesOf(app, team),
      later ? [`the order of ${i}`, `a later order of ${i}`] : [`the order of ${i}`],
    )
    if (i % 50 === 49) assert.ok((await listed(app, dataFolder)).files.filter((one) => one.open).length <= 50)
  }
  // A quiet file is closed after `fileCloseAfter`, and leaves nothing beside it.
  app.clock.advance('2 minutes')
  await moment(20)
  assert.equal((await listed(app, dataFolder)).files.filter((one) => one.open).length, 0)
  for (const team of teams) assert.deepEqual(besideOf(dataFolder, team), [])
})

test('[50-6] [night] a table of a million rows that is rebuilt while its file is brought up delays no read of another tenant by more than 50 ms, how long a write of another tenant waited is written down, and the backup after it holds every file that was brought up', async (t) => {
  const first = await deskOf(t)
  const large = await addTeam(first.app, 'Large')
  const small = [await addTeam(first.app, 'Small'), await addTeam(first.app, 'Other')]
  await addOrder(first.app, large, 'the first')
  for (const team of small) for (let i = 0; i < 20; i++) await addOrder(first.app, team, `order ${i}`)
  for (let from = 1; from <= 1_000_000; from += 100_000)
    await first.app.call('fill', { team: large, from, to: from + 99_999 }, system)
  assert.equal(await first.app.call('countOrders', { team: large }, system), 1_000_001)
  await first.app.kill()

  // `total` of `orders` becomes a text: the table of every file is rebuilt, a million rows in one of them.
  const { app, dataFolder } = await openOn(t, await deskBundle(t, { totalText: true }), first.dataFolder)
  const isBehind = async (team: string): Promise<boolean> =>
    (await listed(app, dataFolder)).files.find((one) => one.id === team)?.behind === true
  await until('the small files are brought up', async () => !(await isBehind(small[0])) && !(await isBehind(small[1])))
  assert.equal(await isBehind(large), true, 'the large file is still being brought up')
  // While the large file is rebuilt on its thread, the reads and the writes of the other tenants are answered.
  const reads: number[] = []
  const writes: number[] = []
  while (await isBehind(large)) {
    for (const team of small) {
      const began = performance.now()
      const rows: unknown[] = Object(await app.call('listOrders', { team }, system))
      reads.push(performance.now() - began)
      assert.ok(rows.length >= 20)
    }
    const began = performance.now()
    await addOrder(app, small[0], 'meanwhile')
    writes.push(performance.now() - began)
    await moment(1)
  }
  assert.ok(reads.length >= 10, `${reads.length} reads were answered while the file was brought up`)
  const longest = Math.max(...reads)
  held('files.readBeside', longest, 'ms')
  // How long a write of another tenant waited is measured and written down, and held to no bar.
  await measure('files.writeBesideRebuild', () => Math.max(...writes), { unit: 'ms' })
  assert.equal(await app.call('countOrders', { team: large }, system), 1_000_001)

  // The backup after it holds every file that was brought up.
  const backup: Record<string, unknown> = Object(await command(app, dataFolder, 'data', { what: 'backup' }))
  const folder = String(backup.file)
  for (const team of [large, ...small]) {
    const copy = join(folder, fileOf(dataFolder, team).slice(dataFolder.length + 1))
    assert.equal(existsSync(copy), true, `the backup holds the file of ${team}`)
  }
})
