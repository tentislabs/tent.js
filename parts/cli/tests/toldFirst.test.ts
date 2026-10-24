import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { developed, pointsOf, saved } from './historyDev.ts'

// A save reaches the open pages first: the point of the history and the cleaning of the versions it left are done once
// the pages are told, so that what they ask for next is answered at once.

/** The newest point of the history of a project, read beside the session as it stands on the disk. */
function newestPoint(folder: string): string {
  const db = new DatabaseSync(join(folder, '.tent', 'history.db'), { readOnly: true })
  try {
    return String(db.prepare('SELECT id FROM points ORDER BY at DESC LIMIT 1').get()?.id)
  } finally {
    db.close()
  }
}

test('[31-12] a save is switched to and its pages told before its point of the history is recorded and the version it left is cleaned away: both are done once the session is quiet, and before anything reads the history', async (t) => {
  const dev = await developed(t, 'told-first')
  const folder = dev.folder
  const before = newestPoint(folder)
  const left = dev.version()
  await saved(dev, 'functions.ts', 'limit(100)', 'limit(50)')
  // The version runs, and its point is not recorded yet: the version it left can still be loaded.
  assert.equal(newestPoint(folder), before)
  assert.ok(
    dev
      .app()
      .versions()
      .some((one) => one.id === left),
  )
  // Whatever asks for the history finds the point of the save, and the version left is gone.
  const points = await pointsOf(folder)
  assert.notEqual(points[0].id, before)
  assert.equal(newestPoint(folder), points[0].id)
  assert.equal(
    dev
      .app()
      .versions()
      .some((one) => one.id === left),
    false,
  )
})
