import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { untilWithin } from './pythonApps.ts'
import type { StandIn } from './pythonStandIn.ts'
import { pythonStandIn, testPackages } from './pythonStandIn.ts'
import { notDropped } from './started.ts'
import { root, typed } from './typed.ts'

// A project of this test alone: a step whose Python keeps a progress that names a file of its folder, fails, and is
// made again once the loose files were looked for. A loose file is gone a second after it became loose.
const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'
export const pykept = project('pykept', {
  title: 'Python kept',
  python: { version: '3.15' },
  limits: { pythonStopAfter: '3 seconds', looseKept: '1 second' },
})
`,
  'tables.ts': `import { list, table, text } from 'tentjs'
export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })
`,
  'functions.ts': `import { json, python } from 'tentjs'
export const keepsFile = python('keepsFile', { file: 'py/keepsFile.py', input: {}, output: json(), access: 'signedIn' })
`,
  'flows.ts': `import { flow } from 'tentjs'
import { keepsFile } from './functions.ts'
export const keeping = flow('keeping', {
  input: {},
  tries: { max: 2, wait: '8 seconds' },
  run: async ({ step }) => step('keep', () => keepsFile({})),
})
`,
  'py/keepsFile.py': `import os


def run(input, tent):
    kept = tent.progress()
    if kept is None:
        path = os.path.join(tent.folder, "made.txt")
        with open(path, "w") as made:
            made.write("half of the work")
        tent.save_progress({"file": path})
        raise Exception("the machine was lost")
    there = os.path.isfile(kept["file"])
    return {"there": there, "text": open(kept["file"]).read() if there else None}
`,
}

const folder = join(root, 'results', 'cli', 'python-review-mending')
const laid: { stand?: StandIn; home?: string; bundle?: string } = {}
const stood: Record<string, string | undefined> = {}
const closing: (() => Promise<void>)[] = []

before(async () => {
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  laid.stand = await pythonStandIn({ after: (fn: () => Promise<void>) => void closing.push(fn) }, testPackages())
  laid.home = mkdtempSync(join(folder, 'home-'))
  for (const [key, value] of Object.entries({ TENT_HOME: laid.home, TENT_PARTS: laid.stand.parts })) {
    stood[key] = process.env[key]
    process.env[key] = value
  }
  const project = join(folder, 'pykept')
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(project, file)), { recursive: true })
    writeFileSync(join(project, file), text)
  }
  const locked = await typed(project, 'python', 'lock', '--json')
  assert.equal(locked.ended, 0, locked.printed)
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  laid.bundle = built.bundleFolder
})

after(async () => {
  for (const one of closing) await one()
  for (const [key, value] of Object.entries(stood))
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

test('[25-16] a file that a progress names is kept with the progress: a step made again after the loose files were looked for is handed the copy of its file', async (t) => {
  const bundle = laid.bundle ?? assert.fail('the bundle is laid')
  const dataFolder = mkdtempSync(join(laid.home ?? assert.fail('the home is laid'), '..', 'data-'))
  const first = createEngine({ port: 0 })
  t.after(() => first.close())
  const app = await first.open(bundle, { dataFolder, mode: 'development' })
  const row: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const id = String(Reflect.get(Object(Array.isArray(row) ? row[0] : row), 'id'))
  const { run } = notDropped(await app.start('keeping', {}, { as: { kind: 'user', user: { id, roles: [] } } }))
  // The first try kept its progress and failed: the run waits for its second.
  await untilWithin(() => app.runs.read(run)?.state === 'waiting', 'the first try failed and the run waits', 90_000)
  // The engine stops, and opens again more than `looseKept` later: its upkeep looks for the loose files at once.
  await first.close()
  await new Promise((done) => setTimeout(done, 1500))
  const second = createEngine({ port: 0 })
  t.after(() => second.close())
  const again = await second.open(bundle, { dataFolder, mode: 'development' })
  const ended = (): boolean => ['done', 'failed', 'stopped'].includes(String(again.runs.read(run)?.state))
  await untilWithin(ended, 'the run ended', 90_000)
  const read = again.runs.read(run)
  assert.equal(read?.state, 'done', JSON.stringify(read?.error ?? read?.steps))
  assert.deepEqual(read?.answer, { there: true, text: 'half of the work' })
})
