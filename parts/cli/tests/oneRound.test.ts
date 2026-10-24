import assert from 'node:assert/strict'
import fs, { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join, sep } from 'node:path'
import { test } from 'node:test'
import { watchProject } from '../../build/index.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => boolean): Promise<void> {
  for (let n = 0; n < 3000; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

test('[31-21] a save is one round: the watcher telling of a file after the round that built it, as it does where the sweep found the save first, builds the version no second time', async (t) => {
  // The session is ended before its folder is removed: the hooks of a test run in the order they were given.
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'one-round', 'devs')
  const builds = join(folder, '.tent', 'build')
  // Each list of a version that is written, by its name: a build writes the list of the version it made.
  const lists: string[] = []
  const was = fs.writeFileSync
  Reflect.set(fs, 'writeFileSync', (...given: Parameters<typeof fs.writeFileSync>) => {
    const lies = String(given[0])
    if (lies.startsWith(builds + sep) && lies.endsWith('.json')) lists.push(lies.slice(builds.length + 1))
    return was(...given)
  })
  syncBuiltinESMExports()
  t.after(() => {
    Reflect.set(fs, 'writeFileSync', was)
    syncBuiltinESMExports()
  })
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  // A watcher of the test's own, beside the session's, says when the system has told of the file.
  const told: string[] = []
  const watcher = await watchProject(folder, (file) => told.push(file))
  t.after(() => watcher.close())

  const file = join(folder, 'screens.tsx')
  const first = dev.version()
  writeFileSync(file, readFileSync(file, 'utf8').replace('The first heading', 'The saved heading'))
  await until('the save runs', () => dev.version() !== first)
  const saved = dev.version()
  // The system tells of the file once more, its bytes and the moment it was written as they were: so a notice comes
  // that the round of the save did not wait for, as the watcher's does where the sweep found the save before it.
  const { mtime } = statSync(file)
  const heard = told.length
  utimesSync(file, mtime, mtime)
  await until('the system tells of the file again', () => told.length > heard)
  // A round that the notice started would begin at once: a sweep's time is given it before the next save.
  await new Promise((done) => setTimeout(done, 500))
  writeFileSync(file, readFileSync(file, 'utf8').replace('The saved heading', 'The heading saved again'))
  await until('the next save runs', () => dev.version() !== saved)
  assert.deepEqual(
    lists.filter((one) => one === `${saved}.json`),
    [`${saved}.json`],
    'the version of the save is built once',
  )
})
