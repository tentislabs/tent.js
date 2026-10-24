import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

// The engine's own folder of page code belongs to its program: one that a program left, which was ended with no
// time to remove it, is removed by the next program that makes its own.

test('[21-17] the folder of page code that an ended program left is removed when the next program draws its first page, and its own is not', async (t) => {
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  const left = join(tmpdir(), `tent-page-code-${gone.stdout}-left`)
  mkdirSync(left, { recursive: true })
  writeFileSync(join(left, 'page.000000000000.js'), 'export {}\n')
  t.after(() => rmSync(left, { recursive: true, force: true }))
  const { app } = await served('laidOut')
  const page = await app.page('/')
  assert.equal(page.status, 200)
  assert.equal(existsSync(left), false, 'the folder that the ended program left is removed')
  const own = readdirSync(tmpdir()).filter((one) => one.startsWith(`tent-page-code-${process.pid}-`))
  assert.equal(own.length, 1, 'this program has its own folder of page code')
})
