import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { link, project, table, text } from '../../core/index.ts'
import { factsOf, layoutOf, planTableChanges } from '../index.ts'
import { appOf, filesOf, seedDesk, writingFiles } from './apart.ts'
import { at, described, reading, writing } from './shop.ts'
import { appTables, foundIn, started, switched } from './switch.ts'
import { codeOf, system } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const shop = project('shop', {})

/** Holds that what was found is the one finding of a table whose rows must be moved, which names `--move`. */
function movesAlone(findings: Finding[], name: string): void {
  assert.deepEqual(
    findings.map((one) => one.code),
    ['T2001'],
  )
  assert.match(findings[0].message, new RegExp(`\`${name}\``))
  assert.match(findings[0].message, /tenant/)
  assert.match(String(findings[0].fix), /--move/)
  assert.equal(findings[0].level, 'error')
}

test('[50-5] [16-2@3] a table that gains or loses tenant is found as the one finding that names --move, by planTableChanges and by factsOf over the files', async (t) => {
  const tenanted = appOf()
  const shared = appOf({ tasksShared: true })

  // The two layouts alone: the table goes on, so it is not gone, and the change is never applied by itself.
  const gains = planTableChanges(layoutOf(shared), layoutOf(tenanted))
  movesAlone(gains.findings, 'tasks')
  assert.deepEqual(gains.steps, [])
  const loses = planTableChanges(layoutOf(tenanted), layoutOf(shared))
  movesAlone(loses.findings, 'tasks')
  assert.deepEqual(loses.steps, [])
  assert.notEqual(gains.findings[0].message, loses.findings[0].message)
  // A tenant table as it was is no part of it.
  assert.deepEqual(planTableChanges(layoutOf(tenanted), layoutOf(appOf({ ref: true }))).findings, [])

  // It gains `tenant`: the rows stand in the shared file, which no longer holds the table in the new layout.
  const one = filesOf(t, shared)
  const s = seedDesk(one, shared)
  writingFiles(one, shared)((db) => at(db, 'tasks').add({ team: s.north, title: 'stands in the shared file' }))
  writingFiles(one, shared)((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  assert.deepEqual((await factsOf(one, shared)).tableFindings, [])
  movesAlone((await factsOf(one, tenanted)).tableFindings, 'tasks')

  // It loses `tenant`: the rows stand in the files of two tenants, and it is said once.
  const two = filesOf(t, tenanted)
  const d = seedDesk(two, tenanted)
  for (const team of [d.north, d.south])
    writingFiles(two, tenanted)((db) => at(db, 'tasks').of(team).add({ title: 'stands in a file' }))
  assert.deepEqual((await factsOf(two, tenanted)).tableFindings, [])
  movesAlone((await factsOf(two, shared)).tableFindings, 'tasks')
})

test('[20-4] a stated rename of a table that another table links to is planned: the link follows the rename within the same plan, and its rows go on', (t) => {
  const teams = table('teams', { columns: { name: text() }, access })
  const members = (to: string) =>
    table('members', { columns: { team: link(to, { onRemove: 'remove' }), name: text() }, access })
  const { store, description } = started(t, [shop, teams, members('teams')])
  const north = writing(
    store,
    description,
    system,
  )((db) => {
    const id = String(at(db, 'teams').add({ name: 'North' }).id)
    at(db, 'members').add({ team: id, name: 'Ada' })
    return id
  })

  const groups = table('groups', { columns: { name: text() }, was: ['teams'], access })
  const next = described([shop, groups, members('groups')])
  assert.deepEqual(factsOf(store, next).tableFindings, [])
  assert.deepEqual(switched(store, next), [{ do: 'renameTable', table: 'groups', from: 'teams' }])
  const linkOf = (name: string, column: string) => appTables(store).find((one) => one.name === name)?.columns[column]
  assert.deepEqual(linkOf('members', 'team'), { kind: 'link', table: 'groups', onRemove: 'remove' })
  const db = reading(store, next, system)
  assert.deepEqual(
    at(db, 'members')
      .with('team')
      .all()
      .map((row) => [row.name, Object(row.team).id, Object(row.team).name]),
    [['Ada', north, 'North']],
  )
  // The link is held as it was: a member of a group that is not there is refused.
  assert.equal(
    codeOf(() =>
      writing(store, next, system)((w) => at(w, 'members').add({ team: '00000000000000000000000000', name: 'Bob' })),
    ),
    'T2104',
  )

  // A link to another table, which no rename of the plan leads to, is never applied by itself.
  const squads = table('squads', { columns: { name: text() }, access })
  assert.deepEqual(foundIn(store, described([shop, groups, squads, members('squads')])), ['T2001'])
  // A table that is new under the name the link had before is no rename: `was` names no table that is asked for.
  const again = table('teams', { columns: { name: text() }, access })
  assert.deepEqual(foundIn(store, described([shop, groups, again, members('teams')])), ['T2001'])

  // The link is retired, and then held again while the table it names goes on under a third name, the table of
  // the link under a new one, and the column too: each row keeps its link.
  const bare = table('members', { columns: { name: text() }, removed: ['team'], access })
  switched(store, described([shop, groups, bare]))
  const circles = table('circles', { columns: { name: text() }, was: ['teams', 'groups'], access })
  const seats = table('seats', {
    columns: { circle: link('circles', { onRemove: 'remove', was: ['team'] }), name: text() },
    was: ['members'],
    access,
  })
  const last = described([shop, circles, seats])
  assert.deepEqual(factsOf(store, last).tableFindings, [])
  switched(store, last)
  assert.deepEqual(linkOf('seats', 'circle'), { kind: 'link', table: 'circles', onRemove: 'remove' })
  assert.deepEqual(
    at(reading(store, last, system), 'seats')
      .all()
      .map((row) => [row.name, row.circle]),
    [['Ada', north]],
  )
})
