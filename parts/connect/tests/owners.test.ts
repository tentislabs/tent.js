import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { system } from '../../../rig/system.ts'
import { keepKey, keptKey } from '../cli/keys.ts'
import { ownedHere } from '../cli/owner.ts'

/** A folder of its own for one test, removed when the test ends. */
function folderOf(t: TestContext): string {
  const folder = mkdtempSync(join(tmpdir(), 'tent-owners-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  return folder
}

// A file of this computer that the system owns and no user does.
const systemFile =
  process.platform === 'win32'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'kernel32.dll')
    : '/etc/passwd'

test('[24-15] a file is read as kept only when the current user owns it, on Windows as on the others', (t) => {
  const folder = folderOf(t)
  const mine = join(folder, 'mine.json')
  writeFileSync(mine, '{}')
  assert.equal(ownedHere(mine), true)
  // A user who is the system owns every file, and so has no file of another to try.
  if (typeof process.getuid === 'function' && process.getuid() === 0) return
  assert.equal(ownedHere(systemFile), false)
  assert.equal(ownedHere(join(folder, 'none.json')), false)
})

test('[24-15] `keys.json` is closed by the tools of the system, and not by a program of that name that the path finds first', (t) => {
  // The rights of a file are set by the tools of the system on Windows alone: elsewhere there is nothing to hold.
  if (system() !== 'windows') return t.diagnostic(`${system()} sets the rights of a file by its mode`)
  const folder = folderOf(t)
  // Programs of those names, first on the path: each prints another thing and fails.
  const hostname = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'hostname.exe')
  const tools = mkdtempSync(join(folder, 'tools-'))
  for (const name of ['whoami.exe', 'icacls.exe']) copyFileSync(hostname, join(tools, name))
  const before = process.env.PATH
  process.env.PATH = `${tools};${before ?? ''}`
  t.after(() => {
    process.env.PATH = before
  })
  const kept = mkdtempSync(join(folder, 'home-'))
  keepKey(kept, 'https://server.test', 'tent_kept')
  process.env.PATH = before
  assert.equal(keptKey(kept, 'https://server.test'), 'tent_kept')
})
