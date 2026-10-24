import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundled, workFolder } from './apps.ts'

const program = fileURLToPath(new URL('./loaded/noScreens.ts', import.meta.url))

test('[21-24@5] an app that holds no screen loads nothing of screens and nothing of React, whatever page it is asked for', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  assert.deepEqual(Object.keys(bundle.description.screens), [])
  // The runner skips every file when it finds this in what it is handed, as it is when a test starts a program.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const out = execFileSync(process.execPath, [program, bundle.folder, join(work, 'data')], {
    env,
    encoding: 'utf8',
    timeout: 120_000,
  })
  const said = Object(JSON.parse(/^said: (.*)$/m.exec(out)?.[1] ?? '{}'))
  assert.equal(said.engine, true, 'the program tells of the files it loads')
  // The app answers its calls, and no address of a page is there.
  assert.equal(said.called, 200)
  assert.deepEqual(said.screens, [404, 404, 404])
  assert.equal(said.read, 200)
  assert.equal(said.page, 'T0001')
  assert.deepEqual(said.loaded, [])
})
