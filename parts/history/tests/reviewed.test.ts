import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ada, codeOf, described, fingerprintOf, heldIn, pointOf, put, started, workFolder } from './work.ts'

const start = Date.UTC(2026, 9, 14)

test('[40-3a] going back writes over no file that the present point does not hold: a file that grew past historyFileSize since the older point keeps its bytes, or going back is refused', (t) => {
  const { project, history } = started(t, { 'tent.ts': 'project\n', 'data.bin': 'small' })
  const rules = described({ limits: { historyFileSize: 1024 } })
  const old = history.record(project, { by: ada, kind: 'named', name: 'old', description: rules })
  assert.ok(old.files?.['data.bin'])

  // The file grows past the limit: no point holds it from here on, and its point names it in its note.
  const grown = 'x'.repeat(2000)
  put(project, 'data.bin', grown)
  put(project, 'tent.ts', 'project, changed\n')
  const later = history.record(project, { by: ada, kind: 'named', name: 'later', description: rules })
  assert.equal(later.files?.['data.bin'], undefined)
  assert.match(later.note ?? '', /data\.bin/)

  // "Going back can itself be undone" and "a file that no point holds is never touched" (`40`, section 2, going back).
  let refused = false
  try {
    history.back(project, 'old', ada)
  } catch {
    refused = true
  }
  if (!refused) history.back(project, 'later', ada)
  const left = existsSync(join(project, 'data.bin')) ? readFileSync(join(project, 'data.bin'), 'utf8').length : 0
  assert.equal(left, grown.length, 'the bytes that no point holds are gone after going back and forward again')
})

test('[16-2@7d] [40-14a] take refuses a path that leads into the engine own folder under another case of its name', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { history } = started(t)
  const bytes = new TextEncoder().encode('a file')
  const print = fingerprintOf(bytes)
  // Windows and macOS find `.tent` under each of these: a point that holds one writes into the engine's own folder.
  for (const path of ['.TENT/history.db', '.Tent/dev/data.db']) {
    const point = pointOf({ parents: [], at: start, by: ada, kind: 'named', name: 'sent', files: { [path]: print } })
    assert.equal(
      codeOf(() => history.take({ blobs: { [print]: bytes }, points: [point] })),
      'T9107',
      path,
    )
  }
})

test('[40-3a] going back writes no file through a link that stands in the folder of the project: what lies outside the project is untouched', (t) => {
  const { project, history } = started(t, { 'tent.ts': 'project\n', 'shared/notes.txt': 'old notes' })
  const old = history.record(project, { by: ada, kind: 'named', name: 'old' })
  assert.ok(old.files?.['shared/notes.txt'])

  // The folder is moved out of the project, and a link stands in its place: a link is no file of the folder, and
  // no point holds what lies behind it.
  const outside = join(workFolder(t), 'outside')
  mkdirSync(outside, { recursive: true })
  rmSync(join(project, 'shared'), { recursive: true })
  writeFileSync(join(outside, 'notes.txt'), 'notes of another program')
  try {
    symlinkSync(outside, join(project, 'shared'), 'junction')
  } catch (error) {
    t.diagnostic(
      `a link could not be made here, so it was not tried: ${error instanceof Error ? error.message : error}`,
    )
    return
  }
  const later = history.record(project, { by: ada, kind: 'named', name: 'later' })
  assert.equal(later.files?.['shared/notes.txt'], undefined, 'no point holds what lies behind a link')

  try {
    history.back(project, 'old', ada)
  } catch {
    // A refusal leaves everything as it was, which is right too.
  }
  assert.equal(readFileSync(join(outside, 'notes.txt'), 'utf8'), 'notes of another program')
})

test('[40-14a] a point holds no file of the git repository that the folder of the project is: going back leaves .git as it was', (t) => {
  // `40`, section 2, point 9: a project "may lie inside a git repository of the builder's own".
  const { project, history } = started(t, { 'tent.ts': 'project\n', '.git/HEAD': 'ref: refs/heads/main\n' })
  put(project, '.git/refs/heads/main', '1111111111111111111111111111111111111111\n')
  history.record(project, { by: ada, kind: 'named', name: 'old' })

  // The builder commits with git: the branch moves, and an object is added.
  put(project, '.git/refs/heads/main', '2222222222222222222222222222222222222222\n')
  put(project, '.git/objects/22/22222222222222222222222222222222222222', 'a commit')
  put(project, 'tent.ts', 'project, changed\n')
  history.record(project, { by: ada, kind: 'named', name: 'later' })

  history.back(project, 'old', ada)
  assert.equal(heldIn(project)['tent.ts'], Buffer.from('project\n').toString('hex'))
  assert.equal(
    readFileSync(join(project, '.git/refs/heads/main'), 'utf8'),
    '2222222222222222222222222222222222222222\n',
    'going back moved a branch of git',
  )
  assert.ok(
    existsSync(join(project, '.git/objects/22/22222222222222222222222222222222222222')),
    'a commit of git is gone',
  )
})

test('[40-14a] exportGit writes no file of a point into the .git folder of the export: a hook and a setting that a point holds are no hook and no setting of the export', (t) => {
  const { project, history } = started(t, { 'tent.ts': 'project\n' })
  put(project, '.git/hooks/post-commit', '#!/bin/sh\necho ran > "$(git rev-parse --show-toplevel)/hook-ran.txt"\n')
  put(project, '.git/config', '[core]\n\tmarker = of-the-point\n')
  history.record(project, { by: ada, kind: 'named', name: 'first' })
  const out = join(workFolder(t), 'export')
  try {
    history.exportGit(out)
  } catch {
    // An export that refuses such a point writes nothing of it, which is right too.
  }
  assert.ok(!existsSync(join(out, '.git', 'hooks', 'post-commit')), 'the export holds a hook that a point brought')
  const config = existsSync(join(out, '.git', 'config')) ? readFileSync(join(out, '.git', 'config'), 'utf8') : ''
  assert.doesNotMatch(config, /of-the-point/, 'the settings of the export are those of a point')
  assert.ok(!readdirSync(out).includes('hook-ran.txt'), 'a hook that a point brought was carried out')
})
