import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { appIn, command } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// A change of the admins alone, which writes as the system, and an action of the staff that imports through it.
const more = `
export const makeAdmin = change('makeAdmin', {
  access: role('admin'),
  system: 'a test writes roles',
  input: { name: text() },
  set: members.add({ name: input('name'), born: '2000-01-01', height: 1, joined: new Date(0), team: 'red' }),
})

export const importAdmins = action('importAdmins', {
  access: role('staff'),
  input: { members: file() },
  output: object({ records: number(), imported: number(), refused: number(), refusedFile: text({ optional: true }) }),
  run: async ({ input: given }) => importFile(given.members, { with: makeAdmin }),
})
`

/** The club with the change of the admins, a member of the staff, and a person who is neither. */
async function club(t: TestContext): Promise<{ app: TestApp; dataFolder: string; folder: string; staff: string }> {
  const folder = copyOf(t, 'imported')
  appendFileSync(join(folder, 'functions', 'functions.ts'), more)
  const { app, dataFolder } = await appIn(t, folder)
  const staff = String((await app.user({ name: 'Ada', roles: ['staff'] })).user?.id)
  return { app, dataFolder, folder, staff }
}

const namesIn = async (app: TestApp): Promise<string[]> => {
  const read: unknown = await app.read({ from: 'members' }, system)
  return (Array.isArray(read) ? read : []).map((row) => String(Reflect.get(Object(row), 'name')))
}

test('[45-19.9] an import that names a change with `system` its caller may not call writes nothing, from the command line and from code', async (t) => {
  const { app, dataFolder, folder, staff } = await club(t)
  const file = join(folder, 'admins.csv')
  writeFileSync(file, 'name\nMallory\nTrudy\n')
  const said: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'import', file, with: 'makeAdmin', as: staff }),
  )
  assert.deepEqual([said.imported, said.refused], [0, 2])
  const browser = app.browser({ as: staff })
  const uploaded = Object(await browser.upload('name\nMallory\n', { name: 'admins.csv', kind: 'text/csv' })).value?.id
  const answer = Object(await browser.call('importAdmins', { members: String(uploaded) }))
  assert.equal(Object(answer.value).imported ?? 0, 0, JSON.stringify(answer))
  assert.deepEqual(await namesIn(app), [], 'nothing was written past the rule of the change')
})

test('[45-19.9] an import from code reads only a file its caller may download', async (t) => {
  const { app, staff } = await club(t)
  const other = String((await app.user({ name: 'Bea', roles: ['staff'] })).user?.id)
  const csv = 'Full name,born,height,joined,team\nAnn,1990-02-03,170.5,2020-01-01T10:00:00Z,red\n'
  const theirs = Object(await app.browser({ as: other }).upload(csv, { name: 'members.csv', kind: 'text/csv' })).value
    ?.id
  const answer = Object(await app.browser({ as: staff }).call('importMembers', { members: String(theirs) }))
  assert.notEqual(answer.ok, true, 'a loose file of another person is not read')
  assert.deepEqual(await namesIn(app), [])
})
