import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs, { readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => boolean): Promise<void> {
  for (let n = 0; n < 1500; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

/** A watcher of the system that tells of nothing, as one that missed every save. */
class Deaf extends EventEmitter {
  close(): void {}
  ref(): this {
    return this
  }
  unref(): this {
    return this
  }
}

test('[31-21] a sweep that tells of two files at once, the first one that the newest build read as it lies and the second a save, builds the save', async (t) => {
  // The watcher of the system tells of nothing here: the sweep alone finds what changed.
  const was = fs.watch
  Reflect.set(fs, 'watch', () => new Deaf())
  syncBuiltinESMExports()
  t.after(() => {
    Reflect.set(fs, 'watch', was)
    syncBuiltinESMExports()
  })
  // The session is ended before its folder is removed: the hooks of a test run in the order they were given.
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'swept-two', 'devs')
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const first = dev.version()
  // Both at once, so one sweep finds both: the first in the order of the folder is written again as it was, and
  // the second is saved.
  const same = join(folder, 'functions.ts')
  writeFileSync(same, readFileSync(same))
  const saved = join(folder, 'screens.tsx')
  writeFileSync(saved, readFileSync(saved, 'utf8').replace('The first heading', 'The saved heading'))
  await until('the save runs', () => dev.version() !== first)
})
