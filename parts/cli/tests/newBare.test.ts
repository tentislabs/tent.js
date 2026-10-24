import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { testApp } from '../../test/index.ts'
import { root, typed } from './typed.ts'

/** An empty folder of a test under `results/`, removed when the test ends. */
function workFolder(t: TestContext, name: string): string {
  const folder = join(root, 'results', 'cli', name)
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  mkdirSync(folder, { recursive: true })
  t.after(remove)
  return folder
}

/** Every file under a folder, by its path from the folder written with `/`, but those of the folders it skips. */
function filesUnder(folder: string, skip: (path: string) => boolean = () => false): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const written = relative(folder, path).split('\\').join('/')
      if (skip(written)) continue
      if (statSync(path).isDirectory()) walk(path)
      else found.push(written)
    }
  }
  walk(folder)
  return found.sort()
}

test('[43-1] tent new writes a bare project - tent.ts, package.json, AGENTS.md, one screen at / and one query it reads, and nothing else - and the check passes on it', async (t) => {
  const folder = workFolder(t, 'new-bare')
  const made = await typed(folder, 'new', 'my-app', '--json')
  assert.equal(made.ended, 0, made.printed)
  const project = join(folder, 'my-app')
  // The engine's own folder holds the first point of the history, and is no file of the project.
  const files = filesUnder(project, (path) => path === '.tent')
  // `.gitignore` keeps the engine's own folder, with the data and the key of the secrets, out of a shared repository.
  assert.deepEqual(files, [
    '.gitignore',
    'AGENTS.md',
    'functions/greeting.ts',
    'package.json',
    'screens/home.tsx',
    'tent.ts',
  ])
  assert.deepEqual(Object(made.answer.value).files, files)

  const checked = await typed(project, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  assert.deepEqual(checked.answer.findings, [])
  // One screen at `/`, which reads the one query, and no other definition but the project.
  const definitions: Record<string, string> = Object(Object(checked.answer.value).definitions)
  assert.deepEqual(Object.keys(definitions).sort(), ['greeting', 'homeScreen', 'myApp'])
  const screen = readFileSync(join(project, 'screens', 'home.tsx'), 'utf8')
  assert.match(screen, /path: '\/',/)
  assert.match(screen, /read\(greeting\)/)

  // The screen draws what the query answers, for a visitor, with nothing else made.
  const app = await testApp({ folder: project })
  t.after(() => app.close())
  const page = await app.as('nobody').page('/')
  assert.equal(page.status, 200)
  const answer = String(await app.as('nobody').call('greeting'))
  assert.ok(answer.length > 0)
  assert.ok(page.html.includes(answer), page.html)
})

test('[43-1] the .gitignore of tent new leaves out the engine folder, the packages, the made type list, and results/, where a failed step of a test keeps what its page held', async (t) => {
  const folder = workFolder(t, 'new-ignored')
  const made = await typed(folder, 'new', 'my-app', '--json')
  assert.equal(made.ended, 0, made.printed)
  const ignored = readFileSync(join(folder, 'my-app', '.gitignore'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .sort()
  assert.deepEqual(ignored, ['.tent/', 'node_modules/', 'results/', 'tent.d.ts'])
})

test('[43-1] tent copy is no command, and tent new takes no --with', async (t) => {
  const folder = workFolder(t, 'new-no-with')
  const copy = await typed(folder, 'copy', 'signIn', '--json')
  assert.notEqual(copy.ended, 0)
  assert.match(String(copy.answer.findings?.[0]?.message), /tent has no command "copy"/)
  const withOne = await typed(folder, 'new', 'my-app', '--with', 'signIn', '--json')
  assert.notEqual(withOne.ended, 0)
  assert.match(String(withOne.answer.findings?.[0]?.message), /tent new takes no --with/)
  // A refused command makes no project.
  assert.deepEqual(readdirSync(folder), [])
})
