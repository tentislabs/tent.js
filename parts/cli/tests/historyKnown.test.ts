import assert from 'node:assert/strict'
import fs, { readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { buildSaved } from '../../build/index.ts'
import { openHistory } from '../../history/index.ts'
import { copied } from './typed.ts'

// The point that a save of `tent dev` records takes the fingerprints the build already made of each file it read.

/** Every file that this program reads through the runtime's own function while `run` runs, by where it lies. */
function readWhile<Answer>(run: () => Answer): { answer: Answer; read: string[] } {
  const read: string[] = []
  const was = fs.readFileSync
  Reflect.set(fs, 'readFileSync', (...given: Parameters<typeof fs.readFileSync>) => {
    read.push(resolve(String(given[0])))
    return Reflect.apply(was, fs, given)
  })
  syncBuiltinESMExports()
  try {
    return { answer: run(), read }
  } finally {
    Reflect.set(fs, 'readFileSync', was)
    syncBuiltinESMExports()
  }
}

test('[40-14a] a point of a save that is handed the fingerprints of the build reads no file the history holds already, and equals, blob for blob, a point that reads every file', async (t) => {
  const folder = copied(t, 'pointKnown')
  writeFileSync(join(folder, 'README.md'), 'Notes on the shop.\n')
  const by = { kind: 'tool' as const }
  const first = await buildSaved(folder)
  // Each history is closed before the folder is removed, which a history that is open holds on some systems.
  const kept = openHistory(join(folder, '..', 'data-kept'))
  const whole = openHistory(join(folder, '..', 'data-whole'))
  try {
    kept.record(folder, { by, kind: 'save', description: first.described })

    // A save of one file: the point of it is handed what the build read.
    const saved = join(folder, 'functions', 'orders.ts')
    writeFileSync(saved, `${readFileSync(saved, 'utf8')}\n// saved once\n`)
    const next = await buildSaved(folder)
    assert.ok(Object.keys(next.prints).length > 3, 'the build tells the fingerprint of each file it read')
    const { answer: point, read } = readWhile(() =>
      kept.record(folder, { by, kind: 'save', description: next.described, known: next.prints }),
    )
    const project = resolve(folder)
    const ofProject = read.filter((lies) => lies.startsWith(project)).map((lies) => lies.slice(project.length + 1))
    // The saved file is read and kept; so is every file that the build reads not; no other file is read again.
    assert.ok(
      ofProject.some((path) => path.replaceAll('\\', '/') === 'functions/orders.ts'),
      ofProject.join(', '),
    )
    for (const path of ofProject.map((one) => one.replaceAll('\\', '/')))
      assert.ok(path === 'functions/orders.ts' || next.prints[path] === undefined, `${path} was read again`)

    // The same files recorded by a history that reads every file.
    const read2 = whole.record(folder, { by, kind: 'save', description: next.described })
    assert.deepEqual(point.files, read2.files)
    assert.equal(point.description, read2.description)
    for (const print of Object.values(point.files ?? {})) assert.deepEqual(kept.blob(print), whole.blob(print), print)
  } finally {
    kept.close()
    whole.close()
  }
})
