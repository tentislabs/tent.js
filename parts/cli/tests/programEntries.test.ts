import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { root, shell, typed } from './typed.ts'

// Every import of the framework, and the file of this copy that answers it.
const entries: Record<string, string> = JSON.parse(readFileSync(join(root, 'parts', 'entries.json'), 'utf8'))
const answered = Object.fromEntries(
  Object.entries(entries).map(([name, file]) => [name, pathToFileURL(join(root, file)).href]),
)

// A test file that names every entry, and imports the three that a program of the docs starts from.
const probe = `import assert from 'node:assert/strict'
import test from 'node:test'
import { guardedFetch } from 'tentjs/connect'
import { createEngine } from 'tentjs/engine'
import { createWorkspaces } from 'tentjs/workspaces'

const answered: Record<string, string> = ${JSON.stringify(answered)}

test('every entry of the framework is found', () => {
  for (const [name, file] of Object.entries(answered)) assert.equal(import.meta.resolve(name), file, name)
  assert.equal(typeof guardedFetch, 'function')
  assert.equal(typeof createEngine, 'function')
  assert.equal(typeof createWorkspaces, 'function')
})
`

/** Carries a command out as a person types it, with `--json`, and answers the number it ended with and what it printed. */
function apart(cwd: string, word: string): { ended: number | null; printed: string; answer: Record<string, unknown> } {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  // The type checker reads the parts that the files import, so a check takes longer than a bare project's.
  const ran = spawnSync(process.execPath, [shell, word, '--json'], { cwd, encoding: 'utf8', timeout: 300_000, env })
  let answer: Record<string, unknown> = {}
  try {
    answer = Object(JSON.parse(ran.stdout))
  } catch {
    // What is printed as text is shown by the failure.
  }
  return { ended: ran.status, printed: ran.stdout + ran.stderr, answer }
}

// A program of the project's own, which makes an engine and ends.
const server = `import { createEngine } from 'tentjs/engine'

const engine = createEngine({ port: 0 })
await engine.close()
console.log('made an engine')
`

test('[15-4] a project of tent new imports every entry of the framework that the docs give a program: the check passes, tent test runs a test that names each, and a program of its own runs from this copy', async (t) => {
  const folder = join(root, 'results', 'cli', 'program-entries')
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  mkdirSync(folder, { recursive: true })
  t.after(remove)
  const made = await typed(folder, 'new', 'probe', '--json')
  assert.equal(made.ended, 0, made.printed)
  const project = join(folder, 'probe')
  mkdirSync(join(project, 'tests'))
  writeFileSync(join(project, 'tests', 'probe.test.ts'), probe)
  writeFileSync(join(project, 'server.ts'), server)

  const checked = apart(project, 'check')
  assert.deepEqual(checked.answer.findings, [], checked.printed)
  assert.equal(checked.ended, 0, checked.printed)

  const tested = apart(project, 'test')
  assert.equal(tested.ended, 0, tested.printed)
  assert.deepEqual([Object(tested.answer.value).passed, Object(tested.answer.value).failed], [1, 0], tested.printed)

  // Until a release stands, a program is started with the hook of this copy that answers the imports of the framework.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ran = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(join(root, 'parts', 'cli', 'names.ts')).href, 'server.ts'],
    { cwd: project, encoding: 'utf8', timeout: 60_000, env },
  )
  assert.equal(ran.status, 0, ran.stderr)
  assert.match(ran.stdout, /made an engine/)
})
