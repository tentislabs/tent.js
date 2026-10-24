// A program that opens an app whose tenant's data file holds a run that waits, closes the app and its engine, and
// ends on its own: a closed app holds no timer and no file open. It prints `closed` once the engine is closed.
// Run: node tenantWaits.ts <project folder> <work folder>
import { writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { createEngine } from '../../index.ts'

const [project, work] = process.argv.slice(2)
const system = { kind: 'system' as const }
const built = await buildProject(project, { for: 'release', out: join(work, 'bundle') })
// The model of the project is answered by one of the program's own, which nothing here calls.
const mine = {
  async *reply() {
    yield { end: { text: '', calls: [] } }
  },
}
const engine = createEngine({ port: 0, makers: { providers: () => ({ mine }) } })
const app = await engine.open(built.bundleFolder, { dataFolder: join(work, 'data'), mode: 'test' })
const team = String(Object(await app.call('addTeam', { name: 'North' }, { as: system })).id)
await app.call('addOrder', { team, title: 'first' }, { as: system })
for (let tries = 0; tries < 500; tries++) {
  const [one] = app.runs.find({ flow: 'onOrder', of: { table: 'teams', id: team } })
  if (one?.state === 'waiting') break
  await new Promise((done) => setTimeout(done, 10))
}
await app.close()
await engine.close()
writeSync(1, 'closed\n')
