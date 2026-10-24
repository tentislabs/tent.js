import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ada, codeOf, day, put, started } from './work.ts'

test('[40-4] a project starts on main, and a branch is a pointer made at now or at the point named', (t) => {
  const { project, history } = started(t, { 'notes.md': 'one\n' })
  const first = history.record(project, { by: ada, kind: 'save' })
  history.branch('try')
  assert.equal(history.pointer('on'), 'main')
  assert.equal(history.pointer('main'), first.id)
  assert.equal(history.pointer('try'), first.id)
  put(project, 'notes.md', 'two\n')
  const second = history.record(project, { by: ada, kind: 'save' })
  assert.equal(history.pointer('main'), second.id, 'the branch that on names follows now')
  assert.equal(history.pointer('try'), first.id, 'another branch stays where it stands')
  history.branch('older', first.id.slice(0, 8))
  assert.equal(history.pointer('older'), first.id)
})

test('[40-4] a branch is named by any text with no colon and no white space that is not now, on or live, and once', (t) => {
  const { project, history } = started(t, { 'notes.md': 'one\n' })
  history.record(project, { by: ada, kind: 'save' })
  for (const name of ['a:b', 'a b', 'tab\there', 'now', 'on', 'live', ''])
    assert.equal(
      codeOf(() => history.branch(name)),
      'T0002',
      name,
    )
  history.branch('feature/one')
  assert.equal(
    codeOf(() => history.branch('feature/one')),
    'T0002',
  )
  assert.equal(
    codeOf(() => history.branch('elsewhere', 'nothing-like-a-point')),
    'T9107',
  )
})

test('[40-4] a switch records the present, writes the files of the branch as going back does, and sets on', (t) => {
  const { project, history } = started(t, { 'a.txt': 'base\n', 'b.txt': 'b\n' })
  const base = history.record(project, { by: ada, kind: 'save' })
  history.branch('side')
  put(project, 'a.txt', 'main\n')
  put(project, 'm.txt', 'only on main\n')
  const onMain = history.record(project, { by: ada, kind: 'save' })
  const switched = history.switch(project, 'side', ada)
  assert.equal(switched.id, base.id)
  assert.equal(history.pointer('on'), 'side')
  assert.equal(history.pointer('now'), base.id)
  assert.equal(readFileSync(join(project, 'a.txt'), 'utf8'), 'base\n')
  assert.equal(existsSync(join(project, 'm.txt')), false)
  put(project, 'a.txt', 'side\n')
  const onSide = history.record(project, { by: ada, kind: 'save' })
  assert.equal(history.pointer('side'), onSide.id)
  assert.equal(history.pointer('main'), onMain.id, 'main stays where it stood')
  // What no point holds yet is recorded first, on the branch it was made on.
  put(project, 'c.txt', 'not recorded\n')
  history.switch(project, 'main', ada)
  const kept = history.read(String(history.pointer('side')))
  assert.equal(kept?.kind, 'command')
  assert.equal(kept?.parents[0], onSide.id)
  assert.ok(kept?.files && 'c.txt' in kept.files)
  assert.equal(readFileSync(join(project, 'a.txt'), 'utf8'), 'main\n')
  assert.equal(existsSync(join(project, 'c.txt')), false)
  assert.equal(history.pointer('on'), 'main')
  assert.equal(
    codeOf(() => history.switch(project, 'nowhere', ada)),
    'T9107',
  )
})

test('[40-4] a switch with nothing new records no point', (t) => {
  const { project, history } = started(t, { 'a.txt': 'base\n' })
  history.record(project, { by: ada, kind: 'save' })
  history.branch('side')
  const before = history.list().length
  history.switch(project, 'side', ada)
  assert.equal(history.list().length, before)
})

test('[40-4] the point a branch was made at outlives its time', (t) => {
  const { project, history } = started(t, { 'a.txt': 'one\n' })
  const made = history.record(project, { by: ada, kind: 'command' })
  history.branch('side')
  put(project, 'a.txt', 'two\n')
  const older = history.record(project, { by: ada, kind: 'command' })
  history.switch(project, 'side', ada)
  put(project, 'b.txt', 'three\n')
  history.record(project, { by: ada, kind: 'command' })
  history.switch(project, 'main', ada)
  // Once side is merged, the newest point the two share is the head of side: the point side was made at is no
  // longer it, and only where it was made keeps it.
  const merged = history.merge(project, 'side', ada)
  assert.equal(merged.point?.kind, 'merge')
  history.tidy(Date.now() + 40 * day, { kept: 30 * day })
  assert.ok(history.read(made.id)?.files, 'the point the branch was made at keeps its files')
  assert.equal(history.read(older.id)?.files, undefined, 'a point of a command that nothing keeps is dropped')
})
