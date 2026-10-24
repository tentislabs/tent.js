import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const

// A table of notes in the shared file, which a later version makes a tenant table, with the team of each note as its tenant.
const notes = `
export const notes = table('notes', {
  columns: { team: link('teams', { onRemove: 'remove' }), body: text() },
  // where the notes live
  access: { read: open, add: open },
})
`

test('[50-10] tent publish --move moves the rows of a table that gains tenant into the files of its tenants, and without it the publish is refused for those rows', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { project: 'desk' })
  const here = computer(t, folder, 'here', join(import.meta.dirname, 'desk'))
  const tables = join(here.project, 'tables', 'tables.ts')
  writeFileSync(tables, `${readFileSync(tables, 'utf8')}${notes}`)
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const teams: string[] = []
  for (const name of ['one', 'two']) teams.push(String(Object(await server.app.call('addTeam', { name }, system)).id))
  await server.app.write(
    Array.from({ length: 4 }, (_, i) => ({ add: 'notes', values: { team: teams[i % 2], body: `note ${i}` } })),
    system,
  )

  here.edit('tables/tables.ts', '  // where the notes live\n', "  tenant: 'team',\n")
  await here.save()
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'rows'])

  const tried = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    move: true,
    try: true,
  })
  assert.equal(tried.refused, undefined, 'with move the try is not refused')
  const moved = await publish({ project: here.project, history: here.history, to, fetch: fetched, move: true })
  assert.equal(server.app.versions().find((one) => one.running)?.id, moved.version)
  for (const [k, team] of teams.entries()) {
    const rows = await server.app.read({ from: 'notes', of: team }, system)
    assert.deepEqual((Array.isArray(rows) ? rows : []).map((row) => Object(row).body).sort(), [
      `note ${k}`,
      `note ${k + 2}`,
    ])
  }
})
