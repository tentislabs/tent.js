import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { root, shell, typed } from './typed.ts'

// The attacks of the reviewer on the targets that the commands of a bundle now take alone: what is no bundle, no
// project and no address is refused by what it is, and never as a failure of the framework (T0009).

/** An empty folder for one test, with a file that is no bundle in it, as an old download leaves one. */
function folderOf(t: TestContext, name: string): { folder: string; file: string } {
  const folder = join(root, 'results', 'review-targets', `${name}-${process.pid}`)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const file = join(folder, 'shop.download')
  writeFileSync(file, 'the bytes of a file that is no bundle')
  return { folder, file }
}

test('[24-13] a target of tent cli that is a file, or a folder that is not there, is refused with what a target is, and never as T0009', (t) => {
  const { folder, file } = folderOf(t, 'cli')
  const { NODE_TEST_CONTEXT: _, ...rest } = process.env
  for (const target of [file, join(folder, 'not-there')]) {
    const ran = spawnSync(process.execPath, [shell, 'cli', target, '--help'], {
      cwd: folder,
      encoding: 'utf8',
      input: '',
      timeout: 120_000,
      env: { ...rest, TENT_HOME: join(folder, 'home'), TENT_NOTICES: 'off' },
    })
    const printed = `${ran.stdout}${ran.stderr}`
    assert.doesNotMatch(printed, /T0009/, `${target}: ${printed}`)
    assert.equal(ran.status, 2, `${target}: ${printed}`)
  }
})

test('[41-13a] tent service with a target that is no bundle, a file or a folder with no description.json, is refused as tent start refuses it, and never as T0009', async (t) => {
  const { folder, file } = folderOf(t, 'service')
  for (const target of [file, folder]) {
    const done = await typed(folder, 'service', target, '--json')
    const codes = (done.answer.findings ?? []).map((one) => one.code)
    assert.notEqual(done.ended, 0, done.printed)
    assert.deepEqual(codes, ['T0011'], `${target}: ${done.printed}`)
  }
})
