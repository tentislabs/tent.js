// A program of the tests for a clean machine with no Python, which reaches the sites the parts and the packages come
// from, as a person's first app does: node clean.ts <project> <what>, in the runner's folder of TENT_HOME.
//   first   locks and builds the project, opens it, and says the time and the bytes of its first call of a `python`,
//           and what a crash of Python and the call after it answered;
//   apps    opens five copies of the project, which share their lock, calls each once, and says the disk they use.
import { cpSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import type { Caller } from '../../../core/index.ts'
import type { App, Engine } from '../../../engine/index.ts'
import { createEngine } from '../../../engine/index.ts'
import { tent } from '../../shell.ts'

const [project = '', what = ''] = process.argv.slice(2)
const say = (value: object): void => void process.stdout.write(`${JSON.stringify(value)}\n`)

/** The bytes under a folder, every file once. */
function bytesUnder(folder: string): number {
  let total = 0
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) total += bytesUnder(path)
    else if (entry.isFile()) total += statSync(path).size
  }
  return total
}

/** Opens a built project on a data folder of its own, and answers the app with a user of it. */
async function openedApp(engine: Engine, folder: string, data: string): Promise<{ app: App; as: Caller }> {
  const built = await buildProject(folder, { for: 'dev' })
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'development' })
  const rows: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const id = String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id'))
  return { app, as: { kind: 'user', user: { id, roles: [] } } }
}

if ((await tent(['python', 'lock'], { folder: project, out: () => {} })) !== 0) throw new Error('no lock was made')
const engine = createEngine({ port: 0 })
const home = process.env.TENT_HOME ?? ''
if (what === 'first') {
  const { app, as } = await openedApp(engine, project, join(project, '.tent'))
  const began = performance.now()
  const answer = await app.call('mean', { values: 10 }, { as })
  const ms = performance.now() - began
  const crash = await app.call('crash', {}, { as }).catch((error: unknown) => Reflect.get(Object(error), 'code'))
  const after = await app.call('mean', { values: 4 }, { as })
  say({ ms, bytes: bytesUnder(join(home, 'fetched')), answer, crash, after })
} else if (what === 'apps') {
  for (let n = 0; n < 5; n++) {
    const copy = `${project}-${n}`
    cpSync(project, copy, { recursive: true })
    const { app, as } = await openedApp(engine, copy, join(copy, '.tent'))
    await app.call('mean', { values: 10 }, { as })
  }
  say({ disk: bytesUnder(join(home, 'fetched')) })
}
await engine.close()
