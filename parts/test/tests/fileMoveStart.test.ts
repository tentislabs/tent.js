import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[50-7] an app that opens with move on a bundle in which a table gains tenant opens on the version its data ran, and moves the rows into the files of their tenants; without move the opening is refused', async (t) => {
  const folder = copyOf(t, 'moving')
  const bundle = async (name: string): Promise<string> => {
    const built = await buildProject(folder, { for: 'release', out: join(folder, '..', name) })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error').map((one) => one.message),
      [],
    )
    return built.bundleFolder
  }
  const dataFolder = join(folder, '..', 'data')
  const shared = await bundle('bundle-shared')
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const app = await engine.open(shared, { dataFolder, mode: 'test' })
  const teams: string[] = []
  for (let i = 0; i < 2; i++) teams.push(String(Object(await app.call('addTeam', { name: `team ${i}` }, system)).id))
  await app.write(
    Array.from({ length: 6 }, (_, i) => ({ add: 'notes', values: { team: teams[i % 2], body: `note ${i}` } })),
    system,
  )
  await app.close()

  const tables = join(folder, 'tables.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('  // where the notes live\n', "  tenant: 'team',\n"))
  const kept = await bundle('bundle-tenant')
  const refused = await engine.open(kept, { dataFolder, mode: 'test' }).then(
    () => undefined,
    (error: { code?: string }) => error,
  )
  assert.equal(refused?.code, 'T2001')

  const moved = await engine.open(kept, { dataFolder, mode: 'test', move: true })
  const running = moved.versions().find((one) => one.running)
  assert.equal(
    moved.description.tables.notes?.tenant,
    'team',
    'the app runs the version in which the notes are a tenant table',
  )
  assert.ok(running)
  for (const [k, team] of teams.entries()) {
    const rows = await moved.read({ from: 'notes', of: team }, system)
    assert.deepEqual((Array.isArray(rows) ? rows : []).map((row) => Object(row).body).sort(), [
      `note ${k}`,
      `note ${k + 2}`,
      `note ${k + 4}`,
    ])
  }
  await moved.close()
})
