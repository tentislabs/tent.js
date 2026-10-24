import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, shell } from './typed.ts'

// What every test file of the project begins with: it writes down the number of its program.
const head = (name: string): string => `import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { testApp } from 'tentjs/test'

writeFileSync(join(String(process.env.TENT_TEST_NUMBERS), '${name}'), String(process.pid))
`

const files = {
  'fails.test.ts': `
test('a check fails before the app is closed', async () => {
  const app = await testApp()
  assert.equal((await app.rows('users')).length, 99)
  await app.close()
})
`,
  'open.test.ts': `
test('the app is never closed', async () => {
  const app = await testApp()
  assert.equal((await app.rows('users')).length, 2)
})
`,
  'closes.test.ts': `
test('the app is closed by the test, and closed again', async () => {
  const app = await testApp()
  await app.close()
  await app.close()
})
`,
  'again.test.ts': `
test('the app is opened a second time and left open', async () => {
  const app = await testApp()
  await app.kill()
  await app.restart()
  assert.equal((await app.rows('users')).length, 2)
})

test('a reader of the app is left open', async () => {
  const app = await testApp()
  const reader = await app.reader()
  assert.equal(reader.role, 'reader')
})
`,
}

/** Whether a program of that number still runs. */
function runs(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('[17-1@4] `tent test` comes back where a test left its app open: one that failed before its `close()`, one that never called it, one that opened its app twice, and one that left a reader open; it names the test that failed, and leaves no program and no temporary folder behind', (t) => {
  const project = copied(t, 'tested-open')
  rmSync(join(project, 'tests', 'orders.test.ts'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(project, 'tests', name), head(name) + text)
  // The temporary folders of the test apps are made in a folder of the test's own, so that it sees what is left.
  const temp = join(project, '..', 'temp')
  const numbers = join(project, '..', 'numbers')
  for (const folder of [temp, numbers]) mkdirSync(folder)
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  // The command is given two minutes: a test that left its app open kept it from coming back at all.
  const ended = spawnSync(process.execPath, [shell, 'test', '--json'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...env, TMPDIR: temp, TEMP: temp, TMP: temp, TENT_TEST_NUMBERS: numbers },
  })
  const programs = readdirSync(numbers).map((name) => Number(readFileSync(join(numbers, name), 'utf8')))
  t.after(() => {
    // A program that the command left behind is ended by its number.
    for (const pid of programs) if (runs(pid)) process.kill(pid)
  })
  assert.equal(ended.status, 1, `the command ended with ${ended.status} (${ended.signal}): ${ended.stderr}`)
  const answer = JSON.parse(ended.stdout)
  assert.deepEqual([answer.value.passed, answer.value.failed], [4, 1], ended.stdout)
  const [found] = answer.findings
  assert.equal(found.where.file, 'tests/fails.test.ts')
  assert.match(found.message, /a check fails before the app is closed/)
  assert.match(found.message, /99/)
  assert.equal(programs.length, Object.keys(files).length)
  assert.deepEqual(
    programs.filter((pid) => runs(pid)),
    [],
    'a program of a test file still runs',
  )
  assert.deepEqual(readdirSync(temp), [], 'a temporary folder was left behind')
})
