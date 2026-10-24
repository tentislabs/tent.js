import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { boolean, json, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { npm } from '../../build/index.ts'
import { root, typed } from './typed.ts'

/** An empty folder of its own under `results/`, which is removed when the test ends. */
function emptied(t: TestContext, name: string): string {
  const folder = join(root, 'results', 'cli', name)
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  mkdirSync(folder, { recursive: true })
  t.after(remove)
  return folder
}

/**
 * Makes a package of the test's own in a folder, packed as a registry hands one out, and answers the packed file.
 * Its install script leaves a file in the package, so a test sees whether it was run. Installing it reaches no
 * network: it needs no other package.
 */
function packed(folder: string, name: string): string {
  const source = join(folder, name)
  mkdirSync(source, { recursive: true })
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { install: 'node mark.js' } }),
  )
  writeFileSync(join(source, 'index.js'), "module.exports = 'marked'\n")
  writeFileSync(
    join(source, 'mark.js'),
    "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'ran.txt'), 'ran')\n",
  )
  const made = npm(folder, ['pack', source, '--pack-destination', folder])
  assert.equal(made.status, 0, made.said)
  return join(folder, `${name}-1.0.0.tgz`)
}

/** The stored shape of what `tent add` prints with `--json`, around its value. */
const shape = object({
  ok: boolean(),
  value: object({ package: text(), scripts: boolean(), dependencies: json() }),
  findings: list(object({})),
})

test('[15-6@5] `tent add` installs a package into the project with its install scripts switched off, and prints its stored shape with --json', async (t) => {
  const folder = emptied(t, 'add')
  assert.equal((await typed(folder, 'new', 'add-app')).ended, 0)
  const project = join(folder, 'add-app')
  const ours = readFileSync(join(root, 'package.json'), 'utf8')
  const lock = readFileSync(join(root, 'package-lock.json'), 'utf8')
  const file = packed(folder, 'marker')
  // The package file is the one that `tent new` wrote: `tent add` finds it and writes none.
  const before = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  assert.equal(before.name, 'add-app')

  const added = await typed(project, 'add', file, '--json')
  assert.equal(added.ended, 0, added.printed)
  assert.deepEqual(checkValue(shape, added.answer), [], added.printed)
  const value = Object(added.answer.value)
  assert.equal(value.package, file)
  assert.equal(value.scripts, false)
  assert.deepEqual(Object.keys(value.dependencies), ['marker'])
  // The package is in the project, and its install script was not run.
  assert.ok(existsSync(join(project, 'node_modules', 'marker', 'index.js')))
  assert.ok(!existsSync(join(project, 'node_modules', 'marker', 'ran.txt')), 'the install script was not run')
  // The project has an ordinary package file and its lock file, and nothing above it was touched.
  const after = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(after.dependencies), ['marker'])
  assert.deepEqual({ ...after, dependencies: undefined }, { ...before, dependencies: undefined })
  assert.ok(existsSync(join(project, 'package-lock.json')))
  assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), ours)
  assert.equal(readFileSync(join(root, 'package-lock.json'), 'utf8'), lock)
  assert.ok(!existsSync(join(folder, 'node_modules')))
  // The project is still a project that passes the check: what was installed is no file of it.
  const checked = await typed(project, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  assert.deepEqual(checked.answer.findings, [])
})

test('[15-6@5] `tent add --allow-scripts` runs the install scripts of the package, and a package that cannot be installed ends the command with what npm said', async (t) => {
  const folder = emptied(t, 'add-scripts')
  assert.equal((await typed(folder, 'new', 'add-app')).ended, 0)
  const project = join(folder, 'add-app')
  const file = packed(folder, 'marker')

  const added = await typed(project, 'add', file, '--allow-scripts', '--json')
  assert.equal(added.ended, 0, added.printed)
  assert.equal(Object(added.answer.value).scripts, true)
  assert.equal(readFileSync(join(project, 'node_modules', 'marker', 'ran.txt'), 'utf8'), 'ran')

  const none = await typed(project, 'add', join(folder, 'nothing-9.9.9.tgz'), '--json')
  assert.notEqual(none.ended, 0)
  assert.equal(none.answer.ok, false)
  assert.match(none.printed, /nothing-9\.9\.9\.tgz/)
  // With no package named, the command says what it needs and installs nothing.
  const bare = await typed(project, 'add')
  assert.notEqual(bare.ended, 0)
  assert.match(bare.printed, /<package>/)
})
