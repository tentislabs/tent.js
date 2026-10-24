import assert from 'node:assert/strict'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Files } from '../index.ts'
import { ageOut, backup, connected, layoutOf, restore } from '../index.ts'
import { appOf, filesOf, folderOf, heldIn, metaOf, readingFiles, seedDesk, teamFile, writingFiles } from './apart.ts'
import { at } from './shop.ts'
import { workFolder } from './work.ts'

const desk = appOf()

/** Every file under a folder, as its path from that folder, written with `/`, in the order of the names. */
function filesUnder(folder: string, below = ''): string[] {
  return readdirSync(join(folder, below), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? filesUnder(folder, `${below}${entry.name}/`) : [`${below}${entry.name}`],
    )
    .sort()
}

/** Where the file of a team stands under a data folder, and under the folder of a backup. */
const placeOf = (team: string): string => `tenants/teams/${team.slice(-2)}/${team}.db`

/** The list of a backup: which backup holds the file of each tenant. */
function listOf(folder: string): Record<string, string> {
  const list: { table: string; id: string; backup: string }[] = JSON.parse(
    readFileSync(join(folder, 'files.json'), 'utf8'),
  )
  for (const entry of list) assert.equal(entry.table, 'teams')
  return Object.fromEntries(list.map((entry) => [entry.id, entry.backup]))
}

/** What the files of an app hold: the rows of the shared file, and every tenant's file with all it holds. */
function heldBy(files: Files): { shared: Record<string, unknown>; files: Record<string, unknown> } {
  // The shared `_t_meta` holds the mark of the count of removals, which a restore makes anew.
  const { _t_meta: _, ...shared } = heldIn(files.shared)
  return { shared, files: Object.fromEntries([...files.walk()].map((file) => [file.id, heldIn(files.of(file))])) }
}

/** The totals of the orders of one team, as its file holds them now. */
const totalsOf = (files: Files, team: string): unknown[] =>
  at(readingFiles(files, desk), 'orders')
    .of(team)
    .all()
    .map((row) => row.total)

test('[50-12] a backup holds the shared file and the files written since the backup before, a backup that ages out leaves its files with a kept one, and a whole restore puts every file back', async (t) => {
  const files = connected(filesOf(t, desk, {}, folderOf(t)), layoutOf(desk), {})
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const order = (team: string, total: number, placedBy?: string) =>
    write((db) => String(at(db, 'orders').of(team).add({ total, placedBy }).id))
  const backups = workFolder(t)
  /** Takes a backup, and answers the name of its folder: the names stand in the order the backups were made. */
  const take = async (o?: { before?: string; whole?: true }) => {
    const answer = await backup(files, backups, o)
    assert.deepEqual(Object.keys(answer), ['n'])
    return String(readdirSync(backups).sort().at(-1))
  }

  // Three of four tenants are written to. West has no file.
  order(s.north, 1, s.cy)
  order(s.south, 2)
  order(s.east, 3)
  const first = await take()
  const [north, south, east, west] = [s.north, s.south, s.east, s.west].map(placeOf)
  assert.deepEqual(filesUnder(join(backups, first)), [north, south, east, 'data.db', 'files.json'].sort())
  assert.deepEqual(listOf(join(backups, first)), { [s.north]: first, [s.south]: first, [s.east]: first })

  // A backup holds the shared file, and every tenant's file that was written since the backup before.
  order(s.north, 10)
  const second = await take({ before: first })
  assert.notEqual(second, first)
  assert.deepEqual(filesUnder(join(backups, second)), [north, 'data.db', 'files.json'].sort())
  assert.deepEqual(listOf(join(backups, second)), { [s.north]: second, [s.south]: first, [s.east]: first })

  // A tenant's first write, a write to another, and a removal in the shared file that a file links to.
  order(s.south, 20)
  order(s.west, 4)
  write((db) => at(db, 'users').remove(s.cy))
  const third = await take({ before: second })
  assert.deepEqual(filesUnder(join(backups, third)), [south, west, 'data.db', 'files.json'].sort())
  const pointed = { [s.north]: second, [s.south]: third, [s.east]: first, [s.west]: third }
  assert.deepEqual(listOf(join(backups, third)), pointed)
  const atThird = heldBy(files)
  const mark = Object(metaOf(files.shared, 'removals'))
  assert.equal(mark.count, 1)

  // The first backup ages out: the file that a kept backup points at moves into the oldest kept one, the lists of
  // the kept backups say so, and its folder is gone.
  ageOut(join(backups, first), join(backups, second))
  assert.deepEqual(readdirSync(backups).sort(), [second, third])
  assert.deepEqual(filesUnder(join(backups, second)), [north, south, east, 'data.db', 'files.json'].sort())
  assert.deepEqual(listOf(join(backups, second)), { [s.north]: second, [s.south]: second, [s.east]: second })
  assert.deepEqual(listOf(join(backups, third)), { ...pointed, [s.east]: second })
  assert.deepEqual(filesUnder(join(backups, third)), [south, west, 'data.db', 'files.json'].sort())

  // Writes go on: to a file of the backup, to one that an older backup holds, and to a tenant that is new.
  order(s.north, 100)
  order(s.east, 300)
  const far = write((db) => String(at(db, 'teams').add({ name: 'Far' }).id))
  order(far, 5)
  assert.ok(files.has(teamFile(far)))

  // A whole restore puts every file back, from the backup that holds it, and removes the file that the backup
  // does not name.
  await restore(files, join(backups, third))
  assert.deepEqual([...files.walk()].map((file) => file.id).sort(), [s.north, s.south, s.east, s.west].sort())
  assert.equal(files.has(teamFile(far)), false)
  assert.deepEqual(heldBy(files), atThird)
  assert.deepEqual(totalsOf(files, s.north), [1, 10])
  assert.deepEqual(totalsOf(files, s.east), [3])
  // The mark of the count of removals is new, so every file is swept when it is next opened.
  const again = Object(metaOf(files.shared, 'removals'))
  assert.equal(again.count, 1)
  assert.notEqual(again.mark, mark.mark)

  // One tenant is put back alone: the files of the others stay as they are.
  order(s.north, 7)
  order(s.south, 21)
  await restore(files, join(backups, third), { of: teamFile(s.north) })
  assert.deepEqual(totalsOf(files, s.north), [1, 10])
  assert.deepEqual(totalsOf(files, s.south), [2, 20, 21])
  assert.deepEqual(heldIn(files.of(teamFile(s.north))), atThird.files[s.north])
  // A tenant that the backup holds no file of, and one whose row is not there, are put back by nothing.
  const refusedFor = (team: string) => assert.rejects(restore(files, join(backups, third), { of: teamFile(team) }))
  await refusedFor(far)
  await assert.rejects(restore(files, join(backups, third), { of: { table: 'teams', id: '../x' } }))

  // A file holds its table and its tenant: one that stands in a backup under another tenant is refused.
  copyFileSync(join(backups, second, north), join(backups, third, south))
  await assert.rejects(restore(files, join(backups, third), { of: teamFile(s.south) }), (error) => {
    assert.equal(Object(error).code, 'T0009')
    assert.match(String(error), /another tenant/)
    return true
  })
  assert.deepEqual(totalsOf(files, s.south), [2, 20, 21])
  await assert.rejects(restore(files, join(backups, third)), { code: 'T0009' })
  assert.deepEqual(totalsOf(files, s.south), [2, 20, 21])
})

test('[50-12] a whole backup copies every file, and a restore whose list names a backup that is not there is refused, naming it', async (t) => {
  const files = connected(filesOf(t, desk, {}, folderOf(t)), layoutOf(desk), {})
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const order = (team: string, total: number) => write((db) => at(db, 'orders').of(team).add({ total }))
  const backups = workFolder(t)
  const take = async (o?: { before?: string; whole?: true }) => {
    await backup(files, backups, o)
    return String(readdirSync(backups).sort().at(-1))
  }
  order(s.north, 1)
  order(s.south, 2)
  const first = await take()
  order(s.south, 20)
  const second = await take({ before: first })
  assert.deepEqual(listOf(join(backups, second)), { [s.north]: first, [s.south]: second })
  // With `whole` every file is copied, whatever the backup before holds: it is carried to another place alone.
  const whole = await take({ before: second, whole: true })
  assert.deepEqual(
    filesUnder(join(backups, whole)),
    [placeOf(s.north), placeOf(s.south), 'data.db', 'files.json'].sort(),
  )
  assert.deepEqual(listOf(join(backups, whole)), { [s.north]: whole, [s.south]: whole })

  // The second backup needs the first: without it the restore is refused, names it, and puts nothing back.
  order(s.north, 100)
  order(s.south, 200)
  rmSync(join(backups, first), { recursive: true })
  await assert.rejects(restore(files, join(backups, second)), (error) => {
    assert.equal(Object(error).code, 'T0009')
    assert.ok(String(Object(error).message).includes(first))
    return true
  })
  assert.deepEqual(totalsOf(files, s.north), [1, 100])
  assert.deepEqual(totalsOf(files, s.south), [2, 20, 200])
  // A backup that ages out into a folder that is no kept backup is refused, and stays.
  assert.throws(() => ageOut(join(backups, second), join(backups, first)), { code: 'T0009' })
  assert.ok(existsSync(join(backups, second, 'files.json')))
  // The whole backup stands alone.
  await restore(files, join(backups, whole))
  assert.deepEqual(totalsOf(files, s.north), [1])
  assert.deepEqual(totalsOf(files, s.south), [2, 20])
})

test('[50-12] a backup of files whose writes are not counted copies every file each time', async (t) => {
  const files = filesOf(t, desk, {}, folderOf(t))
  const s = seedDesk(files, desk)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  const backups = workFolder(t)
  await backup(files, backups)
  const [first] = readdirSync(backups)
  await backup(files, backups, { before: first })
  const second = String(readdirSync(backups).sort().at(-1))
  // No file holds the number of its last write, so none is known to stand as the backup before holds it.
  assert.deepEqual(listOf(join(backups, second)), { [s.north]: second })
  await assert.rejects(backup(files, backups, { before: 'data-none' }), { code: 'T0009' })
})
