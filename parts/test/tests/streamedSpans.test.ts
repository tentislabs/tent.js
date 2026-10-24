import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { untilWithin } from './remotes.ts'
import { served } from './served.ts'

/** The kind, the name and the facts of each span the log of the app keeps, oldest first. */
function spansIn(dataFolder: string): { kind: string; name: string; facts: Record<string, unknown> }[] {
  const db = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return db
      .prepare('SELECT kind, name, facts FROM spans ORDER BY rowid')
      .all()
      .map((row) => ({ kind: String(row.kind), name: String(row.name), facts: JSON.parse(String(row.facts)) }))
  } finally {
    db.close()
  }
}

test('[44-1] the span of a draw and of each entry it asked say whether they streamed', async () => {
  const at = await served('streamed')
  const answer = await fetch(`${at.address}/`, { headers: { accept: 'text/html' } })
  await answer.text()
  await untilWithin(
    'the spans of the draw are kept',
    () => spansIn(at.dataFolder).some((one) => one.name === 'slowCount'),
    20_000,
  )
  const spans = spansIn(at.dataFolder)
  const draw = spans.find((one) => one.kind === 'draw')
  assert.equal(draw?.facts.streamed, true, JSON.stringify(spans))
  // The slow entry was sent after the page; the quick one was drawn into it.
  assert.equal(spans.find((one) => one.name === 'slowCount')?.facts.streamed, true, JSON.stringify(spans))
  assert.equal(spans.find((one) => one.name === 'allNotes')?.facts.streamed, undefined, JSON.stringify(spans))
  // A page drawn whole and sent at once streamed nothing.
  const before = spans.length
  await at.app.page('/')
  await untilWithin('the spans of the second draw are kept', () => spansIn(at.dataFolder).length > before, 20_000)
  const whole = spansIn(at.dataFolder).slice(before)
  assert.equal(
    whole.some((one) => one.facts.streamed !== undefined),
    false,
    JSON.stringify(whole),
  )
})
