import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { apartRoom, createEngine, writeKey } from '../../engine/index.ts'
import { openHistory } from '../../history/index.ts'
import { serveSync } from '../../publish/index.ts'
import type { Held } from './held.ts'
import { closing, folderOf, held, templates } from './held.ts'
import { testSandbox } from './sandbox.ts'

/** The id of a user of the product, with the roles it is given. */
async function userOf(at: Held, email: string, roles: string[]): Promise<string> {
  const [row] = Object(await at.app.write([{ add: 'users', values: { email, roles } }], { as: 'system' }))
  return String(Object(row).id)
}

// A query that the workspace adds, open to every signed-in person: the impact of its publish holds wider rights.
const opened = `import { query } from 'tentjs'
import { users } from '../tables/users'

export const everyone = query('everyone', { about: 'Every user', access: 'signedIn', rows: users.oldest('email').limit(10) })
`

test('[44-2] a workspace whose change widens rights is published to a far server, and its answer holds its impact', async (t) => {
  const folder = folderOf(t)
  const served = await buildProject(templates.coded, { for: 'release', out: join(folder, 'served-bundle') })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const data = join(folder, 'served-data')
  const there = await engine.open(served.bundleFolder, { dataFolder: data, mode: 'live' })
  const history = openHistory(data)
  closing(t, () => history.close())
  serveSync(engine, there, history)
  const address = `http://127.0.0.1:${JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port}`
  const target = { address, key: writeKey(there, { name: 'deploy', rights: ['publish'] }).key }
  const at = await held(t, { sandbox: testSandbox(t), room: apartRoom, live: () => target })
  const owner = await userOf(at, 'ada@example.com', [])
  const made = await at.workspaces.create({ owner, from: 'coded' })
  await at.workspaces.run(made.id)
  await at.workspaces.publish(made.id)
  writeFileSync(join(made.folder, 'project', 'functions', 'everyone.ts'), opened)
  // A person who publishes their workspace from the product publishes what it widens, with the word the product
  // asked them for.
  const published = await at.workspaces.publish(made.id, { acceptImpact: true })
  assert.equal(there.versions().find((one) => one.running)?.id, published.version)
  assert.ok(
    published.impact?.rights.some((one) => one.name === 'everyone'),
    JSON.stringify(published.impact),
  )
})
