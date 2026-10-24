import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { untilWithin } from './remotes.ts'
import { served } from './served.ts'

/** The id, the parent, the kind, the name and the outcome of each span the log of the app keeps, oldest first. */
function spansIn(dataFolder: string): { span: string; parent: string; kind: string; name: string; ok: number }[] {
  const db = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return db
      .prepare('SELECT span, parent, kind, name, ok FROM spans ORDER BY rowid')
      .all()
      .map((row) => ({
        span: String(row.span),
        parent: String(row.parent),
        kind: String(row.kind),
        name: String(row.name),
        ok: Number(row.ok),
      }))
  } finally {
    db.close()
  }
}

test('[44-1] the draw of a page whose head is sent before its body is one span, named by its screen and ended with its body, with the entries it asked under it', async () => {
  const at = await served('streamed')
  const answer = await fetch(`${at.address}/`, { headers: { accept: 'text/html' } })
  const page = await answer.text()
  assert.ok(page.includes('Notes on the shelf'), page)
  await untilWithin(
    'the span of the draw is kept',
    () => spansIn(at.dataFolder).some((one) => one.kind === 'draw'),
    20_000,
  )
  const spans = spansIn(at.dataFolder)
  const draws = spans.filter((one) => one.kind === 'draw')
  assert.deepEqual(
    draws.map((one) => one.name),
    ['shelfScreen'],
    JSON.stringify(spans),
  )
  assert.equal(draws[0]?.ok, 1, JSON.stringify(spans))
  // The entry of the screen's own, which decided the head, was asked inside the draw.
  assert.equal(spans.find((one) => one.name === 'allNotes')?.parent, draws[0]?.span, JSON.stringify(spans))
})
