import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

// A group of Entra ID, which `whoami /groups` lists on a computer joined to it and which names no account the
// computer can look up: the system's program for rights refuses a whole run that names such an id.
const unknownGroup = 'S-1-12-1-1111111111-2222222222-3333333333-4444444444'

// Run as the system's two programs by the runtime itself under their names: `whoami.exe` tells the account with the
// group above beside the real ones, and `icacls.exe` hands its words to the real one.
const standIn = `
import { execFileSync, spawnSync } from 'node:child_process'
import { basename, join } from 'node:path'
const system = join(process.env.REAL_SYSTEM_ROOT, 'System32')
const name = basename(process.execPath).toLowerCase()
if (name === 'whoami.exe') {
  const real = execFileSync(join(system, 'whoami.exe'), ['/user', '/groups', '/fo', 'csv', '/nh'], { encoding: 'utf8' })
  process.stdout.write(real + '"","Unknown SID type","${unknownGroup}","Mandatory group, Enabled by default, Enabled group"\\r\\n')
  process.exit(0)
}
if (name === 'icacls.exe') {
  const ended = spawnSync(join(system, 'icacls.exe'), process.argv.slice(1), { stdio: 'inherit' })
  process.exit(ended.status ?? 1)
}
`

test('[05-12.6] a file of the current user alone is written, and read by no other user, also where the account holds a group whose id names no account the computer knows, as a group of Entra ID', (t) => {
  // The rights of a file are Windows's alone: elsewhere its mode holds them, which this change did not touch.
  if (process.platform !== 'win32') return
  const work = mkdtempSync(join(tmpdir(), 'tent-review-owner-'))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  const system = join(work, 'root', 'System32')
  mkdirSync(system, { recursive: true })
  for (const name of ['whoami.exe', 'icacls.exe']) linkSync(process.execPath, join(system, name))
  const preload = join(work, 'standIn.mjs')
  writeFileSync(preload, standIn)
  const program = join(work, 'write.mjs')
  const file = join(work, 'keys.json')
  writeFileSync(
    program,
    [
      `import { writeOwnerOnly } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '..', 'ownerOnly.ts')).href)}`,
      `writeOwnerOnly(${JSON.stringify(file)}, '{}')`,
      '',
    ].join('\n'),
  )
  // A name of the environment is one on Windows whatever its case, and a shell may hand it on in capitals.
  const kept = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'systemroot'))
  const ended = spawnSync(process.execPath, [program], {
    encoding: 'utf8',
    env: {
      ...kept,
      SystemRoot: join(work, 'root'),
      REAL_SYSTEM_ROOT: process.env.SystemRoot ?? 'C:\\Windows',
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
    },
  })
  assert.equal(ended.status, 0, `the file was not written: ${ended.stderr}`)
  const rights = execFileSync('icacls', [file], { encoding: 'utf8' })
  const mine = `\\${userInfo().username.toLowerCase()}:`
  const others = rights
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .filter((line) => !line.toLowerCase().includes(mine))
  assert.deepEqual(others, [], rights)
})
