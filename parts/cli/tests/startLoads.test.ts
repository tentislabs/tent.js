import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildProject } from '../../build/index.ts'
import { startWords } from './startWords.ts'
import { copied, root } from './typed.ts'

/** Waits until something holds, and fails where it never does: it waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 6000): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

test('[21-24@10c] tent start, as it is typed, starts an app that needs nothing of the build, and loads nothing of the build', async (t) => {
  const project = copied(t, 'start-loads', 'shop')
  const built = await buildProject(project, { for: 'release' })
  assert.equal(built.findings.filter((one) => one.level === 'error').length, 0)
  const data = join(project, '..', 'data')
  const loaded = join(project, '..', 'loaded.txt')
  const child = spawn(
    process.execPath,
    [
      `--import=${pathToFileURL(join(root, 'rig', 'offline.ts')).href}`,
      `--import=${new URL('./loadedHook.ts', import.meta.url).href}`,
      join(root, 'parts', 'cli', 'shell.ts'),
      ...startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--mode', 'test']),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TENT_LOADED: loaded } },
  )
  const ended = new Promise<void>((done) => child.once('exit', () => done()))
  // The program is ended by its own number before its folder is removed, also where the test fails.
  try {
    let said = ''
    child.stderr?.setEncoding('utf8').on('data', (piece: string) => {
      said += piece
    })
    const listens = /:(\d+)\b/
    await until('tent start says where it listens', () => listens.test(said) || child.exitCode !== null)
    const port = Number(listens.exec(said)?.[1])
    assert.ok(port > 0, said)
    // A call is answered: the app runs.
    const health = await fetch(`http://127.0.0.1:${port}/_t/health`)
    assert.equal(health.status, 200)
    assert.ok(existsSync(loaded))
    const all = readFileSync(loaded, 'utf8').split(/\r?\n/)
    assert.ok(
      all.some((address) => address.includes('/parts/engine/')),
      'the hook saw the engine load',
    )
    assert.deepEqual(
      all.filter((address) => address.includes('/parts/build/') || /\/node_modules\/(rolldown|vite)\//.test(address)),
      [],
    )
  } finally {
    child.kill()
    await ended
  }
})
