import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { copyOf } from './projects.ts'

// The rigs that every test program of this repository loads first, which the program of the planted file loads too.
const rigs = ['jsx.ts', 'offline.ts'].flatMap((rig) => [
  '--import',
  pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'rig', rig)).href,
])

// A test file of an app that opens its test app in a `before` hook and reads it in each of its tests, and never closes it.
const planted = `import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { testApp } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '..', 'index.ts')).href)}

let app

before(async () => {
  app = await testApp()
})

test('the first test reads the app of the hook', async () => {
  assert.equal((await app.rows('users')).length, 2)
})

test('the second test reads it too', async () => {
  assert.equal((await app.rows('orders')).length, 3)
})
`

test('[17-1] a test app opened in a `before` hook stays open for every test of its file, and is closed once the file has run, leaving no folder behind', (t) => {
  const project = copyOf(t, 'shop')
  mkdirSync(join(project, 'tests'))
  writeFileSync(join(project, 'tests', 'hooked.test.ts'), planted)
  // The temporary folders of the test app are made in a folder of the test's own, so that it sees what is left.
  const temp = join(project, '..', 'temp')
  mkdirSync(temp)
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ended = spawnSync(process.execPath, [...rigs, '--test', '--test-reporter=tap', 'tests/hooked.test.ts'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...env, TMPDIR: temp, TEMP: temp, TMP: temp },
  })
  assert.equal(ended.status, 0, `the file ended with ${ended.status} (${ended.signal}): ${ended.stdout}${ended.stderr}`)
  assert.match(ended.stdout, /^# pass 2$/m)
  assert.deepEqual(readdirSync(temp), [], 'a temporary folder was left behind')
})
