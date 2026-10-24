import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean, tries = 6000): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

/** The fingerprints that the list of a version names, by its path. */
const listed = (list: string): Record<string, string> => JSON.parse(readFileSync(list, 'utf8')).files

test('[21-17] tent dev runs each version from its list, and removes the list of a version that can no longer be loaded and each file of the store that no list names any more', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'devListed', 'devs')
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const build = join(folder, '.tent', 'build')
  const store = join(build, 'files')
  const first = dev.version()
  // The session writes the list of its version and the store of its files: no folder of the version.
  assert.ok(existsSync(join(build, `${first}.json`)))
  assert.equal(existsSync(join(build, first)), false)
  const firstFiles = listed(join(build, `${first}.json`))
  const screens = join(folder, 'screens.tsx')
  writeFileSync(screens, readFileSync(screens, 'utf8').replace('The first heading', 'The second heading'))
  await until('the save is the running version', () => dev.version() !== first)
  const second = dev.version()
  const secondFiles = listed(join(build, `${second}.json`))
  // The first version is needed by nobody: its list goes, and each file that only it named.
  await until('the list of the version left is removed', () => !existsSync(join(build, `${first}.json`)))
  const gone = Object.values(firstFiles).filter((print) => !Object.values(secondFiles).includes(print))
  assert.ok(gone.length > 0, 'the save changed some files')
  await until('the files that no list names are removed', () => gone.every((print) => !existsSync(join(store, print))))
  // Every file of the running version stands, and the store holds nothing that no list names.
  assert.deepEqual(readdirSync(store).sort(), [...new Set(Object.values(secondFiles))].sort())
  // The page is drawn from the list of the version that runs.
  const page = await fetch(`http://localhost:${dev.port}/`, { headers: { accept: 'text/html' } })
  assert.match(await page.text(), /The second heading/)
})
