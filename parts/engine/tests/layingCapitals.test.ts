import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { tellsCapitalsApart } from '../archive/capitals.ts'
import { unpack } from '../archive/unpack.ts'
import { workFolder } from './apps.ts'
import { tarOf } from './archives.ts'

// Two names that differ in capitals alone, as the Python of Linux holds them under `share/terminfo`.
const capitals: [string, string] = ['terminfo/2/2621a', 'terminfo/2/2621A']
// Two names that differ in the form of a letter alone: one sign, and a letter with its mark after it.
const forms: [string, string] = [`terminfo/${String.fromCodePoint(0xe9)}`, `terminfo/e${String.fromCodePoint(0x301)}`]

/** A folder of a test to unpack into, empty, with the place where the part would stand beside it. */
function folders(t: TestContext): { folder: string; place: string } {
  const top = workFolder(t)
  mkdirSync(join(top, 'filling'), { recursive: true })
  return { folder: join(top, 'filling'), place: join(top, 'part') }
}

test('[22-6] the folder that a part is unpacked into is asked whether it tells two names that differ in capitals apart: a disk of Linux does, those of Windows and macOS do not', async (t) => {
  const { folder } = folders(t)
  assert.equal(await tellsCapitalsApart(folder), process.platform === 'linux')
})

test('[22-6] a part with two names that a disk reads as one is thrown away from a folder that reads them as one, and laid whole into one that tells them apart', async (t) => {
  for (const pair of [capitals, forms]) {
    const part = tarOf(pair.map((path, at) => ({ path, text: `the name ${at}` })))
    const told = folders(t)
    await assert.rejects(unpack([part], told.folder, told.place, false), /two names that a disk reads as one/)
  }
  // Laid whole where the folder says that it tells them apart: on this computer, with a pair that its disk tells
  // apart, since the files are written in truth.
  const apart = (await tellsCapitalsApart(folders(t).folder))
    ? capitals
    : process.platform === 'win32'
      ? forms
      : undefined
  if (!apart) {
    t.diagnostic('this disk tells no such pair apart: the part laid whole is held on the runs of Linux and Windows')
    return
  }
  const told = folders(t)
  await unpack([tarOf(apart.map((path, at) => ({ path, text: `the name ${at}` })))], told.folder, told.place, true)
  assert.deepEqual(
    apart.map((path) => readFileSync(join(told.folder, ...path.split('/')), 'utf8')),
    ['the name 0', 'the name 1'],
  )
})
