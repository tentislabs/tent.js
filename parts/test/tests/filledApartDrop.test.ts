import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, listed, readFile } from './desks.ts'
import { listened } from './probe.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const
const moment = (ms = 5): Promise<void> => new Promise((done) => setTimeout(done, ms))

// The docs of each team stand in the data file of that team, with a vector that a model makes from the body.
const tables = (
  model: 'embedderA' | 'embedderB',
  old: string,
) => `import { link, model, table, text, vector } from 'tentjs'
export const embedderA = model('embedderA', { provider: 'mine', name: 'a-1', abilities: ['embed'] })
export const embedderB = model('embedderB', { provider: 'mine', name: 'b-1', abilities: ['embed'] })
export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn', add: 'signedIn' } })
export const docs = table('docs', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    body: text(),
    vec: vector({ size: 3, model: ${model}, optional: true, by: 'body'${old} }),
  },
  tenant: 'team',
  access: { read: 'signedIn', add: 'signedIn' },
})
`

/** Moves the clock a second at a time until what is asked holds. */
async function until(app: TestApp, what: string, holds: () => boolean | Promise<boolean>, seconds = 600) {
  for (let i = 0; i < seconds; i++) {
    if (await holds()) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail(`never: ${what}`)
}

test('[51-14] in a tenant table, a file that was closed at a change of the model of a vector column with old drop is filled anew by the new model once it is brought up', async (t) => {
  // The provider of the project waits until the test has heard each `embed`.
  listened(t, 'tentjs.test.vectors', () => undefined)
  const folder = copyOf(t, 'vectors')
  writeFileSync(join(folder, 'tables.ts'), tables('embedderA', ''))
  const { app, dataFolder } = await appIn(t, folder)
  const made = await app.write([{ add: 'teams', values: { name: 'North' } }], system)
  const team = String(Reflect.get(Object(Array.isArray(made) ? made[0] : made), 'id'))
  await app.write(
    [0, 1, 2].map((n) => ({ add: 'docs', of: team, values: { team, body: `doc ${n}` } })),
    system,
  )
  // The vectors as the file of the team holds them, read beside the engine: a vector stands in a table of its own.
  const vectors = async (): Promise<string[]> =>
    readFile(
      fileOf(dataFolder, team),
      'SELECT v."v" AS "v" FROM "docs" t LEFT JOIN "docs__vec" v ON v."_n" = t."_n" ORDER BY t."_n"',
    ).map((row) =>
      row.v instanceof Uint8Array ? `[${[...new Float32Array(Uint8Array.from(row.v).buffer)].join(',')}]` : 'null',
    )
  await until(app, 'every vector is made by the first model', async () =>
    (await vectors()).every((one) => one === '[1,0,0]'),
  )
  // The file of the team closes once nothing touched it for a while: nothing is read meanwhile.
  for (let i = 0; i < 90; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  const team1 = (await listed(app, dataFolder)).files.find((one) => one.id === team)
  assert.equal(team1?.open, false, 'the file of the team is closed')
  writeFileSync(join(folder, 'tables.ts'), tables('embedderB', ", old: 'drop'"))
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'bundle-2') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  await app.switch(await app.add(built.bundleFolder))
  // The pass of the switch brings the file up, which empties the column; the pass of the filled columns then
  // opens it, and its values are made by the second model, with nothing of the first left between.
  await until(app, 'the file of the team is brought up', async () =>
    (await listed(app, dataFolder)).files.some((one) => one.id === team && !one.behind),
  )
  await until(app, 'every vector is made anew by the second model', async () => {
    const now = await vectors()
    assert.ok(!now.includes('[1,0,0]'), `a vector of the old model stands after the bringing up: ${now.join(' ')}`)
    return now.every((one) => one === '[0,1,0]')
  })
  assert.deepEqual(
    (await app.filled()).map((one) => [one.table, one.column, one.missing, one.old]),
    [['docs', 'vec', 0, 0]],
  )
})
