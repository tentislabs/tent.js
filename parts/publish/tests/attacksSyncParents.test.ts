import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Point } from '../../history/index.ts'
import { idOf } from '../../history/index.ts'
import { push } from '../index.ts'
import { ada, computer, fetched, folderOf, sent, started } from './server.ts'

/** A point of the server's own form, with an id that fits what it holds. */
function pointOf(held: Omit<Point, 'id'>): Point {
  return { id: idOf(held), ...held }
}

test('[05-15.17] a point whose parents the server lacks is T9107: nothing that was sent with it is kept, and no pointer moves to it', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const { key } = server.key(['read', 'push'])
  await push({ history: here.history, to: { address: server.address, key }, fetch: fetched })
  const files = here.history.read(head)?.files
  const pointers = JSON.stringify(server.history.pointers())
  // A parent that no history holds, and one of a history the server never saw.
  const lacking = pointOf({ parents: ['0'.repeat(32)], at: 3, by: ada, kind: 'command', files })
  const above = pointOf({ parents: [head, 'f'.repeat(32)], at: 4, by: ada, kind: 'command', files })
  const child = pointOf({ parents: [lacking.id], at: 5, by: ada, kind: 'command', files })
  const good = pointOf({ parents: [head], at: 6, by: ada, kind: 'command', files })
  for (const points of [[lacking], [above], [good, child, lacking], [child, good]]) {
    const answered = await sent(server, '/_t/sync/points', { points }, key)
    assert.equal(Object(answered.answer.error).code, 'T9107', JSON.stringify(answered.answer))
    for (const one of [lacking, above, child, good]) assert.equal(server.history.read(one.id), undefined)
  }
  const moved = await sent(
    server,
    '/_t/sync/points',
    { points: [lacking], move: { pointer: 'main', to: lacking.id, was: head } },
    key,
  )
  assert.equal(Object(moved.answer.error).code, 'T9107', JSON.stringify(moved.answer))
  assert.equal(JSON.stringify(server.history.pointers()), pointers, 'no pointer moved')
  assert.equal(server.history.read(lacking.id), undefined)
})
