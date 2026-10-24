import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { describeProject } from '../../build/index.ts'
import type { Description } from '../../core/internal.ts'
import { definitionSource, fileSource, write } from '../../core/internal.ts'
import { root, typed } from './typed.ts'

/** A description as its text, without what names the text of its sources. */
const held = (description: Description): string =>
  write({ ...description, places: {}, sources: {} }).text.replace(/\.[0-9a-f]{12}\.js/g, '.<fp>.js')

/** Whether a definition has no text that is written from its record. */
function isCode(description: Description, name: string): boolean {
  try {
    definitionSource(description, name)
    return false
  } catch {
    return true
  }
}

/**
 * Copies a project beside itself, and writes each file of the copy anew with `fileSource`, where every definition
 * of the file is plain. Answers the folder of the copy, the two descriptions, and the files that hold code.
 */
async function writtenAnew(
  project: string,
  copy: string,
): Promise<{ before: Description; after: Description; code: string[] }> {
  cpSync(project, copy, { recursive: true, filter: (path) => !path.includes('.tent') })
  const first = await describeProject(project)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  const files = new Map<string, string[]>()
  const places = Object.entries(first.description.places).sort((a, b) => Number(a[1].from) - Number(b[1].from))
  for (const [name, place] of places) files.set(String(place.file), [...(files.get(String(place.file)) ?? []), name])
  const code: string[] = []
  for (const [file, names] of files) {
    if (names.some((name) => isCode(first.description, name))) {
      code.push(file)
      continue
    }
    mkdirSync(dirname(join(copy, file)), { recursive: true })
    writeFileSync(join(copy, file), fileSource(first.description, names, { path: file }))
  }
  const second = await describeProject(copy)
  assert.deepEqual(
    second.findings.filter((one) => one.level === 'error'),
    [],
  )
  return { before: first.description, after: second.description, code }
}

/** An empty folder of a test under `results/`, which is removed when the test ends. */
function workFolder(t: TestContext, name: string): string {
  const folder = join(root, 'results', 'cli', name)
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  mkdirSync(folder, { recursive: true })
  t.after(remove)
  return folder
}

test('[34-2] every backend definition of a new project reads back to the same record from the text that is written of it, and its screen file, a view of React, is left as it stands', async (t) => {
  const folder = workFolder(t, 'written-new')
  assert.equal((await typed(folder, 'new', 'my-app')).ended, 0)
  const { before, after, code } = await writtenAnew(join(folder, 'my-app'), join(folder, 'again'))
  assert.deepEqual(code, ['screens/home.tsx'], 'the file of the screen of a new project is code')
  assert.equal(held(after), held(before))
  assert.deepEqual(Object.keys(before.screens), ['homeScreen'])
})

/**
 * Takes the folder of a project. Installs its packages from its lock file into a folder under `results/` that is
 * kept between runs, as a fresh copy of the repository needs, and answers that folder: a copy of the project that
 * lies inside it finds them, as a project finds the packages of a folder above it. They are installed again when the
 * lock changed. The folder is never removed by a test: a native module of a package that the build loaded stays
 * open in the program on Windows, and a folder that holds it cannot be removed while the program runs.
 */
function installedFor(project: string): string {
  const folder = join(root, 'results', 'cli', `packages-${basename(project)}`)
  const lock = readFileSync(join(project, 'package-lock.json'), 'utf8')
  const done = join(folder, 'node_modules', '.package-lock.json')
  if (existsSync(done) && existsSync(join(folder, 'package-lock.json')))
    if (readFileSync(join(folder, 'package-lock.json'), 'utf8') === lock) return folder
  mkdirSync(folder, { recursive: true })
  copyFileSync(join(project, 'package.json'), join(folder, 'package.json'))
  writeFileSync(join(folder, 'package-lock.json'), lock)
  // The npm that the runtime came with lies beside it on Windows, and under `lib/` elsewhere.
  const npm = [
    join(dirname(process.execPath), 'node_modules'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules'),
  ]
    .map((one) => join(one, 'npm', 'bin', 'npm-cli.js'))
    .find((path) => existsSync(path))
  assert.ok(npm, 'no npm lies beside the runtime')
  const ended = spawnSync(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: folder,
    encoding: 'utf8',
    timeout: 300_000,
  })
  assert.equal(ended.status, 0, `npm ci ended with ${ended.status} (${ended.signal}): ${ended.stderr}`)
  return folder
}

test('[34-2] every plain definition of sample app 1 reads back to the same record from the text that is written of it', async (t) => {
  const sample = join(root, 'samples', 'app-1')
  assert.ok(existsSync(join(sample, 'tent.ts')), 'samples/app-1 is not there')
  // The copies lie under the folder of the packages, and none holds packages of its own.
  const folder = join(installedFor(sample), 'work')
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  t.after(remove)
  const left = ['.tent', 'node_modules']
  cpSync(sample, join(folder, 'app-1'), { recursive: true, filter: (path) => !left.some((one) => path.includes(one)) })
  const { before, after } = await writtenAnew(join(folder, 'app-1'), join(folder, 'again'))
  assert.equal(held(after), held(before))
})
