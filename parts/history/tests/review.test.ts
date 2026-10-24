import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ada, put, started } from './work.ts'

test('[40-4] a switch goes to a branch, and never to the pointer live: a point recorded after it moves no live', (t) => {
  const { project, history } = started(t, { 'a.txt': 'one\n' })
  const first = history.record(project, { by: ada, kind: 'named', name: 'first' })
  // The pointer of what is live on a server, which no branch is.
  history.move('live', first.id)
  put(project, 'a.txt', 'two\n')
  history.record(project, { by: ada, kind: 'save' })
  let refused = false
  try {
    history.switch(project, 'live', ada)
  } catch {
    refused = true
  }
  put(project, 'a.txt', 'three\n')
  history.record(project, { by: ada, kind: 'save' })
  assert.equal(history.pointer('live'), first.id, 'live stands where it was moved')
  assert.ok(refused, 'live names no branch')
})

test('[40-14a] the newest point that changed a file is still named after a save that took the place of a later one', (t) => {
  const { project, history } = started(t, { 'x.txt': '0\n', 'y.txt': '0\n' })
  history.record(project, { by: ada, kind: 'command' })
  put(project, 'x.txt', '1\n')
  const changed = history.record(project, { by: ada, kind: 'command' })
  assert.equal(history.changedBy('x.txt'), changed.id)
  // A save changes x again, and the next save, within the time of a join, takes its place and gives x back its
  // bytes: what x holds is what the command point gave it.
  put(project, 'x.txt', '2\n')
  history.record(project, { by: ada, kind: 'save' })
  put(project, 'x.txt', '1\n')
  put(project, 'y.txt', '1\n')
  const joined = history.record(project, { by: ada, kind: 'save' })
  assert.deepEqual(joined.parents, [changed.id], 'the second save took the place of the first')
  assert.equal(history.changedBy('x.txt'), changed.id, 'the command point is the newest that changed x')
})
