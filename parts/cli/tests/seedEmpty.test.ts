import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { startWords } from './startWords.ts'
import { copied, shell, typed } from './typed.ts'

/** A seed that adds one user of a name. */
const seedOf = (name: string): string => `import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ name: '${name}', roles: ['staff'] })
})
`

/** A project of its own, with what ends the programs that the test starts before its folder is removed. */
function projectOf(t: TestContext, name: string): { project: string; data: string; ends: (() => Promise<void>)[] } {
  // What ends a test is done in the order it was said: the programs first, the folder after them.
  const ends: (() => Promise<void>)[] = []
  t.after(async () => {
    for (const end of ends) await end()
  })
  const project = copied(t, name)
  return { project, data: join(project, '..', 'data'), ends }
}

/**
 * Starts `tent start --seed` on the built project as a program of its own. Answers what it said once it runs,
 * and what ends it by its number.
 */
async function started(o: { project: string; data: string; ends: (() => Promise<void>)[] }): Promise<{
  said: string
  end: () => Promise<void>
}> {
  const words = startWords(['start', '--mode', 'test', '--seed', '--port', '0', '--data', o.data])
  const child = spawn(process.execPath, [shell, ...words], { cwd: o.project, stdio: ['ignore', 'ignore', 'pipe'] })
  const ended = new Promise<void>((done) => child.once('exit', () => done()))
  const end = async (): Promise<void> => {
    child.kill()
    await ended
  }
  o.ends.push(end)
  let said = ''
  child.stderr.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  for (const until = performance.now() + 60_000; performance.now() < until; ) {
    if (/runs at http/.test(said) || child.exitCode !== null) break
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.match(said, /shop runs at http/, said)
  return { said, end }
}

/** The names of the users that the data holds, read by the command. */
async function users(o: { project: string; data: string }): Promise<unknown[]> {
  const output = await typed(o.project, 'data', 'rows', 'users', '--json', '--data', o.data)
  assert.equal(output.ended, 0, output.printed)
  const rows: Record<string, unknown>[] = Object(output.answer.value)
  return rows.map((row) => row.name)
}

test('[15-6@4] `tent start --seed` applies the seed to a data folder that an earlier command opened and read: its tables are made, it holds no row, and so it is empty', async (t) => {
  const o = projectOf(t, 'seed-after-read')
  writeFileSync(join(o.project, 'seed.ts'), seedOf('Sam'))
  // The read comes before the first start, with no engine on the folder: it makes the tables, with no row.
  assert.deepEqual(await users(o), [])
  assert.equal((await typed(o.project, 'build')).ended, 0)
  const { said } = await started(o)
  assert.doesNotMatch(said, /seed was not applied/)
  assert.deepEqual(await users(o), ['Sam'])
})

test('[15-6@4] `tent start --seed` applies no seed to data that holds one row of the app, and says so in one line', async (t) => {
  const o = projectOf(t, 'seed-one-row')
  writeFileSync(join(o.project, 'seed.ts'), seedOf('Sam'))
  assert.equal((await typed(o.project, 'build')).ended, 0)
  const first = await started(o)
  await first.end()
  // The seed is another one now: were it applied, a second user would be there.
  writeFileSync(join(o.project, 'seed.ts'), seedOf('Tom'))
  assert.equal((await typed(o.project, 'build')).ended, 0)
  const second = await started(o)
  assert.equal(second.said.split('\n').filter((line) => /the seed was not applied/.test(line)).length, 1, second.said)
  assert.deepEqual(await users(o), ['Sam'])
})

test('[15-6@4] `tent start --seed` applies the seed to an app with a table that shows the counts, which holds no row of the app', async (t) => {
  const o = projectOf(t, 'seed-shown-counts')
  writeFileSync(join(o.project, 'seed.ts'), seedOf('Sam'))
  writeFileSync(
    join(o.project, 'tables', 'usage.ts'),
    "import { table } from 'tentjs'\n\nexport const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })\n",
  )
  assert.equal((await typed(o.project, 'build')).ended, 0)
  const { said } = await started(o)
  assert.doesNotMatch(said, /seed was not applied/)
  assert.deepEqual(await users(o), ['Sam'])
})
