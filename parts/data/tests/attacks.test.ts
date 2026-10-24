import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import type { Change, FileName, Files } from '../index.ts'
import { applyChange, backup, connected, layoutOf, restore, sweep } from '../index.ts'
import { filesOf, folderOf, metaOf, person, readingFiles, storedIn, teamFile, writingFiles } from './apart.ts'
import { board, rawOf, rawWrite, seedBoard } from './board.ts'
import { at } from './shop.ts'
import { codeOf, system } from './work.ts'

/**
 * Every file that stands under a data folder, with a fingerprint of its bytes, but for the shared file and what
 * SQLite keeps beside it. Asked while no file of a tenant is open, it changes with every touch of one.
 */
function standing(folder: string, from = folder): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) return standing(path, from)
      if (folder === from && entry.name.startsWith('data.db')) return []
      return [`${relative(from, path)} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`]
    })
    .sort()
}

/** Puts a file by hand at each place that an id made of `../` and `x` would lead to from the folder of a tenant's file. */
function planted(folder: string): void {
  for (const place of [
    ['x.db'],
    ['tenants', 'x.db'],
    ['tenants', 'teams', 'x.db'],
    ['tenants', 'teams', 'x', 'x.db'],
  ]) {
    mkdirSync(join(folder, ...place.slice(0, -1)), { recursive: true })
    writeFileSync(join(folder, ...place), 'put here by hand')
  }
}

/** Ids that are made to leave the folder of the files, or that are no id at all. */
function leaving(real: string): string[] {
  return [
    '../x',
    '../../x',
    '../../../x',
    '../../../../x',
    '..\\x',
    '..\\..\\x',
    'x',
    'a/b',
    'a\\b',
    '/x',
    'C:\\x',
    '\\\\.\\x',
    `../${real}`,
    `${real}/..`,
    `${real}/../${real}`,
    `${real.slice(0, 12)}/${real.slice(13)}`,
    `../${real.slice(3)}`,
    '.'.repeat(26),
    `${real}.db`,
    `${real} `,
    `${real}.`,
    `${real}:x`,
    `${real}\n`,
    `${real}\u0000`,
    real.toUpperCase(),
    'x'.repeat(300),
    real.slice(0, 1).repeat(300),
    `../${'x'.repeat(297)}`,
    '',
  ]
}

/** What each read and each write of a caller answers for one id handed to `of`: the rows, or the code of the refusal. */
function answersFor(files: Files, who: FileName['id'] | undefined, id: string, row: string): unknown[] {
  const as = who === undefined ? system : person(who)
  const reads = readingFiles(files, board, as)
  const write = writingFiles(files, board, as)
  const tried = (call: () => unknown): unknown => {
    try {
      return call()
    } catch (error) {
      return error instanceof Error && 'code' in error ? error.code : `no code: ${error}`
    }
  }
  // What a write of each table gives: a row that would fit, were the tenant one.
  const rows: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['orders', { total: 1, meaning: [1, 0, 0, 0] }, { note: 'in' }],
    ['tasks', { title: 'in' }, { title: 'in' }],
  ]
  return rows.flatMap(([name, added, changed]) => [
    tried(() => at(reads, name).of(id).all()),
    tried(() => at(reads, name).of(id).count()),
    tried(() => at(reads, name).of(id).get(row)),
    tried(() => at(reads, name).of(id).search('secret').all()),
    tried(() => at(reads, name).of(id).history(row)),
    tried(() => at(reads, name).of(id).where({ id: row }).first()),
    tried(() => write((db) => at(db, name).of(id).add(added))),
    tried(() => write((db) => at(db, name).of(id).change(row, changed))),
    tried(() => write((db) => at(db, name).of(id).remove(row))),
  ])
}

test('[50-12.2] an id made to leave the folder names no tenant for a caller: no row is answered, the write is refused as for an id of nobody, and no file is touched', (t) => {
  const opened: FileName[] = []
  const marked: FileName[] = []
  const folder = folderOf(t)
  const files = filesOf(t, board, { opened: (file) => opened.push(file), writing: (file) => marked.push(file) }, folder)
  const s = seedBoard(files)
  planted(folder)
  for (const file of files.open()) files.close(file)
  const before = standing(folder)
  opened.length = 0
  marked.length = 0
  // An id in the form of an id that names no row of `teams`: the last letter of a true one, changed.
  const nobody = `${s.north.slice(0, 25)}${s.north.endsWith('0') ? '1' : '0'}`
  const sql = rawOf(files)

  for (const id of leaving(s.north)) {
    // A member of another team, a caller in no team who may write `tasks` of every team, and the system.
    for (const who of [s.bob, s.cy, undefined]) {
      const answers = answersFor(files, who, id, s.secret)
      assert.deepEqual(answers, answersFor(files, who, nobody, s.secret), `${JSON.stringify(id)} as ${who}`)
      // No row is answered, and each write is refused.
      for (const answer of answers)
        assert.ok(
          answer === undefined ||
            answer === 0 ||
            (Array.isArray(answer) && answer.length === 0) ||
            ['T3101', 'T2103', 'T2104'].includes(String(answer)),
          `${JSON.stringify(id)} as ${who}: ${JSON.stringify(answer)}`,
        )
    }
    // Raw SQL, which is full access, takes the same ids and no other.
    assert.equal(
      codeOf(() => sql('select count(*) c from orders', [], { of: id })),
      'T2104',
      id,
    )
    assert.equal(
      codeOf(() => rawWrite(files, (run) => run("update orders set note = 'in'", [], { of: id }))),
      'T2104',
      id,
    )
    assert.equal(
      codeOf(() => rawWrite(files, (run) => run('delete from orders', [], { of: id }))),
      'T2104',
      id,
    )
  }

  assert.deepEqual(files.open(), [])
  assert.deepEqual(opened, [])
  assert.deepEqual(marked, [])
  assert.deepEqual(standing(folder), before)
  assert.equal(existsSync(join(folder, '..', 'x.db')), false)
  assert.equal(at(readingFiles(files, board), 'orders').of(s.north).count(), 3)
  assert.equal(at(readingFiles(files, board), 'orders').of(s.south).count(), 1)
})

/** Two sets of files of the board: the second is handed each change of the first, while the link is on. */
function twoSets(t: TestContext) {
  const folder = folderOf(t)
  const second = filesOf(t, board, {}, folder)
  const changes: Change[] = []
  const link = { on: true }
  const first: Files = connected(filesOf(t, board), layoutOf(board), {
    keep: true,
    copy: (change) => {
      changes.push(change)
      if (link.on) applyChange(second, change)
    },
  })
  return { first, second, folder, changes, link }
}

test('[50-12.2] an id made to leave the folder touches no file through the files themselves, a sweep, a tenant put back, and a change that is applied', async (t) => {
  const { first, second, folder, changes, link } = twoSets(t)
  const s = seedBoard(first)
  const kept = join(folder, 'kept')
  await backup(second, kept, { whole: true })
  const [name] = readdirSync(kept)
  // Two changes of the first set that the second does not hold yet: one of the shared file, and the first write of
  // a tenant, which makes its file.
  link.on = false
  writingFiles(first, board)((db) => at(db, 'users').add({ name: 'Di' }))
  const ofShared = changes.at(-1)
  writingFiles(first, board)((db) => at(db, 'tasks').of(s.east).add({ title: 'the first of east' }))
  const ofEast = changes.at(-1)
  assert.ok(ofShared && ofEast && ofShared.file === undefined)
  assert.deepEqual(ofEast.file, teamFile(s.east))

  planted(folder)
  for (const file of second.open()) second.close(file)
  const before = standing(folder)
  const names: FileName[] = [
    ...leaving(s.north).map((id) => ({ table: 'teams', id })),
    // A table that is none, or that is made to leave the folder, with the id of a true tenant.
    ...['../teams', 'teams/..', '..', '.', '', 'users', 'orders', 'TEAMS', 'teams '].map((made) => ({
      table: made,
      id: s.north,
    })),
    { table: 'users', id: s.ada },
  ]
  for (const file of names) {
    const what = JSON.stringify(file)
    assert.equal(second.of(file), undefined, what)
    assert.equal(second.of(file, { make: true }), undefined, what)
    assert.equal(second.has(file), false, what)
    assert.equal(
      codeOf(() => second.path(file)),
      'T2104',
      what,
    )
    second.remove(file)
    second.close(file)
    assert.deepEqual(sweep(second, file, board, { wrote() {} }), { removed: 0, cleared: 0, touched: [] }, what)
    // One tenant put back: the backup is a true one, and the tenant is none.
    await assert.rejects(
      restore(second, join(kept, name), { of: file }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'T2104',
      what,
    )
    // The change of a tenant's file, under the name of a file that is none.
    applyChange(second, { ...ofEast, file }, { only: 'file' })
  }
  // The same change whole, which also keeps it, and a change of the shared file that says those tenants are gone.
  applyChange(second, { ...ofEast, file: names[0] })
  applyChange(second, { ...ofShared, gone: names })

  assert.deepEqual(second.open(), [])
  assert.deepEqual(standing(folder), before)
  assert.equal(existsSync(join(folder, '..', 'x.db')), false)
  // The files of the true tenants stand, and hold what they held.
  assert.equal(second.has(teamFile(s.north)), true)
  assert.equal(second.has(teamFile(s.east)), false)
  assert.equal(at(readingFiles(second, board), 'orders').of(s.north).count(), 3)
  assert.equal(at(readingFiles(second, board), 'users').count(), 4)
})

test('[50-12.10] the first change of one tenant file, handed to applyChange under the file of another tenant, is T0009 where it would make the file and is refused before where a file stands, by its steps (T0013) or by its running fingerprint (T0033), and nothing is applied: neither the file nor the kept change', (t) => {
  const { first, second, folder, changes, link } = twoSets(t)
  const s = seedBoard(first)
  // West is a tenant of both sets, and has a file in neither.
  const west = teamFile(String(writingFiles(first, board)((db) => at(db, 'teams').add({ name: 'West' })).id))
  link.on = false
  writingFiles(first, board)((db) => at(db, 'tasks').of(s.east).add({ title: 'the first of east' }))
  const ofEast = changes.at(-1)
  assert.ok(ofEast)
  assert.deepEqual(ofEast.file, teamFile(s.east))
  writingFiles(first, board)((db) => at(db, 'tasks').of(s.east).add({ title: 'the second of east' }))
  const nextOfEast = changes.at(-1)
  writingFiles(first, board)((db) => at(db, 'users').add({ name: 'Di' }))
  const ofShared = changes.at(-1)
  const kept = () => storedIn(second.shared, '_t_changes').length
  const tasksOf = (file: FileName) => storedIn(second.of(file), 'tasks').map((row) => row.title)
  const northHeld = tasksOf(teamFile(s.north))
  for (const file of second.open()) second.close(file)
  const before = { standing: standing(folder), kept: kept() }

  // Under the name of a tenant with no file the change fits, by its running fingerprint: the file that it makes
  // names East as its own, and is the file of West by its place alone.
  for (const only of [undefined, 'file'] as const)
    assert.equal(
      codeOf(() => applyChange(second, { ...ofEast, file: west }, only ? { only } : {})),
      'T0009',
      String(only),
    )
  assert.equal(second.has(west), false)
  assert.deepEqual(second.open(), [])
  assert.deepEqual(standing(folder), before.standing)
  assert.equal(kept(), before.kept)
  assert.deepEqual(at(readingFiles(second, board), 'tasks').of(west.id).all(), [])
  // Under the name of a tenant whose file stands it is refused before, as any change that does not fit its file.
  // By its steps, where they make a table that is there:
  assert.equal(
    codeOf(() => applyChange(second, { ...ofEast, file: teamFile(s.south) })),
    'T0013',
  )
  // and by its running fingerprint, where it holds no step: the next change of East, and one of the shared file.
  assert.ok(nextOfEast && nextOfEast.layout === undefined && ofShared && ofShared.layout === undefined)
  for (const change of [nextOfEast, ofShared])
    for (const file of [teamFile(s.south), teamFile(s.north)])
      assert.equal(
        codeOf(() => applyChange(second, { ...change, file })),
        'T0033',
      )
  // A later change under the name of a tenant with no file does not fit either, and leaves no file.
  assert.equal(
    codeOf(() => applyChange(second, { ...nextOfEast, file: west })),
    'T0033',
  )
  assert.equal(second.has(west), false)
  assert.deepEqual(tasksOf(teamFile(s.south)), [])
  assert.deepEqual(tasksOf(teamFile(s.north)), northHeld)
  assert.equal(kept(), before.kept)

  // Handed the store of the file of West itself, as a thread of a file is: the write is undone.
  const store = second.of(west, { make: true })
  assert.ok(store)
  assert.equal(
    codeOf(() => applyChange(store, { ...ofEast, file: west }, { only: 'file' })),
    'T0009',
  )
  assert.deepEqual(storedIn(store, 'tasks'), [])
  assert.equal(metaOf(store, 'tenant'), undefined)

  // Under its own name it is applied, and kept.
  applyChange(second, ofEast)
  assert.deepEqual(tasksOf(teamFile(s.east)), ['the first of east'])
  assert.equal(metaOf(Object(second.of(teamFile(s.east))), 'tenant'), s.east)
  assert.equal(kept(), before.kept + 1)
})

/** What the file of one tenant holds of the tables of the app, of the earlier versions of its rows, and of itself. */
const heldBy = (files: Files, tenant: string): Record<string, unknown> =>
  Object.fromEntries(
    ['orders', 'lines', 'tasks', 'drops', '_t_history', '_t_meta'].map((name) => [
      name,
      storedIn(files.of(teamFile(tenant)), name),
    ]),
  )

test('[50-12.3] a change that is handed two tenants and writes to both is T2109, and neither file is written', (t) => {
  const files = filesOf(t, board)
  const s = seedBoard(files)
  const sql = rawOf(files)
  const before = { north: heldBy(files, s.north), south: heldBy(files, s.south) }
  const teams = () => at(readingFiles(files, board), 'teams').all()
  const shared = teams()
  const unwritten = (what: string) => {
    assert.deepEqual(heldBy(files, s.north), before.north, `${what}: the file of the first tenant`)
    assert.deepEqual(heldBy(files, s.south), before.south, `${what}: the file of the second tenant`)
    assert.deepEqual(teams(), shared, `${what}: the shared file`)
  }
  const task = (db: object, tenant: string) => at(db, 'tasks').of(tenant).add({ title: 'in both' })

  // A caller who may write the tasks of both teams, and the system: in either order.
  for (const who of [person(s.bob), person(s.cy), system]) {
    const write = writingFiles(files, board, who)
    for (const [one, other] of [
      [s.north, s.south],
      [s.south, s.north],
    ]) {
      assert.equal(
        codeOf(() =>
          write((db) => {
            task(db, one)
            task(db, other)
          }),
        ),
        'T2109',
      )
      unwritten('two adds')
      // The code of the change holds on to the error and goes on: the write is undone all the same.
      let caught: string | undefined
      assert.equal(
        codeOf(() =>
          write((db) => {
            task(db, one)
            caught = codeOf(() => task(db, other))
            task(db, one)
            return 'answered'
          }),
        ),
        'T2109',
      )
      assert.equal(caught, 'T2109')
      unwritten('an error that the change caught')
      // The writes as they are stored, a change and a removal for the second file, and a row that is changed in both.
      assert.equal(
        codeOf(() =>
          write((db) =>
            db.write([
              { add: 'tasks', of: one, values: { title: 'in both' } },
              { add: 'tasks', of: other, values: { title: 'in both' } },
            ]),
          ),
        ),
        'T2109',
      )
      unwritten('stored writes')
    }
    assert.equal(
      codeOf(() =>
        write((db) => {
          at(db, 'tasks').of(s.north).change(s.first, { title: 'changed' })
          task(db, s.south)
        }),
      ),
      'T2109',
    )
    assert.equal(
      codeOf(() =>
        write((db) => {
          task(db, s.south)
          at(db, 'tasks').of(s.north).remove(s.first)
        }),
      ),
      'T2109',
    )
    unwritten('a change and a removal')
  }

  // With full access: a tenant's file and the shared file in either order, and raw SQL for the second file.
  const asSystem = writingFiles(files, board)
  assert.equal(
    codeOf(() =>
      asSystem((db) => {
        task(db, s.north)
        at(db, 'teams').change(s.south, { name: 'in both' })
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      asSystem((db) => {
        at(db, 'teams').change(s.south, { name: 'in both' })
        task(db, s.north)
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      rawWrite(files, (run, db) => {
        task(db, s.north)
        run("update orders set note = 'in both'", [], { of: s.south })
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      rawWrite(files, (run) => {
        run("update orders set note = 'in both'", [], { of: s.south })
        run("update orders set note = 'in both'", [], { of: s.north })
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      rawWrite(files, (run, db) => {
        task(db, s.north)
        run("update teams set name = 'in both'")
      }),
    ),
    'T2109',
  )
  unwritten('the shared file and raw SQL')

  // A tenant that has no file yet, written first: no row of it is kept, and the second file is not written.
  assert.equal(files.has(teamFile(s.east)), false)
  assert.equal(
    codeOf(() =>
      asSystem((db) => {
        task(db, s.east)
        task(db, s.north)
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      asSystem((db) => {
        task(db, s.north)
        task(db, s.east)
      }),
    ),
    'T2109',
  )
  unwritten('a tenant with no file')
  assert.deepEqual(storedIn(files.of(teamFile(s.east)), 'tasks'), [])
  assert.deepEqual(sql('select count(*) c from tasks', [], { of: s.east }), [{ c: 0 }])
  // One file at a time is written as ever.
  assert.equal(writingFiles(files, board, person(s.bob))((db) => task(db, s.north)).team, s.north)
  assert.equal(writingFiles(files, board, person(s.bob))((db) => task(db, s.south)).team, s.south)
})

test('[50-12.4] the tenant column of a row is written anew by no change: T2109; and a row whose column raw SQL wrote anew stays in the file it was written in', (t) => {
  const files = filesOf(t, board)
  const s = seedBoard(files)
  const sql = rawOf(files)
  const teamOf = (name: string, id: string) => sql(`select team from ${name} where id = ?`, [id], { of: s.north })
  // Raw SQL of a tenant makes the tables that its file lacks, so the rows are what is held here.
  const rowsOf = (tenant: string) => ({ ...heldBy(files, tenant), _t_meta: undefined })
  const before = { south: rowsOf(s.south) }

  // Through a change: a member of the team, a caller who may write the tasks of both teams, and the system.
  const attempts: [ReturnType<typeof person> | typeof system, string, string, Record<string, unknown>][] = [
    [person(s.ada), 'orders', s.secret, { note: 'moved' }],
    [person(s.bob), 'tasks', s.first, { title: 'moved' }],
    [person(s.cy), 'tasks', s.first, { title: 'moved' }],
    [system, 'orders', s.secret, { note: 'moved' }],
    [system, 'tasks', s.first, { title: 'moved' }],
    [system, 'lines', s.openLine, { qty: 99 }],
  ]
  for (const [who, name, id, more] of attempts) {
    const write = writingFiles(files, board, who)
    for (const to of [s.south, s.east, `${s.north.slice(0, 25)}${s.north.endsWith('0') ? '1' : '0'}`, '../x']) {
      assert.equal(
        codeOf(() => write((db) => at(db, name).of(s.north).change(id, { team: to }))),
        'T2109',
        `${name} to ${to}`,
      )
      assert.equal(
        codeOf(() => write((db) => db.write([{ change: name, of: s.north, id, values: { team: to } }]))),
        'T2109',
        `${name} to ${to}, as it is stored`,
      )
      // The other columns of the same write are not written either.
      assert.equal(
        codeOf(() =>
          write((db) =>
            at(db, name)
              .of(s.north)
              .change(id, { ...more, team: to }),
          ),
        ),
        'T2109',
        `${name} to ${to}, with another column`,
      )
    }
    // A row is not added under another tenant than `of` names either.
    if (name === 'tasks')
      assert.equal(
        codeOf(() => write((db) => at(db, 'tasks').of(s.north).add({ title: 'moved', team: s.south }))),
        'T2109',
      )
    // The column is not cleared, and takes the tenant it holds.
    assert.notEqual(
      codeOf(() => write((db) => at(db, name).of(s.north).change(id, { team: null }))),
      undefined,
    )
    assert.equal(write((db) => at(db, name).of(s.north).change(id, { team: s.north })).team, s.north)
    assert.deepEqual(teamOf(name, id), [{ team: s.north }])
  }
  // Nothing moved: the second file holds what it held, and the first but the moment of each row that was changed.
  assert.deepEqual(rowsOf(s.south), before.south)
  assert.equal(files.has(teamFile(s.east)), false)
  assert.equal(at(readingFiles(files, board), 'tasks').of(s.north).count(), 4)

  // Through raw SQL, inside a change: it is the full access of the builder, and the row stays where it was written.
  const onDisk = [...files.walk()]
  rawWrite(files, (run) => run('update tasks set team = ? where id = ?', [s.south, s.first], { of: s.north }))
  assert.deepEqual(teamOf('tasks', s.first), [{ team: s.south }])
  assert.deepEqual(sql('select count(*) c from tasks where id = ?', [s.first], { of: s.south }), [{ c: 0 }])
  assert.deepEqual([...files.walk()], onDisk)
  assert.deepEqual(rowsOf(s.south), before.south)
  const full = readingFiles(files, board)
  assert.equal(at(full, 'tasks').of(s.south).get(s.first), undefined)
  assert.equal(at(full, 'tasks').of(s.north).get(s.first)?.title, 'one')
  // A later write of the row finds it in the file it was written in, and in no other.
  const asSystem = writingFiles(files, board)
  assert.equal(
    codeOf(() => asSystem((db) => at(db, 'tasks').of(s.south).change(s.first, { title: 'found' }))),
    'T2103',
  )
  assert.equal(asSystem((db) => at(db, 'tasks').of(s.north).change(s.first, { title: 'found' })).title, 'found')
  assert.deepEqual(sql('select title from tasks where id = ?', [s.first], { of: s.north }), [{ title: 'found' }])
  assert.deepEqual(rowsOf(s.south), before.south)
})
