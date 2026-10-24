import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { npm } from '../../build/index.ts'
import { root, typed } from './typed.ts'

/** What `tent history --json` lists of a project: the kind of each point and how many files it holds, newest first. */
async function listed(project: string): Promise<{ id: string; kind: string; files: number }[]> {
  const answered = await typed(project, 'history', '--json')
  assert.equal(answered.ended, 0, answered.printed)
  return Object(answered.answer.value).points
}

test('[40-14b] [15-6@7d] tent new records the first point of the project once its files are written, and tent add records one point before it installs and one after', async (t) => {
  const folder = join(root, 'results', 'cli', 'history-commands')
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))

  const made = await typed(folder, 'new', 'shop', '--json')
  assert.equal(made.ended, 0, made.printed)
  const project = join(folder, 'shop')
  const files = Object(made.answer.value).files.length
  const first = await listed(project)
  assert.deepEqual(
    first.map((one) => [one.kind, one.files]),
    [['command', files]],
    'one point, which holds every file that tent new wrote',
  )

  // A package of the test's own, packed as a registry hands one out: installing it reaches no network.
  const source = join(folder, 'marker')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'marker', version: '1.0.0', main: 'index.js' }))
  writeFileSync(join(source, 'index.js'), "module.exports = 'marked'\n")
  const packed = npm(folder, ['pack', source, '--pack-destination', folder])
  assert.equal(packed.status, 0, packed.said)
  const before = readFileSync(join(project, 'package.json'), 'utf8')
  const added = await typed(project, 'add', join(folder, 'marker-1.0.0.tgz'), '--json')
  assert.equal(added.ended, 0, added.printed)
  const points = await listed(project)
  assert.deepEqual(
    points.map((one) => one.kind),
    ['command', 'command', 'command'],
  )
  // The newest holds the package file as tent add wrote it, and the one before it the file as it stood.
  assert.notEqual(readFileSync(join(project, 'package.json'), 'utf8'), before)
  const compared = await typed(project, 'history', 'compare', points[1].id, points[0].id, '--json')
  assert.deepEqual(
    Object(compared.answer.value).map((one: { change: string; name: string }) => `${one.name} ${one.change}`),
    ['package-lock.json added', 'package.json changed'],
    'what tent add changed, and nothing of node_modules',
  )
  assert.equal(points[1].files, files, 'the point before holds the files as they stood')
})
