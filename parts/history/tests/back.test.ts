import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import type { Point, Writer } from '../index.ts'
import { openHistory } from '../index.ts'
import { ada, codeOf, filesIn, fingerprintOf, heldIn, openedIn, pointOf, put, started, workFolder } from './work.ts'
import { held } from '../../../rig/budgets.ts'

test('[40-3a] go back 1, 3 and 10 points and forward again: the files match byte for byte, and a file that no point holds is untouched', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 14) })
  const { project, history } = started(t, {
    'tent.ts': 'project 0\n',
    '.tent/engine.json': '{"port":3000}',
    'node_modules/pkg/index.js': 'a package',
    'assets/logo.png': new Uint8Array([137, 80, 78, 71, 0, 13, 10, 26]),
  })
  // Twelve points: each changes a file, and some add a file in a new folder, remove one, or write other line ends.
  const states: { point: Point; files: Record<string, string> }[] = []
  for (let n = 1; n <= 12; n++) {
    t.mock.timers.tick(60_000)
    put(project, 'tent.ts', `project ${n}\n`)
    put(project, `tables/t${n}.ts`, n % 2 ? `table ${n}\r\nsecond line\r\n` : `table ${n}\n`)
    if (n % 3 === 0) put(project, `screens/deep/s${n}/view.tsx`, `<span>${n}</span>`)
    if (n % 4 === 0) rmSync(join(project, `tables/t${n - 1}.ts`))
    if (n === 7) put(project, 'assets/logo.png', new Uint8Array([1, 2, 3, 0, 255]))
    if (n === 9) rmSync(join(project, 'screens/deep/s3'), { recursive: true })
    const point = history.record(project, { by: ada, kind: n % 5 === 0 ? 'named' : 'command', name: `p${n}` })
    states.push({ point, files: heldIn(project) })
  }
  const untouched = () => ({
    engine: filesIn(join(project, '.tent'))['engine.json'],
    pkg: filesIn(join(project, 'node_modules'))['pkg/index.js'],
  })
  const kept = untouched()
  const newest = states[11]

  for (const steps of [1, 3, 10]) {
    const old = states[11 - steps]
    const count = history.list().length
    const back = history.back(project, old.point.id, { kind: 'tool', id: 'history' })
    assert.deepEqual(heldIn(project), old.files, `${steps} points back`)
    assert.deepEqual(untouched(), kept)
    assert.equal(back.kind, 'back')
    assert.deepEqual(back.by, { kind: 'tool', id: 'history' })
    assert.deepEqual(back.files, old.point.files)
    // The present was recorded first, and the back point stands on it: nothing of the history is cut off.
    const present = history.read(back.parents[0])
    assert.equal(back.parents.length, 1)
    assert.deepEqual(present?.files, newest.point.files)
    assert.equal(history.list().length, count + 2)
    assert.equal(history.pointer('now'), back.id)

    // Forward again: going back to the present that was recorded undoes the going back.
    assert.ok(present)
    history.back(project, present.id, ada)
    assert.deepEqual(heldIn(project), newest.files, `forward again after ${steps} points back`)
    assert.deepEqual(untouched(), kept)
  }
  // A folder that going back emptied is gone, and a file that was written by hand since is in the recorded present.
  assert.ok(!existsSync(join(project, 'screens/deep/s3')))
  put(project, 'notes.txt', 'not recorded yet')
  const back = history.back(project, states[0].point.id, ada)
  assert.ok(!existsSync(join(project, 'notes.txt')))
  assert.equal(history.read(back.parents[0])?.files?.['notes.txt'], fingerprintOf('not recorded yet'))
  assert.ok(!existsSync(join(project, 'screens')), 'the folders of the files that went are gone with them')
})

test('[40-3a] going back writes each file that differs and no other, and what it names may be anything that find takes', (t) => {
  const { project, history } = started(t, { 'tent.ts': 'one', 'same.txt': 'the same in both' })
  history.record(project, { by: ada, kind: 'named', name: 'first' })
  put(project, 'tent.ts', 'two')
  history.record(project, { by: ada, kind: 'command' })
  // A file that does not differ is not written: its moment stays what it was.
  const same = join(project, 'same.txt')
  const long = new Date(Date.UTC(2020, 0, 1))
  utimesSync(same, long, long)
  history.back(project, 'first', ada)
  assert.equal(filesIn(project)['tent.ts'], Buffer.from('one').toString('hex'))
  assert.equal(statSync(same).mtimeMs, long.getTime())
  assert.equal(
    codeOf(() => history.back(project, 'no such name', ada)),
    'T9107',
  )
})

test('[40-3a] a history of 10,000 points still opens, finds a point and lists its newest ones within a second', (t) => {
  const folder = workFolder(t)
  const making = openHistory(folder)
  const files: Record<string, string> = {}
  const blobs: Record<string, Uint8Array> = {}
  for (let n = 0; n < 40; n++) {
    const bytes = new TextEncoder().encode(`file ${n}\n`)
    files[`tables/t${n}.ts`] = fingerprintOf(bytes)
    blobs[fingerprintOf(bytes)] = bytes
  }
  const points: Point[] = []
  let parent: string[] = []
  for (let n = 0; n < 10_000; n++) {
    const bytes = new TextEncoder().encode(`project ${n}\n`)
    blobs[fingerprintOf(bytes)] = bytes
    const point = pointOf({
      parents: parent,
      at: 1_790_000_000_000 + n * 60_000,
      by: ada,
      kind: n % 100 === 0 ? 'named' : 'command',
      ...(n % 100 === 0 ? { name: `n${n}` } : {}),
      files: { ...files, 'tent.ts': fingerprintOf(bytes) },
    })
    points.push(point)
    parent = [point.id]
  }
  making.take({ blobs, points })
  making.move('now', points[9_999].id)
  making.close()

  const began = performance.now()
  const history = openedIn(folder)
  const now = history.find('now')
  const old = history.find(points[17].id.slice(0, 12))
  const named = history.find('n5000')
  const newest = history.list({ newest: 20 })
  const took = performance.now() - began
  assert.equal(now?.id, points[9_999].id)
  assert.equal(old?.id, points[17].id)
  assert.equal(named?.id, points[5_000].id)
  assert.deepEqual(
    newest.map((one) => one.id),
    points
      .slice(-20)
      .reverse()
      .map((one) => one.id),
  )
  held('history.newest', took, 'ms')
  assert.equal(history.list().length, 10_000)
  assert.equal(history.list({ kinds: ['named'] }).length, 100)
})

test('[40-14a] exportGit writes one commit for each named point, oldest first, with its writer as the author, and a later export adds the newer points', (t) => {
  // The commits are made with the settings of nobody: a setting of this computer would sign them or name a hook.
  const settings = join(workFolder(t), 'gitconfig')
  writeFileSync(settings, '')
  const before = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM }
  process.env.GIT_CONFIG_GLOBAL = settings
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  t.after(() => {
    for (const [name, value] of [
      ['GIT_CONFIG_GLOBAL', before.global],
      ['GIT_CONFIG_NOSYSTEM', before.system],
    ] as const)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  })
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 14, 9, 0, 0) })
  const { project, history } = started(t, { 'tent.ts': 'project 0', 'tables/gone.ts': 'gone later' })
  const record = (kind: 'named' | 'save' | 'command' | 'back', n: number, by: Writer = ada) => {
    t.mock.timers.tick(60_000)
    put(project, 'tent.ts', `project ${n}`)
    return history.record(project, { by, kind, ...(kind === 'named' ? { name: `release ${n}` } : {}) })
  }
  record('named', 1)
  record('save', 2)
  rmSync(join(project, 'tables/gone.ts'))
  put(project, 'tables/new.ts', 'new')
  record('command', 3)
  record('named', 4, { kind: 'ai' })
  const out = join(workFolder(t), 'export')
  assert.deepEqual(history.exportGit(out), { commits: 2 })
  const git = (...words: string[]) => {
    const ended = spawnSync('git', words, { cwd: out, encoding: 'utf8' })
    assert.equal(ended.status, 0, ended.stderr)
    return ended.stdout.trim().split('\n')
  }
  assert.deepEqual(git('log', '--reverse', '--format=%s|%an|%at'), [
    `release 1|person ada|${Date.UTC(2026, 9, 14, 9, 1, 0) / 1000}`,
    `release 4|ai|${Date.UTC(2026, 9, 14, 9, 4, 0) / 1000}`,
  ])
  const written = () => Object.fromEntries(Object.entries(filesIn(out)).filter(([path]) => !path.startsWith('.git/')))
  assert.deepEqual(written(), heldIn(project))
  assert.deepEqual(git('show', '--name-status', '--format=', 'HEAD'), [
    'D\ttables/gone.ts',
    'A\ttables/new.ts',
    'M\ttent.ts',
  ])

  // A later export adds the points that came after the newest one it wrote, of the kinds that are named.
  record('named', 5)
  record('back', 6)
  assert.deepEqual(history.exportGit(out), { commits: 1 })
  assert.deepEqual(history.exportGit(out), { commits: 0 })
  assert.deepEqual(history.exportGit(out, { kinds: ['named', 'back', 'save'] }), { commits: 1 })
  assert.deepEqual(git('log', '--format=%s'), ['back', 'release 5', 'release 4', 'release 1'])
  assert.deepEqual(written(), heldIn(project))
  assert.equal(git('status', '--porcelain').join(''), '', 'the folder holds the files of its newest commit')
  const wide = join(workFolder(t), 'wide')
  assert.deepEqual(history.exportGit(wide, { kinds: ['named', 'save'] }), { commits: 4 })

  // A folder that holds something else is no place for an export.
  const taken = join(workFolder(t), 'taken')
  put(taken, 'notes.txt', 'a file of somebody')
  assert.equal(
    codeOf(() => history.exportGit(taken)),
    'T0013',
  )
  assert.deepEqual(Object.keys(filesIn(taken)), ['notes.txt'])
})

test('[40-1] [night] killed during a save a thousand times, history.db always opens and its last point is whole', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'save.ts')
  // Four histories are killed side by side, 250 times each: the thousand kills then take a quarter of the time.
  const folders = [workFolder(t), workFolder(t), workFolder(t), workFolder(t)]
  const all = await Promise.all(
    folders.map((folder) => runKilled(program, { times: 250, when: 'mid', args: [folder] })),
  )
  let inSave = 0
  for (const killed of all) {
    assert.equal(killed.kills, 250)
    assert.equal(killed.ended.length, 250)
    for (const [round, one] of killed.ended.entries()) {
      // Each start holds the file against the rule before it saves, and ends with 3 where it does not hold.
      assert.equal(one.code, 0, `seed ${killed.seed}, round ${round}: ${one.out}`)
      const found = /^whole at save \d+ of \d+ begun: the last save was (cut|kept)$/m.exec(one.out)
      assert.ok(found, `seed ${killed.seed}, round ${round}: ${one.out}`)
      if (found[1] === 'cut') inSave++
    }
  }
  // The kill is of use only where it arrives while a save is written: most of them must have.
  assert.ok(inSave >= 800, `${inSave} of 1000 kills arrived in the middle of a save`)
  for (const folder of folders) {
    const history = openHistory(join(folder, '.tent'))
    try {
      const now = history.find('now')
      assert.ok(now?.files)
      for (const print of Object.values(now.files)) assert.equal(fingerprintOf(history.blob(print) ?? ''), print)
    } finally {
      history.close()
    }
  }
})
