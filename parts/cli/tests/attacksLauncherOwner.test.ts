import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Terminal } from '../../core/index.ts'
import { add, list } from '../added.ts'

/** A terminal that keeps what was printed, with no person at it. */
function terminalOf(): { terminal: Terminal; out: string[]; err: string[] } {
  const [out, err]: string[][] = [[], []]
  const terminal: Terminal = {
    write: (text) => void out.push(text),
    error: (text) => void err.push(text),
    raw: (text) => void out.push(text),
    line: async () => undefined,
    keys: async function* () {},
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: false,
    color: false,
  }
  return { terminal, out, err }
}

// A folder of the system that holds a file named `hosts`, which the system's own user wrote and no test may change.
const systemFolder =
  process.platform === 'win32'
    ? join(String(process.env.SystemRoot ?? 'C:\\Windows'), 'System32', 'drivers', 'etc')
    : '/etc'

test('[05-12.24] a launcher in bin/ that another user of the computer wrote is not written over, not run, and named', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tent-attacks-launcher-'))
  // The link is taken away by itself first, so that nothing of the folder it leads to is ever removed.
  t.after(() => {
    const bin = join(home, 'bin')
    if (process.platform === 'win32') rmdirSync(bin)
    else unlinkSync(bin)
    rmSync(home, { recursive: true, force: true })
  })
  // `bin/` of the runner's folder leads to the folder of the system: its `hosts` stands there as a launcher of
  // another user. A link to a folder needs no right of its own on any of the three systems.
  symlinkSync(systemFolder, join(home, 'bin'), process.platform === 'win32' ? 'junction' : 'dir')
  const theirs = join(home, 'bin', 'hosts')
  const before = { bytes: readFileSync(theirs), at: statSync(theirs).mtimeMs }
  const address = 'https://shop.example'
  const adding = terminalOf()
  const ended = await add({
    home,
    address,
    name: 'hosts',
    yes: true,
    terminal: adding.terminal,
    listed: async () => ({ name: 'hosts' }),
  })
  assert.equal(ended, 2, adding.err.join(''))
  assert.match(adding.err.join(''), /another user/)
  assert.ok(adding.err.join('').includes(theirs), `the launcher is named: ${adding.err.join('')}`)
  assert.deepEqual(readFileSync(theirs), before.bytes, 'the launcher of another user was written over')
  assert.equal(statSync(theirs).mtimeMs, before.at)
  // An address that was added under that name before is listed with a word that names the launcher, not to run.
  const kept = join(home, 'cli', 'shop.example')
  mkdirSync(kept, { recursive: true })
  writeFileSync(join(kept, 'added.json'), `${JSON.stringify({ address, name: 'hosts' })}\n`)
  const listing = terminalOf()
  assert.equal(list(home, listing.terminal), 0)
  assert.match(listing.err.join(''), /another user of this computer: do not run it/)
  assert.ok(listing.err.join('').includes(theirs))
})
