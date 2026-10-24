import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { codeOf } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** Opens the test app of the shop with another seed: `testApp` applies it, and is refused with what it failed with. */
async function seededWith(t: TestContext, seed: string): Promise<TestApp> {
  if (!temps.has(t)) temps.set(t, tempOf(t))
  const project = copyOf(t, 'shop')
  writeFileSync(join(project, 'seed.ts'), `import { seed } from 'tentjs'\n${seed}\n`)
  const app = await testApp({ folder: project })
  closing(t, () => app.close())
  return app
}

const temps = new WeakMap<TestContext, string>()

const titles = async (app: TestApp): Promise<string[]> => (await app.rows('orders')).map((row) => String(row.title))

test('[11-2@4] in a seed db writes and answers at once, with full access: a seed that is code, with no await, links a row to a row that it just made, and one that is async and awaits each write makes the same rows', async (t) => {
  // A repeat with a number makes the seed code. Each write answers its row at once: the next one links to it.
  const atOnce = await seededWith(
    t,
    `const names = ['A lamp', 'A desk', 'A chair']
export default seed(({ db, now }) => {
  const ada = db.users.add({ name: 'Ada', roles: ['staff'] })
  for (let n = 0; n < names.length; n++) db.orders.add({ title: names[n] ?? '', owner: ada.id, paid: n === 2 })
  const held = db.orders.where({ paid: false }).all()
  db.orders.add({ title: \`\${held.length} open at \${now.getUTCFullYear() > 2000}\`, owner: ada.id })
})`,
  )
  assert.equal(atOnce.description.seed?.module !== undefined, true, 'the seed is code')
  assert.deepEqual(await titles(atOnce), ['A lamp', 'A desk', 'A chair', '2 open at true'])
  const [ada] = await atOnce.rows('users')
  assert.deepEqual(
    (await atOnce.rows('orders')).map((row) => row.owner),
    [ada.id, ada.id, ada.id, ada.id],
  )
  // Written as async, with an await before each write, it makes the same rows: a value that is no promise is awaited at once.
  const awaited = await seededWith(
    t,
    `const names = ['A lamp', 'A desk', 'A chair']
export default seed(async ({ db }) => {
  const ada = await db.users.add({ name: 'Ada', roles: ['staff'] })
  for (let n = 0; n < names.length; n++) await db.orders.add({ title: names[n] ?? '', owner: ada.id })
})`,
  )
  assert.deepEqual(await titles(awaited), ['A lamp', 'A desk', 'A chair'])
})

test('[11-2@4] a seed that fails says so: app.seed ends with the failure, at once where the seed fails at once and also where it fails after a wait, and never in silence', async (t) => {
  // A link to a row that is not there, in a seed that is code: the write is refused.
  const refused = seededWith(
    t,
    `const none = '0000000000000000000000000a'
export default seed(({ db }) => {
  for (let n = 0; n < 1; n++) db.orders.add({ title: 'An order of nobody', owner: none })
})`,
  )
  assert.equal(await codeOf(refused), 'T2104')
  // The same after a wait, in a seed that is async.
  const late = seededWith(
    t,
    `const none = '0000000000000000000000000a'
export default seed(async ({ db }) => {
  db.users.add({ name: 'Ada', roles: [] })
  await new Promise((done) => setTimeout(done, 20))
  db.orders.add({ title: 'An order of nobody', owner: none })
})`,
  )
  assert.equal(await codeOf(late), 'T2104')
  // A seed whose own code throws ends with T0009, which holds what was thrown.
  const thrown = seededWith(
    t,
    `export default seed(({ db }) => {
  db.users.add({ name: 'Ada', roles: [] })
  throw new Error('the seed gave up')
})`,
  )
  assert.equal(await codeOf(thrown), 'T0009')
})
