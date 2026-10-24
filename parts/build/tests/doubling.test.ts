import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, lying } from './projects.ts'

test('[12-3a] a body that doubles a text forty times makes no build run long or grow large: the build works no such value out, in a plain body and in one that is code, for development and for release', () => {
  const project = copyOf('doubling/project', 'doubling')
  // The build is a program of its own, held to a bound: 512 MB of what the runtime counts, 700 MB of all that the
  // program holds, which it looks at itself and ends by, and a minute. So a build that works the text out fails
  // this test within a second, and takes nothing from the computer.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const program = [join(lying('doubling'), 'build.ts'), project]
  const ended = spawnSync(process.execPath, ['--max-old-space-size=512', ...program], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const why = `${ended.signal ?? ''} ${ended.stdout.slice(-300)} ${ended.stderr.slice(-400)}`
  assert.equal(ended.status, 0, `the build ended by itself, within its bounds: ${why}`)
  const said = JSON.parse(/^said: (.*)$/m.exec(ended.stdout)?.[1] ?? '{}')
  for (const one of said.built) {
    assert.deepEqual(one.errors, [], one.kind)
    assert.deepEqual(one.forms, { doubles: 'plain', trims: 'code' }, one.kind)
  }
  assert.deepEqual(
    said.built.map((one: { kind: string }) => one.kind),
    ['dev', 'release'],
  )
  // A build of this project holds some 130 MB. Worked out, the text of the twenty-third doubling alone takes 500 more.
  assert.ok(said.megabytes < 400, `the build took ${said.megabytes} MB`)
})
