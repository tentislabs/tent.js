import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { History } from '../index.ts'
import { ada, codeOf, put, started } from './work.ts'

const lines = (changed: Record<number, string> = {}): string =>
  Array.from({ length: 10 }, (_, k) => changed[k + 1] ?? `line ${k + 1}`).join('\n') + '\n'

/**
 * A history with two branches that came from one point: `main`, which `on` follows, and `side`. Each side's files
 * are written over those of the point they share and recorded, and `now` ends on main.
 */
function twoSides(
  t: TestContext,
  shared: Record<string, string | Uint8Array>,
  ours: Record<string, string | Uint8Array | null>,
  theirs: Record<string, string | Uint8Array | null>,
): { project: string; history: History; base: string; ours: string; theirs: string } {
  const { project, history } = started(t, shared)
  const base = history.record(project, { by: ada, kind: 'save' }).id
  history.branch('side')
  const write = (files: Record<string, string | Uint8Array | null>): void => {
    for (const [path, content] of Object.entries(files))
      if (content === null) rmSync(join(project, path))
      else put(project, path, content)
  }
  history.switch(project, 'side', ada)
  write(theirs)
  const theirsId = history.record(project, { by: ada, kind: 'save' }).id
  history.switch(project, 'main', ada)
  write(ours)
  const oursId = history.record(project, { by: ada, kind: 'save' }).id
  return { project, history, base, ours: oursId, theirs: theirsId }
}

test('[40-4] two sides that changed other lines of a text merge line by line, into a point with both as its parents', (t) => {
  const two = twoSides(
    t,
    { 'notes.md': lines() },
    { 'notes.md': lines({ 2: 'ours' }) },
    { 'notes.md': lines({ 9: 'theirs' }) },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  assert.equal(readFileSync(join(two.project, 'notes.md'), 'utf8'), lines({ 2: 'ours', 9: 'theirs' }))
  assert.equal(merged.point?.kind, 'merge')
  assert.deepEqual(merged.point?.parents, [two.ours, two.theirs])
  assert.equal(merged.point?.unsettled, undefined)
  assert.equal(two.history.pointer('now'), merged.point?.id)
  assert.equal(two.history.pointer('main'), merged.point?.id)
  assert.equal(existsSync(join(two.project, 'tent.clash.ts')), false)
})

test('[40-4] a file that one side changed is taken whole, one theirs added is added, and one theirs removed is removed', (t) => {
  const two = twoSides(
    t,
    { 'a.txt': 'a\n', 'b.txt': 'b\n', 'gone.txt': 'gone\n' },
    { 'a.txt': 'ours\n' },
    { 'b.txt': 'theirs\n', 'new.txt': 'new\n', 'gone.txt': null },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual(merged.clashes, [])
  assert.equal(readFileSync(join(two.project, 'a.txt'), 'utf8'), 'ours\n')
  assert.equal(readFileSync(join(two.project, 'b.txt'), 'utf8'), 'theirs\n')
  assert.equal(readFileSync(join(two.project, 'new.txt'), 'utf8'), 'new\n')
  assert.equal(existsSync(join(two.project, 'gone.txt')), false)
  assert.deepEqual(Object.keys(merged.point?.files ?? {}).sort(), ['a.txt', 'b.txt', 'new.txt'])
})

test('[40-4] two sides that changed the same lines of a text clash: ours stays, and the clash file holds both', (t) => {
  const two = twoSides(
    t,
    { 'notes.md': lines() },
    { 'notes.md': lines({ 5: 'ours five' }) },
    { 'notes.md': lines({ 5: 'theirs five' }) },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(readFileSync(join(two.project, 'notes.md'), 'utf8'), lines({ 5: 'ours five' }))
  assert.equal(merged.point?.unsettled, true)
  assert.deepEqual(merged.clashes, [
    { what: 'file', name: 'notes.md', ours: ['ours five'], theirs: ['theirs five'], base: ['line 5'] },
  ])
  assert.deepEqual(merged.point?.clashes, merged.clashes)
  const clash = readFileSync(join(two.project, 'tent.clash.ts'), 'utf8')
  assert.match(clash, /^\/\/ tent\.clash\.ts - written by `tent history merge`\./)
  assert.match(clash, /\/\/ 1\. file notes\.md: both changed lines 5 to 5/)
  assert.match(clash, /\/\* ours\n {2}ours five\ntheirs\n {2}theirs five\n\*\//)
  assert.equal(merged.point?.files?.['tent.clash.ts'], undefined, 'no point holds the clash file')
})

test('[40-4] a file that is no text, changed by both, clashes, and theirs is kept beside it as .theirs', (t) => {
  const bytes = (n: number): Uint8Array => new Uint8Array([0, 1, 2, n])
  const two = twoSides(
    t,
    { 'assets/logo.png': bytes(0) },
    { 'assets/logo.png': bytes(1) },
    { 'assets/logo.png': bytes(2) },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.deepEqual([...readFileSync(join(two.project, 'assets/logo.png'))], [0, 1, 2, 1])
  assert.deepEqual([...readFileSync(join(two.project, 'assets/logo.png.theirs'))], [0, 1, 2, 2])
  assert.equal(merged.point?.unsettled, true)
  const clash = readFileSync(join(two.project, 'tent.clash.ts'), 'utf8')
  assert.match(
    clash,
    /\/\/ 1\. file assets\/logo\.png: both changed it\. Theirs is kept beside it as assets\/logo\.png\.theirs/,
  )
  assert.equal(merged.point?.files?.['assets/logo.png.theirs'], undefined, 'no point holds a .theirs file')
})

test('[40-4] a file that one side removed and the other changed clashes, and ours stays', (t) => {
  const two = twoSides(t, { 'a.txt': 'a\n' }, { 'a.txt': null }, { 'a.txt': 'theirs\n' })
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(existsSync(join(two.project, 'a.txt')), false)
  assert.equal(readFileSync(join(two.project, 'a.txt.theirs'), 'utf8'), 'theirs\n')
  assert.match(readFileSync(join(two.project, 'tent.clash.ts'), 'utf8'), /file a\.txt: removed here, and changed there/)
  assert.equal(merged.point?.unsettled, true)
})

test('[40-4] dry answers the changes and the clashes of a merge, and changes nothing', (t) => {
  const two = twoSides(
    t,
    { 'notes.md': lines(), 'b.txt': 'b\n' },
    { 'notes.md': lines({ 5: 'ours five' }) },
    { 'notes.md': lines({ 5: 'theirs five' }), 'b.txt': 'theirs\n' },
  )
  const before = two.history.list().length
  const dry = two.history.merge(two.project, 'side', ada, { dry: true })
  assert.equal(dry.point, undefined)
  assert.equal(dry.clashes.length, 1)
  assert.deepEqual(
    dry.changes.map((one) => [one.change, one.what, one.name]),
    [['changed', 'file', 'b.txt']],
  )
  assert.equal(two.history.list().length, before)
  assert.equal(readFileSync(join(two.project, 'b.txt'), 'utf8'), 'b\n')
  assert.equal(existsSync(join(two.project, 'tent.clash.ts')), false)
  assert.equal(two.history.pointer('now'), two.ours)
})

test('[40-4] where ours is the point the two share, the merge is their point itself', (t) => {
  const { project, history } = started(t, { 'a.txt': 'a\n' })
  history.record(project, { by: ada, kind: 'save' })
  history.branch('side')
  history.switch(project, 'side', ada)
  put(project, 'a.txt', 'theirs\n')
  const theirs = history.record(project, { by: ada, kind: 'save' })
  history.switch(project, 'main', ada)
  const merged = history.merge(project, 'side', ada)
  assert.equal(merged.point?.id, theirs.id)
  assert.equal(history.pointer('main'), theirs.id)
  assert.equal(readFileSync(join(project, 'a.txt'), 'utf8'), 'theirs\n')
  assert.deepEqual(history.merge(project, 'side', ada), { changes: [], clashes: [] }, 'what is merged is merged once')
})

test('[40-4] [16-2@8c] settle is T9102 while the clash file or a .theirs file is there, and then records the settled point', (t) => {
  const bytes = (n: number): Uint8Array => new Uint8Array([0, n])
  const two = twoSides(
    t,
    { 'notes.md': lines(), 'logo.png': bytes(0) },
    { 'notes.md': lines({ 5: 'ours' }), 'logo.png': bytes(1) },
    { 'notes.md': lines({ 5: 'theirs' }), 'logo.png': bytes(2) },
  )
  const merged = two.history.merge(two.project, 'side', ada)
  assert.equal(
    codeOf(() => two.history.settle(two.project, ada)),
    'T9102',
  )
  rmSync(join(two.project, 'tent.clash.ts'))
  assert.equal(
    codeOf(() => two.history.settle(two.project, ada)),
    'T9102',
    'a .theirs file is still there',
  )
  rmSync(join(two.project, 'logo.png.theirs'))
  put(two.project, 'notes.md', lines({ 5: 'settled' }))
  const settled = two.history.settle(two.project, ada)
  assert.equal(settled.kind, 'merge')
  assert.deepEqual(settled.parents, [merged.point?.id])
  assert.equal(settled.unsettled, undefined)
  assert.equal(
    codeOf(() => two.history.settle(two.project, ada)),
    'T0013',
    'nothing is left to settle',
  )
})

test('[40-4] [16-2@8c] a side that is unsettled is not merged: T9101', (t) => {
  const two = twoSides(
    t,
    { 'notes.md': lines() },
    { 'notes.md': lines({ 5: 'ours' }) },
    { 'notes.md': lines({ 5: 'theirs' }) },
  )
  two.history.merge(two.project, 'side', ada)
  assert.equal(
    codeOf(() => two.history.merge(two.project, 'side', ada)),
    'T9101',
    'ours is unsettled',
  )
  assert.equal(
    codeOf(() => two.history.merge(two.project, 'nothing-of-the-kind', ada)),
    'T9107',
  )
})
