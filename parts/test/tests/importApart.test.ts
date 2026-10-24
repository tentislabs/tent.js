import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import { dataPlace, openOn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** Writes a file into a copy of a project with one text of it put in the place of another. */
function edited(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(file, text.replace(from, to))
}

test('[45-9] an import into a tenant table that is killed while it runs goes on, and writes every record once', async (t) => {
  const project = copyOf(t, 'imported')
  edited(
    join(project, 'tent.ts'),
    'backups: { every: false },',
    'backups: { every: false },\n  limits: { workPage: 10000 },',
  )
  // The visits live in the data file of their club, and the whole file is one page: a kill falls inside it.
  edited(
    join(project, 'tables', 'tables.ts'),
    `export const visits = table('visits', {
  columns: { name: text(), height: number() },`,
    `export const clubs = table('clubs', {
  columns: { name: text() },
  access: { read: 'signedIn', add: role('staff') },
})

export const visits = table('visits', {
  columns: { club: link('clubs', { onRemove: 'remove' }), name: text(), height: number() },
  tenant: 'club',`,
  )
  edited(
    join(project, 'functions', 'functions.ts'),
    `  input: { name: text(), height: number() },
  set: visits.add({ name: input('name'), height: input('height') }),`,
    `  input: { club: text(), name: text(), height: number() },
  set: visits.of(input('club')).add({ name: input('name'), height: input('height') }),`,
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  const dataFolder = dataPlace(t)
  const first = await openOn(t, built.bundleFolder, dataFolder)
  const written: unknown = await first.app.write([{ add: 'clubs', values: { name: 'Rowing' } }], system)
  const club = String(Reflect.get(Object(Array.isArray(written) ? written[0] : undefined), 'id'))
  await first.engine.close()
  const file = join(project, 'visits.jsonl')
  writeFileSync(
    file,
    Array.from({ length: 1500 }, (_, at) =>
      JSON.stringify({ club, 'Full name': `Visitor ${String(at).padStart(4, '0')}`, height: 150 + (at % 40) }),
    ).join('\n'),
  )
  const killed = await runKilled(join(import.meta.dirname, 'killed', 'importApart.ts'), {
    times: 1,
    within: 12000,
    seed: 3,
    args: [built.bundleFolder, dataFolder, file, club],
  })
  assert.equal(killed.kills, 1)
  const last = killed.ended.at(-1)
  assert.equal(last?.code, 0, String(last?.out))
  const told = JSON.parse(/^told: (.*)$/m.exec(last?.out ?? '')?.[1] ?? '{}')
  assert.deepEqual(told, { rows: 1500, names: 1500 }, 'every record was imported once')
})
