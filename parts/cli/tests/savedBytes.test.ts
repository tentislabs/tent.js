import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { changedFrom, lyingIn } from '../lying.ts'
import { unread } from '../unread.ts'
import { copied } from './typed.ts'

const cli = join(import.meta.dirname, '..')
const hourAgo = (): Date => new Date(Date.now() - 3_600_000)

test('[31-21] a save is a change of bytes, never of a time: a file the newest build did not read is a save whatever its moment, and one it read is a save only where its bytes differ', (t) => {
  const folder = copied(t, 'saved-bytes', 'devs')
  const read = join(folder, 'screens.tsx')
  const prints = { 'screens.tsx': fingerprintOf(readFileSync(read)) }
  // A file that the build did not read, written an hour before it began, as one moved in from elsewhere.
  const moved = join(folder, 'moved.tsx')
  writeFileSync(moved, 'export const moved = 1\n')
  utimesSync(moved, hourAgo(), hourAgo())
  assert.equal(unread(folder, moved, prints), true, 'a file the build did not read is a save, however old')
  // The file the build read, told of again with its bytes as they were and a new moment.
  utimesSync(read, new Date(), new Date())
  assert.equal(unread(folder, read, prints), false, 'the bytes the build read are no save, whatever the moment')
  // The file the build read, with other bytes and the moment it had before the build.
  writeFileSync(read, `${readFileSync(read, 'utf8')}\n// another line\n`)
  utimesSync(read, hourAgo(), hourAgo())
  assert.equal(unread(folder, read, prints), true, 'other bytes are a save, whatever the moment')
  rmSync(read)
  assert.equal(unread(folder, read, prints), true, 'a file the build read that is gone is a save')
})

test('[31-21] the sweep of tent dev tells of each file whose entry on the disk changed since the sweep last looked - one moved in with an old moment, one whose bytes were put back with the moment they had, one gone - and of no other', (t) => {
  const folder = copied(t, 'saved-swept', 'devs')
  const written = join(folder, 'functions.ts')
  const gone = join(folder, 'seed.ts')
  // What the disk held when the sweep last looked.
  const before = lyingIn([folder])
  const elsewhere = join(folder, '..', 'elsewhere')
  mkdirSync(elsewhere, { recursive: true })
  writeFileSync(join(elsewhere, 'moved.tsx'), 'export const moved = 1\n')
  utimesSync(join(elsewhere, 'moved.tsx'), hourAgo(), hourAgo())
  renameSync(join(elsewhere, 'moved.tsx'), join(folder, 'moved.tsx'))
  const { mtime } = statSync(written)
  writeFileSync(written, `${readFileSync(written, 'utf8')}\n// another line\n`)
  utimesSync(written, mtime, mtime)
  rmSync(gone)
  // Within the engine's own folder nothing is a save.
  mkdirSync(join(folder, '.tent'), { recursive: true })
  writeFileSync(join(folder, '.tent', 'engine.json'), '{}')
  const told = changedFrom(before, lyingIn([folder])).sort()
  assert.deepEqual(told, [written, gone, join(folder, 'moved.tsx')].map((one) => one.replaceAll('\\', '/')).sort())
  assert.deepEqual(changedFrom(lyingIn([folder]), lyingIn([folder])), [], 'with nothing changed nothing is told')
})

test('[31-21] the moment of a file decides no save: tent dev keeps no moment of its newest build, and no file of cli asks when a file was written', () => {
  assert.equal(existsSync(join(cli, 'changedSince.ts')), false, 'the walk by the moment of a file is removed')
  for (const file of ['dev.ts', 'unread.ts']) {
    const text = readFileSync(join(cli, file), 'utf8')
    for (const word of ['mtime', 'writtenAfter', 'changedSince', 'builtFrom'])
      assert.equal(text.includes(word), false, `${file} names ${word}`)
  }
})
