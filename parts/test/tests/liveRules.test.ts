import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { until, writerOf } from './many.ts'
import { watcher } from './watched.ts'

const system = { as: 'system' } as const

// A query over the members, whose rule reads `teams`: a member is read where its team is open.
const listMembers = `
import { members } from '../tables/tables'

export const listMembers = query('listMembers', { access: open, rows: members.limit(100) })
`

test('[21-3] a group is marked by a write to a table that only the rule of its table reads: a page that watches the members is sent the member that a closed team hides, and the one that an opened team shows', async (t) => {
  const app = await writerOf(t, (folder) => appendFileSync(join(folder, 'functions', 'functions.ts'), listMembers))
  await app.write([{ add: 'teams', values: { name: 'North' } }], system)
  const team = String((await app.rows('teams'))[0].id)
  await app.write([{ add: 'members', values: { team } }], system)
  const page = watcher(app)
  const first = await page.watch('members', 'listMembers')
  assert.deepEqual([first.t, Object(first.value).length], ['result', 1])

  // The team is closed, which writes no member: the rule of `members` lets nobody read its member any more.
  await app.write([{ change: 'teams', id: team, values: { open: false } }], system)
  assert.deepEqual(await app.call('listMembers', {}, { as: { kind: 'nobody' } }), [])
  await until('the page is sent that the member is gone', () => page.got.length === 2)
  assert.deepEqual(
    [page.got[1].value ?? page.got[1].removed, page.got[1].t === 'rows' ? Object(page.got[1].put).length : 0],
    [page.got[1].t === 'rows' ? [Object(first.value)[0].id] : [], 0],
  )
  // The team is opened again: the page is sent the member.
  await app.write([{ change: 'teams', id: team, values: { open: true } }], system)
  await until('the page is sent the member again', () => page.got.length === 3)
  assert.ok(JSON.stringify(page.got[2]).includes(String(Object(first.value)[0].id)))
})
