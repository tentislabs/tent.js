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

// A test file of an app that fails while a page of its test app is open, before it closes the app.
const planted = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { testApp } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '..', 'index.ts')).href)}

test('a test that fails with a page open', async () => {
  const app = await testApp()
  const page = await app.open('/a')
  assert.equal((await page.text('Screen A')).role, 'paragraph')
  await app.close()
})
`

test('[17-1] a test that fails with a page of its test app open ends, its browser closed with the app once the file has run', (t) => {
  const project = copyOf(t, 'pressedTwice')
  mkdirSync(join(project, 'tests'))
  writeFileSync(join(project, 'tests', 'left.test.ts'), planted)
  // The temporary folders of the test app are made in a folder of the test's own, so that it sees what is left.
  const temp = join(project, '..', 'temp')
  mkdirSync(temp)
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ended = spawnSync(process.execPath, [...rigs, '--test', '--test-reporter=tap', 'tests/left.test.ts'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...env, TMPDIR: temp, TEMP: temp, TMP: temp },
  })
  assert.equal(ended.signal, null, `the file was ended from outside: ${ended.stdout}${ended.stderr}`)
  assert.equal(ended.status, 1, `the file ended with ${ended.status}: ${ended.stdout}${ended.stderr}`)
  assert.match(ended.stdout, /^# fail 1$/m)
  assert.deepEqual(readdirSync(temp), [], 'a temporary folder was left behind')
})
