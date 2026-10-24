import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { openHistory } from '../../history/index.ts'
import { tent } from '../shell.ts'
import { upgradeProject } from '../upgrade.ts'

const root = process.cwd()

/** An empty folder for one test under the folder that git leaves out, removed when the test ends. */
function folderOf(t: TestContext, name: string): string {
  const folder = join(root, 'results', 'upgrade', `${name}-${process.pid}-${Date.now()}`)
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }))
  return folder
}

/** Writes a project of one table and one query, with the version of the framework it names in its package file. */
function projectIn(folder: string, o: { version: string; title?: string }): string {
  const project = join(folder, 'shop')
  mkdirSync(join(project, 'tables'), { recursive: true })
  writeFileSync(
    join(project, 'tent.ts'),
    `import { project } from 'tentjs'\n\nexport const shop = project('shop', {\n  ${o.title ?? 'title'}: 'Shop',\n})\n`,
  )
  writeFileSync(
    join(project, 'tables', 'orders.ts'),
    "import { anyone, table, text } from 'tentjs'\n\nexport const orders = table('orders', {\n  columns: { item: text() },\n  access: { read: anyone('the shop shows its orders'), add: anyone('anyone orders') },\n})\n",
  )
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify({ name: 'shop', private: true, type: 'module', engines: { tentjs: o.version } }, null, 2)}\n`,
  )
  return project
}

/**
 * A later test build of the framework: a copy of the parts as they stand, in which `core` states a newer minor
 * number, under the folder that git leaves out, so that it finds the packages of the repository.
 */
function laterBuild(folder: string, minor: string): string {
  const copy = join(folder, `build-${minor}`)
  cpSync(join(root, 'parts'), join(copy, 'parts'), {
    recursive: true,
    filter: (path) => !/[\\/]tests([\\/]|$)/.test(path.slice(join(root, 'parts').length)),
  })
  writeFileSync(join(copy, 'parts', 'core', 'version.ts'), `export const coreVersion = '${minor}'\n`)
  return copy
}

/**
 * Runs a program of a test against a build of the framework: the program names the parts as `./parts/`, which is
 * read as that build's. It lies in the test's own folder. Answers the last line it printed, read as JSON.
 */
function inBuild(
  where: string,
  build: string,
  program: string,
  words: string[],
): { status: number | null; value: unknown; err: string } {
  const file = join(where, `program-${Date.now()}.ts`)
  writeFileSync(file, program.replaceAll("'./parts/", `'${pathToFileURL(join(build, 'parts')).href}/`))
  const done = spawnSync(process.execPath, [file, ...words], { encoding: 'utf8', timeout: 300_000 })
  let value: unknown
  try {
    value = JSON.parse(done.stdout.trim().split('\n').at(-1) ?? '')
  } catch {
    value = done.stdout
  }
  return { status: done.status, value, err: done.stderr }
}

// Builds a project with a build, opens it in an engine, writes a row, records a point, and says what it holds.
const madeThere = `import { join } from 'node:path'
import { buildProject } from './parts/build/index.ts'
import { createEngine } from './parts/engine/index.ts'
import { openHistory } from './parts/history/index.ts'
const [project, data] = process.argv.slice(2)
const built = await buildProject(project, { for: 'release' })
const engine = createEngine({ port: 0 })
const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
await app.write([{ add: 'orders', values: { item: 'a tent' } }], { as: 'system' })
const history = openHistory(data)
const point = history.record(project, { kind: 'named', name: 'made by 1.0', by: { kind: 'person', id: 'test' } })
history.close()
await engine.close()
console.log(JSON.stringify({ bundle: built.bundleFolder, point: point.id, needs: app.description.app.needsEngine }))
`

// Opens a bundle and a data folder in an engine, and says what the data and the history hold.
const openedThere = `import { createEngine } from './parts/engine/index.ts'
import { openHistory } from './parts/history/index.ts'
const [bundle, data, point] = process.argv.slice(2)
const engine = createEngine({ port: 0 })
try {
  const app = await engine.open(bundle, { dataFolder: data, mode: 'test' })
  const rows = await app.read({ from: 'orders' }, { as: 'system' })
  const history = openHistory(data)
  const found = history.read(point)
  history.close()
  console.log(JSON.stringify({ rows: rows.map((one) => one.item), point: found?.name }))
} catch (error) {
  console.log(JSON.stringify({ code: error.code, message: error.message }))
} finally {
  await engine.close()
}
`

test('[41-6] a description, a data file and a history file made by version 1.0 open in a later 1.x test build', async (t) => {
  const folder = folderOf(t, 'later')
  const project = projectIn(folder, { version: '1.0' })
  const data = join(folder, 'data')
  const made = inBuild(folder, root, madeThere, [project, data])
  assert.equal(made.status, 0, made.err)
  const { bundle, point, needs } = Object(made.value)
  assert.equal(needs, '1.0')
  const later = laterBuild(folder, '1.4')
  const opened = inBuild(folder, later, openedThere, [bundle, data, point])
  assert.equal(opened.status, 0, opened.err)
  assert.deepEqual(opened.value, { rows: ['a tent'], point: 'made by 1.0' })
})

test('[41-6] a project that needs a newer engine of the same major is refused with T0018 and the version to update to', async (t) => {
  const folder = folderOf(t, 'newer')
  const project = projectIn(folder, { version: '1.4' })
  const later = laterBuild(folder, '1.4')
  const data = join(folder, 'data')
  const made = inBuild(folder, later, madeThere, [project, data])
  assert.equal(made.status, 0, made.err)
  const { bundle, point } = Object(made.value)
  rmSync(join(data, 'engine.json'), { force: true })
  const opened = inBuild(folder, root, openedThere, [bundle, join(folder, 'other'), point])
  assert.equal(Object(opened.value).code, 'T0018', opened.err)
  assert.match(String(Object(opened.value).message), /1\.4/)
  assert.match(String(Object(opened.value).message), /tent update/)
})

test('[41-6] tent upgrade with a planted step records a point, changes a file, runs the check and prints the change in the terms of compare; with no step it ends with 0', async (t) => {
  const folder = folderOf(t, 'upgrade')
  const project = projectIn(folder, { version: '0.9', title: 'oldTitle' })
  const planted: { upgrade: Parameters<typeof upgradeProject>[1][number] } = await import(
    pathToFileURL(join(root, 'tests', 'planted', '41-6a', 'upgrades', '0.9-1.0.ts')).href
  )
  const done = await upgradeProject(project, [planted.upgrade])
  assert.deepEqual(done.steps, ['oldTitle is title'])
  assert.equal(done.from, '0.9')
  assert.equal(done.to, '1.0')
  assert.match(readFileSync(join(project, 'tent.ts'), 'utf8'), /title: 'Shop'/)
  assert.equal(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')).engines.tentjs, '1.0')
  // The check ran over the upgraded project, and found nothing wrong.
  assert.deepEqual(
    done.findings.filter((one) => one.level === 'error'),
    [],
  )
  // The change is printed as compare prints it, and the history holds a point before and after.
  assert.ok(
    done.changes.some((line) => /tent\.ts|title/.test(line)),
    done.changes.join('\n'),
  )
  const history = openHistory(join(project, '.tent'))
  const points = history.list({ kinds: ['command'] })
  history.close()
  assert.ok(points.length >= 2)
  // With no step for this version, the command says so and ends with 0.
  const plain = projectIn(join(folder, 'plain'), { version: '1.0' })
  const printed: string[] = []
  const ended = await tent(['upgrade', '--json'], { folder: plain, out: (line) => printed.push(line) })
  assert.equal(ended, 0, printed.join('\n'))
  const answer = JSON.parse(printed.join('\n'))
  assert.equal(answer.ok, true)
  assert.deepEqual(answer.value.steps, [])
  assert.match(String(answer.value.said), /no step/i)
})
