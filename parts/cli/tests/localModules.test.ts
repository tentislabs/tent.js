import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprint } from '../../core/index.ts'
import { openedCommands } from './lineApp.ts'
import { shell } from './typed.ts'

test("[24-14] the modules of a command of an app on this computer are kept under `cli/local-<the fingerprint of its data folder's path>/` of the runner's folder", async (t) => {
  const { project, data } = await openedCommands(t, { commands: true })
  const home = join(project, '..', `home-${process.pid}`)
  mkdirSync(home, { recursive: true })
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  // The engine runs in this program: the runner is waited for without holding this program still.
  const child = spawn(process.execPath, [shell, 'cli', project, 'close-desk'], {
    cwd: home,
    env: { ...env, TENT_HOME: home },
  })
  const [out, err]: string[][] = [[], []]
  child.stdout.on('data', (part) => void out.push(String(part)))
  child.stderr.on('data', (part) => void err.push(String(part)))
  child.stdin.end()
  const status = await new Promise<number | null>((done) => {
    const timer = setTimeout(() => child.kill(), 60_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      done(code)
    })
  })
  assert.equal(status, 0, err.join(''))
  assert.equal(out.join(''), 'closed\n')
  const kept = join(home, 'cli', `local-${fingerprint(data).slice(0, 12)}`)
  assert.ok(existsSync(kept), `the runner's folder holds ${readdirSync(home).join(', ')}`)
  assert.ok(
    readdirSync(kept).some((one) => one.endsWith('.js')),
    readdirSync(kept).join(', '),
  )
  assert.equal(existsSync(join(data, 'cli')), false, 'nothing is kept under the data folder')
})
