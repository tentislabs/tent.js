import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ada, codeOf, described, filesIn, fingerprintOf, heldIn, pointOf, put, started } from './work.ts'

const start = Date.UTC(2026, 9, 14)

test('[40-14a] a point holds no .git at any depth and in any case of its name, whatever leave names, and take refuses a path that holds one', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { project, history } = started(t, {
    'tent.ts': 'project\n',
    '.git/HEAD': 'ref\n',
    '.GIT/config': 'settings\n',
    'kits/one/.git/HEAD': 'ref\n',
    'kits/one/kit.ts': 'kit\n',
    'kits/two/.git': 'gitdir: elsewhere\n',
    '.gitignore': '.tent/\n',
  })
  // A project that states its own `leave` holds its packages, and still no `.git`.
  const point = history.record(project, {
    by: ada,
    kind: 'named',
    name: 'one',
    description: described({ history: { leave: ['*.log'] } }),
  })
  assert.deepEqual(Object.keys(point.files ?? {}), ['.gitignore', 'kits/one/kit.ts', 'tent.ts'])

  const bytes = new TextEncoder().encode('a hook')
  const print = fingerprintOf(bytes)
  for (const path of ['.git/hooks/post-commit', '.GIT/config', 'kits/one/.git/HEAD', 'kits/.Git']) {
    const sent = pointOf({ parents: [], at: start, by: ada, kind: 'named', name: 'sent', files: { [path]: print } })
    assert.equal(
      codeOf(() => history.take({ blobs: { [print]: bytes }, points: [sent] })),
      'T9107',
      path,
    )
  }
})

test('[40-3a] going back that would write over a file that no point holds is refused with T0013, which names each such file, before anything is recorded or written', (t) => {
  const { project, history } = started(t, { 'tent.ts': 'project\n', 'notes.log': 'old log', 'data.bin': 'small' })
  history.record(project, { by: ada, kind: 'named', name: 'old' })

  // From here on the project leaves its logs out, and `data.bin` is larger than a point holds.
  const rules = described({ history: { leave: ['*.log'] }, limits: { historyFileSize: 1024 } })
  put(project, 'notes.log', 'a log that no point holds')
  put(project, 'data.bin', 'x'.repeat(2000))
  put(project, 'tent.ts', 'project, changed\n')
  history.record(project, { by: ada, kind: 'named', name: 'later', description: rules })
  const before = { files: heldIn(project), points: history.list().length, now: history.pointer('now') }

  let refusal: unknown
  try {
    history.back(project, 'old', ada)
  } catch (error) {
    refusal = error
  }
  assert.equal(Reflect.get(Object(refusal), 'code'), 'T0013')
  const said = String(Reflect.get(Object(refusal), 'message'))
  assert.match(said, /data\.bin/)
  assert.match(said, /notes\.log/)
  assert.deepEqual(heldIn(project), before.files, 'no file of the project changed')
  assert.equal(history.list().length, before.points, 'no point was recorded')
  assert.equal(history.pointer('now'), before.now)

  // With the two files moved away, going back is taken, and going forward again leaves them away.
  rmSync(join(project, 'notes.log'))
  rmSync(join(project, 'data.bin'))
  history.back(project, 'old', ada)
  assert.equal(Buffer.from(filesIn(project)['data.bin'], 'hex').toString(), 'small')
})

// Windows refuses these signs in the name of a file: https://learn.microsoft.com/windows/win32/fileio/naming-a-file
const unwritable = [
  'logs/10:30.log',
  'what?.txt',
  'a<b>.txt',
  'say"so".txt',
  'pipe|d.txt',
  'star*.txt',
  'back\\slash.txt',
]

test('[40-14a] a file whose name not every system holds is not kept, and the note of the point names it once: going back, comparing and writing work', {
  todo:
    process.platform === 'win32'
      ? 'Windows makes no file of such a name, so none can be planted: owed to Linux and macOS'
      : false,
}, (t) => {
  const planted = Object.fromEntries(unwritable.map((path) => [path, 'a file\n']))
  const { project, history } = started(t, { 'tent.ts': 'project\n', 'kept.txt': 'kept\n', ...planted })
  const first = history.record(project, { by: ada, kind: 'named', name: 'first' })
  assert.deepEqual(Object.keys(first.files ?? {}), ['kept.txt', 'tent.ts'])
  for (const path of unwritable)
    assert.equal((first.note ?? '').split(path).length - 1, 1, `the note names ${path} once`)
  put(project, 'kept.txt', 'changed\n')
  const second = history.record(project, { by: ada, kind: 'named', name: 'second' })
  assert.doesNotThrow(() => history.compare(first.id, second.id))
  history.back(project, first.id, ada)
  assert.equal(readFileSync(join(project, 'kept.txt'), 'utf8'), 'kept\n')
  const written = join(project, '..', 'written')
  history.write(first.id, written)
  assert.deepEqual(Object.keys(filesIn(written)).sort(), ['kept.txt', 'tent.ts'])
})

test('[40-14a] take refuses a point that holds a file whose name not every system holds', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { history } = started(t)
  const bytes = new TextEncoder().encode('a file')
  const print = fingerprintOf(bytes)
  for (const path of unwritable) {
    const sent = pointOf({ parents: [], at: start, by: ada, kind: 'named', name: 'sent', files: { [path]: print } })
    assert.equal(
      codeOf(() => history.take({ blobs: { [print]: bytes }, points: [sent] })),
      'T9107',
      path,
    )
  }
})
