import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { startWords } from './startWords.ts'
import { copied, shell, typed } from './typed.ts'

test('[15-6@4] `tent start --seed` ends with the failure of a seed that fails, and never in silence: it names the code and the words of what the seed was refused with', async (t) => {
  const project = copied(t, 'seed-fails')
  // The second write links to a user that is not there: the store refuses it.
  writeFileSync(
    join(project, 'seed.ts'),
    `import { seed } from 'tentjs'

export default seed(({ db }) => {
  db.users.add({ name: 'Ada', roles: ['staff'] })
  db.orders.add({ title: 'An order of nobody', owner: '0000000000000000000000000a' })
})
`,
  )
  const built = await buildProject(project, { for: 'release' })
  const data = join(project, '..', 'data')
  const words = startWords([
    'start',
    built.bundleFolder,
    '--data',
    data,
    '--port',
    '0',
    '--mode',
    'test',
    '--seed',
    '--json',
  ])
  const output = await typed(project, ...words)
  const [found] = output.answer.findings ?? []
  assert.notEqual(output.ended, 0)
  assert.equal(found?.code, 'T2104')
  assert.match(String(found?.message), /users/)
  // The engine was closed: its file is gone, and no program is left on the data folder.
  assert.equal(existsSync(join(data, 'engine.json')), false)
})

test('[15-6@4] `tent start --seed` on data that is not empty says that the seed was not applied, beside where the app runs', async (t) => {
  const project = copied(t, 'seed-twice')
  const built = await buildProject(project, { for: 'release' })
  const data = join(project, '..', 'data')
  /** Starts the command as a program of its own, and answers what it said once it runs: it is ended by its number. */
  const started = async (): Promise<string> => {
    const words = startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--mode', 'test', '--seed'])
    const child = spawn(process.execPath, [shell, ...words], { cwd: project, stdio: ['ignore', 'ignore', 'pipe'] })
    const ended = new Promise<void>((done) => child.once('exit', () => done()))
    t.after(async () => {
      child.kill()
      await ended
    })
    let said = ''
    child.stderr.setEncoding('utf8').on('data', (piece: string) => {
      said += piece
    })
    for (const ends = performance.now() + 60_000; performance.now() < ends; ) {
      if (/runs at http/.test(said) || child.exitCode !== null) break
      await new Promise((done) => setTimeout(done, 20))
    }
    child.kill()
    await ended
    return said
  }
  const first = await started()
  assert.match(first, /shop runs at http/)
  assert.doesNotMatch(first, /seed/)
  const second = await started()
  assert.match(second, /shop runs at http/)
  assert.match(second, /holds data already.*the seed was not applied/)
})
