import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import {
  ada,
  codeOf,
  day,
  described,
  filesIn,
  fingerprintOf,
  idOf,
  openedIn,
  pointOf,
  put,
  started,
  workFolder,
} from './work.ts'

const start = Date.UTC(2026, 9, 14, 9, 0, 0)

/** Sets the clock of a test, which `Date.now` then reads. Answers what moves it on. */
function clockOf(t: TestContext, now = start): (ms: number) => void {
  t.mock.timers.enable({ apis: ['Date'], now })
  return (ms) => t.mock.timers.tick(ms)
}

test('[40-14a] a point holds every file of the project by its path and its fingerprint, with its writer, its kind and its moment, and its parent is the point before', (t) => {
  clockOf(t)
  const { project, history } = started(t, { 'tent.ts': 'the project\n', 'tables/orders.ts': 'orders\r\n' })
  const first = history.record(project, { by: ada, kind: 'command' })
  assert.deepEqual(first.files, {
    'tables/orders.ts': fingerprintOf('orders\r\n'),
    'tent.ts': fingerprintOf('the project\n'),
  })
  assert.deepEqual(
    { at: first.at, by: first.by, kind: first.kind, parents: first.parents },
    { at: start, by: ada, kind: 'command', parents: [] },
  )
  assert.equal(first.id, idOf(first))
  assert.deepEqual(history.read(first.id), first)
  assert.deepEqual(new TextDecoder().decode(history.blob(fingerprintOf('orders\r\n'))), 'orders\r\n')
  assert.equal(history.blob(fingerprintOf('no such bytes')), undefined)
  assert.equal(history.read('0'.repeat(32)), undefined)

  put(project, 'tent.ts', 'the project, changed\n')
  const second = history.record(project, {
    by: { kind: 'tool' },
    kind: 'named',
    name: 'first release',
    note: 'by hand',
  })
  assert.deepEqual(second.parents, [first.id])
  assert.deepEqual(second.by, { kind: 'tool' })
  assert.equal(second.name, 'first release')
  assert.equal(second.note, 'by hand')
  assert.equal(second.files?.['tent.ts'], fingerprintOf('the project, changed\n'))
  assert.equal(second.id, idOf(second))
  assert.equal(history.pointer('now'), second.id)
})

test('[40-14a] no point holds the engine own folder, the clash file, a file that ends in .theirs, what leave names, or a file over historyFileSize, which its note names', (t) => {
  clockOf(t)
  const { project, history } = started(t, {
    'tent.ts': 'project',
    '.tent/engine.json': '{}',
    'tent.clash.ts': 'clash',
    'assets/logo.png.theirs': 'theirs',
    'node_modules/pkg/index.js': 'code',
    'tools/node_modules/pkg/index.js': 'code',
    'debug.log': 'a log',
    'logs/deep.log': 'a log',
    'tmp/a.txt': 'kept out',
    'notes/tmp/b.txt': 'kept out',
    'build/out/c.txt': 'kept out',
    'notes/build/out/d.txt': 'held',
    'big.bin': new Uint8Array(1025),
    'small.bin': new Uint8Array(1024),
  })
  // With nothing stated, the packages are left out and nothing else of the project is.
  const plain = history.record(project, { by: ada, kind: 'command' })
  assert.deepEqual(Object.keys(plain.files ?? {}), [
    'big.bin',
    'build/out/c.txt',
    'debug.log',
    'logs/deep.log',
    'notes/build/out/d.txt',
    'notes/tmp/b.txt',
    'small.bin',
    'tent.ts',
    'tmp/a.txt',
  ])
  assert.equal(plain.note, undefined)

  // What the project states takes the place of the default: a folder at any depth, a name with a star, and a path.
  const description = described({
    history: { leave: ['tmp/', '*.log', 'build/out/'] },
    limits: { historyFileSize: '1 KB' },
  })
  const stated = history.record(project, { by: ada, kind: 'command', description, note: 'checked by hand' })
  assert.deepEqual(Object.keys(stated.files ?? {}), [
    'node_modules/pkg/index.js',
    'notes/build/out/d.txt',
    'small.bin',
    'tent.ts',
    'tools/node_modules/pkg/index.js',
  ])
  assert.match(stated.note ?? '', /^checked by hand\n/)
  assert.match(stated.note ?? '', /big\.bin/)
  assert.ok(stated.description, 'a point that built keeps its description')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(history.blob(stated.description))).project, description.project)

  // A command with no build at hand reads `leave` from the description of the last build that worked.
  const after = history.record(project, { by: ada, kind: 'command' })
  assert.deepEqual(Object.keys(after.files ?? {}), Object.keys(stated.files ?? {}))
  assert.equal(after.description, undefined)
})

test('[40-14a] a file of a root is held as roots/<its place>/<its path there>, and is written back into its root', (t) => {
  clockOf(t)
  const { project, history } = started(t, { 'tent.ts': 'project' }, 'app')
  const shared = join(project, '..', 'shared')
  put(shared, 'money/format.ts', 'shared code')
  const description = described({ roots: ['../shared'] })
  const point = history.record(project, { by: ada, kind: 'command', description })
  assert.deepEqual(Object.keys(point.files ?? {}), ['roots/0/money/format.ts', 'tent.ts'])

  put(shared, 'money/format.ts', 'shared code, changed')
  put(shared, 'money/new.ts', 'new')
  history.record(project, { by: ada, kind: 'command', description })
  history.back(project, point.id, ada)
  assert.deepEqual(filesIn(shared), { 'money/format.ts': Buffer.from('shared code').toString('hex') })
})

test('[40-14a] the same files give the same id on two systems', (t) => {
  clockOf(t, 1_790_000_000_000)
  const { project, history } = started(t, { 'a.txt': 'a\n', 'folder/b.txt': 'b\r\n' })
  const point = history.record(project, { by: { kind: 'person', id: 'u1' }, kind: 'named', name: 'first' })
  const a = '87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7'
  const b = '679e273f78fc8f8ba114db23c2dce80cc77c91083939825ca830152f2f080d08'
  assert.deepEqual(
    point.files,
    { 'a.txt': a, 'folder/b.txt': b },
    'the bytes are taken as they are, line ends among them',
  )
  // The record that the id is taken over, written out: its keys in order, no spaces, and no field that is not set.
  const record = `{"at":1790000000000,"by":{"id":"u1","kind":"person"},"files":{"a.txt":"${a}","folder/b.txt":"${b}"},"kind":"named","name":"first","parents":[]}`
  assert.equal(point.id, fingerprintOf(record).slice(0, 32))
  assert.equal(point.id, '1e201154201875ad3b445f8082ae917a')
  assert.equal(point.id.length, 32)
})

test('[40-14a] mark writes checked, a description and a note onto a point, and its id stays', (t) => {
  clockOf(t)
  const { project, history } = started(t, { 'tent.ts': 'project' })
  const point = history.record(project, { by: ada, kind: 'save', checked: false })
  assert.equal(point.checked, false)
  history.mark(point.id, { checked: true, note: 'passed here', description: described({ title: 'Shop' }) })
  const marked = history.read(point.id)
  assert.equal(marked?.id, point.id)
  assert.equal(marked?.checked, true)
  assert.equal(marked?.note, 'passed here')
  assert.ok(marked?.description)
  assert.equal(JSON.parse(new TextDecoder().decode(history.blob(marked.description))).project.title, 'Shop')
  assert.equal(idOf(marked), point.id, 'none of the three is part of the id')
  // A mark that names one thing leaves the other two.
  history.mark('now', { checked: false })
  assert.deepEqual(
    { checked: history.read(point.id)?.checked, note: history.read(point.id)?.note },
    { checked: false, note: 'passed here' },
  )
})

test('[16-2@7d] [40-14a] a point that is not there is T9107 for mark, back, write and move', (t) => {
  clockOf(t)
  const { project, history } = started(t, { 'tent.ts': 'project' })
  history.record(project, { by: ada, kind: 'save' })
  const missing = 'f'.repeat(32)
  assert.equal(
    codeOf(() => history.mark(missing, { checked: true })),
    'T9107',
  )
  assert.equal(
    codeOf(() => history.back(project, missing, ada)),
    'T9107',
  )
  assert.equal(
    codeOf(() => history.write(missing, join(project, '..', 'out'))),
    'T9107',
  )
  assert.equal(
    codeOf(() => history.move('at:https://shop.example.com', missing)),
    'T9107',
  )
  assert.ok(!existsSync(join(project, '..', 'out')))
})

test('[40-14a] a point of the kind command is never joined, and a save within historyJoin of the save that is its parent takes its place', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0' })
  const change = (n: number) => put(project, 'tent.ts', String(n))
  const c1 = history.record(project, { by: ada, kind: 'command' })
  change(1)
  const c2 = history.record(project, { by: ada, kind: 'command' })
  assert.deepEqual(c2.parents, [c1.id])
  change(2)
  const s1 = history.record(project, { by: ada, kind: 'save' })
  assert.deepEqual(s1.parents, [c2.id], 'a save after a command is a point of its own')
  pass(4000)
  change(3)
  const s2 = history.record(project, { by: ada, kind: 'save' })
  assert.deepEqual(s2.parents, [c2.id], 'the second save stands where the first stood')
  assert.equal(history.read(s1.id), undefined)
  assert.deepEqual(
    history.list().map((one) => one.id),
    [s2.id, c2.id, c1.id],
  )
  pass(5001)
  change(4)
  const s3 = history.record(project, { by: ada, kind: 'save' })
  assert.deepEqual(s3.parents, [s2.id], 'a save after the time is a point of its own')

  // A save that a pointer names stays, and so does the state before a command.
  history.move('at:https://shop.example.com', s3.id)
  pass(1000)
  change(5)
  const s4 = history.record(project, { by: ada, kind: 'save' })
  assert.deepEqual(s4.parents, [s3.id])
  pass(1000)
  change(6)
  const c3 = history.record(project, { by: ada, kind: 'command' })
  assert.deepEqual(c3.parents, [s4.id], 'a command takes no place')
  assert.ok(history.read(s4.id))

  // The time is the project's own where its description states one.
  pass(60_000)
  change(7)
  const description = described({ limits: { historyJoin: '1 minute' } })
  const s5 = history.record(project, { by: ada, kind: 'save', description })
  pass(30_000)
  change(8)
  const s6 = history.record(project, { by: ada, kind: 'save', description })
  assert.deepEqual(s6.parents, s5.parents)
  assert.equal(history.read(s5.id), undefined)
})

test('[40-14a] find takes now, a pointer, a name and the first 8 or more characters of an id, in that order, and list goes along the first parents, newest first', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0' })
  const made = ['command', 'named', 'save', 'named', 'command'].map((kind, n) => {
    pass(10_000)
    put(project, 'tent.ts', String(n))
    return history.record(project, {
      by: ada,
      kind: kind === 'named' ? 'named' : kind === 'save' ? 'save' : 'command',
      ...(kind === 'named' ? { name: 'release' } : {}),
    })
  })
  assert.equal(history.find('now')?.id, made[4].id)
  history.move('at:https://shop.example.com', made[0].id)
  assert.equal(history.find('at:https://shop.example.com')?.id, made[0].id)
  assert.equal(history.find('release')?.id, made[3].id, 'of two points with one name the newest is found')
  assert.equal(history.find(made[2].id.slice(0, 8))?.id, made[2].id)
  assert.equal(history.find(made[2].id)?.id, made[2].id)
  assert.equal(history.find(made[2].id.slice(0, 7)), undefined)
  assert.equal(history.find('no such word'), undefined)
  // A pointer is tried before a name.
  history.move('release', made[1].id)
  assert.equal(history.find('release')?.id, made[1].id)

  assert.deepEqual(
    history.list().map((one) => one.id),
    made.map((one) => one.id).reverse(),
  )
  assert.deepEqual(
    history.list({ kinds: ['named', 'save'] }).map((one) => one.id),
    [made[3].id, made[2].id, made[1].id],
  )
  assert.deepEqual(
    history.list({ newest: 2 }).map((one) => one.id),
    [made[4].id, made[3].id],
  )
  assert.deepEqual(
    history.list({ pointer: 'release' }).map((one) => one.id),
    [made[1].id, made[0].id],
  )
  assert.deepEqual(history.list({ pointer: 'no such pointer' }), [])
  assert.deepEqual(history.pointers(), {
    'at:https://shop.example.com': made[0].id,
    now: made[4].id,
    release: made[1].id,
  })
  // The branch that `on` names follows `now`.
  history.move('main', made[4].id)
  history.move('on', 'main')
  pass(10_000)
  put(project, 'tent.ts', 'on main')
  const next = history.record(project, { by: ada, kind: 'command' })
  assert.equal(history.pointer('main'), next.id)
  assert.equal(history.pointer('now'), next.id)
  assert.equal(history.pointer('no such pointer'), undefined)
})

test('[40-14a] a save point older than its time is dropped, keeps its row, and its child still names it; a named one stays, and so does one a pointer stands on', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0', 'kept.txt': 'in every point' })
  const record = (kind: 'save' | 'command' | 'named', n: number) => {
    pass(10_000)
    put(project, 'tent.ts', String(n))
    return history.record(project, { by: ada, kind, ...(kind === 'named' ? { name: `n${n}` } : {}), note: 'a note' })
  }
  const c1 = record('command', 1)
  const s1 = record('save', 2)
  const n1 = record('named', 3)
  const s2 = record('save', 4)
  history.move('at:https://shop.example.com', s2.id)
  const s3 = record('save', 5)

  assert.deepEqual(history.tidy(Date.now(), { kept: 30 * day }), { points: 0, blobs: 0 }, 'nothing is old yet')
  pass(31 * day)
  assert.deepEqual(history.tidy(Date.now(), { kept: 30 * day }), { points: 2, blobs: 2 })

  for (const dropped of [c1, s1]) {
    const row = history.read(dropped.id)
    assert.deepEqual(row?.parents, dropped.parents)
    assert.equal(row?.id, dropped.id)
    assert.equal(row?.files, undefined)
    assert.equal(row?.note, undefined)
    assert.equal(row?.description, undefined)
  }
  assert.deepEqual(history.read(n1.id), n1, 'a named point is never dropped')
  assert.deepEqual(history.read(n1.id)?.parents, [s1.id], 'the child still names the dropped point')
  assert.deepEqual(history.read(s2.id), s2, 'a point that a pointer stands on stays')
  assert.deepEqual(history.read(s3.id), s3, 'the point that now stands on stays')
  // A blob that no point names any more is removed, and one that a kept point names stays.
  assert.equal(history.blob(fingerprintOf('1')), undefined)
  assert.equal(history.blob(fingerprintOf('2')), undefined)
  assert.ok(history.blob(fingerprintOf('3')))
  assert.ok(history.blob(fingerprintOf('in every point')))
  assert.deepEqual(
    history.list().map((one) => one.id),
    [s3.id, s2.id, n1.id, s1.id, c1.id],
    'the chain holds',
  )
  assert.deepEqual(history.tidy(Date.now(), { kept: 30 * day }), { points: 0, blobs: 0 }, 'a second tidy finds nothing')
})

test('[16-2@7d] [40-14a] a dropped point is taken by another history, and going back to it and writing it is T9107', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0' })
  const old = history.record(project, { by: ada, kind: 'save' })
  pass(31 * day)
  put(project, 'tent.ts', '1')
  const named = history.record(project, { by: ada, kind: 'named', name: 'kept', checked: true })
  assert.equal(history.tidy(Date.now(), { kept: 30 * day }).points, 1)

  const other = started(t, { 'tent.ts': 'another computer' }, 'other')
  const dropped = history.read(old.id)
  assert.ok(dropped && !dropped.files)
  const blobs = Object.fromEntries(
    Object.values(named.files ?? {}).map((print) => [print, history.blob(print) ?? new Uint8Array()]),
  )
  other.history.take({ points: [dropped, named], blobs })
  assert.deepEqual(other.history.read(old.id), dropped)
  assert.deepEqual(other.history.read(named.id)?.parents, [old.id])
  assert.equal(other.history.read(named.id)?.checked, undefined, 'a point that came by take is stored with no checked')

  assert.equal(
    codeOf(() => other.history.back(other.project, old.id, ada)),
    'T9107',
  )
  assert.equal(
    codeOf(() => other.history.write(old.id, join(other.project, '..', 'out'))),
    'T9107',
  )
  assert.deepEqual(filesIn(other.project)['tent.ts'], Buffer.from('another computer').toString('hex'))
  assert.equal(
    codeOf(() => history.back(project, old.id, ada)),
    'T9107',
  )
})

test('[40-14a] the point two branches share outlives its time', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0' })
  const record = (n: number) => {
    pass(10_000)
    put(project, 'tent.ts', String(n))
    return history.record(project, { by: ada, kind: 'save' })
  }
  const before = record(1)
  const shared = record(2)
  const ours = record(3)
  history.move('main', ours.id)
  // The other branch goes on from the shared point: a point of another computer, which names it as its parent.
  const theirs = pointOf({ parents: [shared.id], at: Date.now(), by: ada, kind: 'save', files: shared.files })
  history.take({ points: [theirs] })
  history.move('feature', theirs.id)

  pass(31 * day)
  assert.equal(history.tidy(Date.now(), { kept: 30 * day }).points, 1)
  assert.equal(history.read(before.id)?.files, undefined, 'the point before the shared one is dropped')
  assert.deepEqual(history.read(shared.id), shared, 'a merge compares with the shared point')
  assert.ok(history.blob(fingerprintOf('2')))

  // With the branch gone, the point is one more old save.
  history.move('feature', ours.id)
  assert.equal(history.tidy(Date.now(), { kept: 30 * day }).points, 2)
  assert.equal(history.read(shared.id)?.files, undefined)
  assert.equal(history.read(theirs.id)?.files, undefined)
})

test('[40-14a] have says which points and blobs are here, and take stores what another history sends, so that each history writes the same files', (t) => {
  const pass = clockOf(t)
  const { project, history } = started(t, { 'tent.ts': '0', 'assets/logo.png': new Uint8Array([0, 255, 10, 13]) })
  const description = described({ title: 'Shop' })
  const points = [1, 2, 3].map((n) => {
    pass(10_000)
    put(project, `tables/t${n}.ts`, `table ${n}`)
    return history.record(project, { by: ada, kind: 'named', name: `n${n}`, checked: true, description })
  })
  const far = openedIn(join(workFolder(t), 'far'))

  // Only what the other side lacks is sent: first two points, then the third.
  const send = (ids: string[]) => {
    const sent = ids.map((id) => history.read(id)).filter((one) => one !== undefined)
    const prints = sent.flatMap((one) => [
      ...Object.values(one.files ?? {}),
      ...(one.description ? [one.description] : []),
    ])
    const here = far.have({ points: ids, blobs: prints })
    const blobs = Object.fromEntries(
      [...new Set(prints)]
        .filter((print) => !here.blobs.includes(print))
        .map((print) => [print, history.blob(print) ?? new Uint8Array()]),
    )
    far.take({ blobs, points: sent.filter((one) => !here.points.includes(one.id)) })
    return { points: sent.length - here.points.length, blobs: Object.keys(blobs).length }
  }
  assert.deepEqual(send([points[0].id, points[1].id]), { points: 2, blobs: 5 })
  assert.deepEqual(send(points.map((one) => one.id)), { points: 1, blobs: 1 })
  assert.deepEqual(send(points.map((one) => one.id)), { points: 0, blobs: 0 })
  assert.deepEqual(far.have({ points: [points[0].id, 'f'.repeat(32)], blobs: [fingerprintOf('0'), 'e'.repeat(64)] }), {
    points: [points[0].id],
    blobs: [fingerprintOf('0')],
  })

  for (const point of points) {
    const { checked: _, ...sent } = point
    assert.deepEqual(far.read(point.id), sent)
  }
  assert.equal(far.pointer('now'), undefined, 'take moves no pointer')
  const [here, there] = [join(workFolder(t), 'here'), join(workFolder(t), 'there')]
  history.write(points[2].id, here)
  far.write(points[2].id, there)
  assert.deepEqual(filesIn(there), filesIn(here))
  assert.deepEqual(Object.keys(filesIn(here)), [
    'assets/logo.png',
    'tables/t1.ts',
    'tables/t2.ts',
    'tables/t3.ts',
    'tent.ts',
  ])
  assert.equal(filesIn(here)['assets/logo.png'], '00ff0a0d')
})

test('[16-2@7d] [40-14a] take checks every fingerprint and every id: a blob whose bytes differ, a point whose id does not fit, one whose parent or whose file is not here, and one with a path that leaves the folder are T9107, and nothing of that take is stored', (t) => {
  clockOf(t)
  const { history } = started(t)
  const bytes = new TextEncoder().encode('a file')
  const print = fingerprintOf(bytes)
  const good = pointOf({ parents: [], at: start, by: ada, kind: 'named', name: 'good', files: { 'a.txt': print } })
  const refused = (o: Parameters<typeof history.take>[0]) => {
    assert.equal(
      codeOf(() => history.take(o)),
      'T9107',
    )
    assert.deepEqual(history.have({ points: [good.id], blobs: [print] }), { points: [], blobs: [] })
  }
  refused({ blobs: { [print]: new TextEncoder().encode('other bytes') } })
  refused({ blobs: { [print]: bytes }, points: [{ ...good, name: 'renamed' }] })
  refused({ blobs: { [print]: bytes }, points: [{ ...good, at: start + 1 }] })
  refused({ points: [good] })
  refused({
    blobs: { [print]: bytes },
    points: [pointOf({ parents: ['a'.repeat(32)], at: start, by: ada, kind: 'save', files: { 'a.txt': print } })],
  })
  for (const path of [
    '../a.txt',
    '/a.txt',
    'a/../../b.txt',
    'a\\b.txt',
    'C:/a.txt',
    '.tent/history.db',
    'a//b.txt',
    '',
  ])
    refused({
      blobs: { [print]: bytes },
      points: [good, pointOf({ parents: [good.id], at: start, by: ada, kind: 'save', files: { [path]: print } })],
    })

  history.take({ blobs: { [print]: bytes }, points: [good] })
  assert.deepEqual(history.read(good.id), good)
  // A child may stand before its parent in what is sent.
  const child = pointOf({ parents: [good.id], at: start + 1, by: ada, kind: 'save', files: {} })
  const grandchild = pointOf({ parents: [child.id], at: start + 2, by: ada, kind: 'save', files: {} })
  history.take({ points: [grandchild, child] })
  assert.deepEqual(history.read(grandchild.id)?.parents, [child.id])
  // A point that is here is left as it is: what this computer found of it stays.
  history.mark(good.id, { checked: true })
  history.take({ points: [good] })
  assert.equal(history.read(good.id)?.checked, true)
})

test('[40-14a] the history is one file, history.db, in the folder it was opened in, and it opens again with every point', (t) => {
  clockOf(t)
  const { project, history, data } = started(t, { 'tent.ts': 'project' })
  assert.ok(existsSync(join(data, 'history.db')))
  const point = history.record(project, { by: ada, kind: 'named', name: 'kept' })
  history.close()
  const again = openedIn(data)
  assert.deepEqual(again.find('now'), point)
  assert.deepEqual(again.find('kept'), point)
  // Losing the file loses the history and never the project: a new one starts at the files as they are.
  again.close()
  for (const file of ['history.db', 'history.db-wal', 'history.db-shm']) rmSync(join(data, file), { force: true })
  mkdirSync(data, { recursive: true })
  const fresh = openedIn(data)
  assert.equal(fresh.find('now'), undefined)
  assert.deepEqual(fresh.record(project, { by: ada, kind: 'command' }).parents, [])
})
