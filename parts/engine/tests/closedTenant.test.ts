import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { workFolder } from './apps.ts'

const root = join(import.meta.dirname, '..', '..', '..')

test('[17-1@9a] a run that waits in the data file of a tenant keeps no program from ending once its app and its engine were closed: a closed app holds no timer and no file open', async (t) => {
  const program = join(import.meta.dirname, 'closing', 'tenantWaits.ts')
  // The project is built in a copy, where the build may write beside its files.
  const work = workFolder(t)
  const project = join(work, 'project')
  cpSync(join(import.meta.dirname, 'reviewTeams'), project, { recursive: true })
  const child = spawn(
    process.execPath,
    [`--import=${pathToFileURL(join(root, 'rig', 'jsx.ts')).href}`, program, project, work],
    { cwd: root },
  )
  let out = ''
  child.stdout.on('data', (part) => {
    out += String(part)
  })
  child.stderr.on('data', (part) => {
    out += String(part)
  })
  // The program prints `closed` and must end by itself soon after: past the time it is ended, and the test fails.
  const ended = await new Promise<number | null>((done) => {
    const timer = setTimeout(() => {
      child.kill()
      done(null)
    }, 60_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      done(code)
    })
  })
  assert.match(out, /^closed$/m, out)
  assert.equal(ended, 0, `the program ended on its own: ${out}`)
})
