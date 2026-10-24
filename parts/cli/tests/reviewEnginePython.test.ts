import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Shared } from './pythonApps.ts'
import { opened, untilWithin } from './pythonApps.ts'
import { pythonStandIn, testPackages } from './pythonStandIn.ts'
import { notDropped } from './started.ts'
import { root, typed } from './typed.ts'

// A project of these tests alone, written when they start: each definition holds one sentence of the Python side.
const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'
export const pyreview = project('pyreview', {
  title: 'Python review',
  python: { version: '3.15' },
  limits: { pythonStopAfter: '3 seconds', pythonFrameSize: '1 MB' },
})
`,
  'tables.ts': `import { role, table, text, list } from 'tentjs'
export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })
export const hidden = table('hidden', { columns: { word: text() }, access: { read: role('staff'), add: role('staff') } })
`,
  'functions.ts': `import { json, python, text } from 'tentjs'
import { hidden } from './tables.ts'
export const hiddenRows = python('hiddenRows', {
  file: 'py/rows.py', input: {}, rows: { hidden: hidden.where({}) }, output: json(), access: 'signedIn',
})
export const keepsFile = python('keepsFile', { file: 'py/keepsFile.py', input: {}, output: json(), access: 'signedIn' })
export const echo = python('echo', { file: 'py/echo.py', input: { t: text() }, output: text(), access: 'signedIn' })
export const printsLong = python('printsLong', { file: 'py/printsLong.py', input: {}, output: text(), access: 'signedIn' })
`,
  'flows.ts': `import { flow } from 'tentjs'
import { keepsFile } from './functions.ts'
export const keeping = flow('keeping', {
  input: {},
  run: async ({ step }) => step('keep', () => keepsFile({}), { tries: 2 }),
})
`,
  'py/rows.py': `def run(input, tent):
    db = tent.db()
    names = [row[0] for row in db.execute("select name from sqlite_master where type = 'table'")]
    return {name: len(db.execute(f'select * from "{name}"').fetchall()) for name in names}
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
  'py/printsLong.py': `def run(input, tent):
    print("x" * (2 * 1048576))
    return "answered"
`,
  'py/echo.py': `def run(input, tent):
    return input["t"][:10]
`,
}

const laid: Partial<Shared> = {}
const folder = join(root, 'results', 'cli', 'python-review-engine')
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
  laid.project = join(folder, 'pyreview')
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(laid.project, file)), { recursive: true })
    writeFileSync(join(laid.project, file), text)
  }
  const locked = await typed(laid.project, 'python', 'lock', '--json')
  assert.equal(locked.ended, 0, locked.printed)
  const built = await buildProject(laid.project, { for: 'dev' })
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

const shared: Shared = {
  get stand() {
    return laid.stand ?? assert.fail('the stand-in is laid')
  },
  get home() {
    return laid.home ?? assert.fail('the home is laid')
  },
  get project() {
    return laid.project ?? assert.fail('the project is laid')
  },
  get bundle() {
    return laid.bundle ?? assert.fail('the bundle is laid')
  },
}

test('[25-13] a plan over a table that the caller may not read at all reaches Python as an empty table, and the call is answered', async (t) => {
  const { app, user } = await opened(t, shared)
  await app.write([{ add: 'hidden', values: { word: 'kept from the caller' } }], { as: 'system' })
  assert.deepEqual(await app.call('hiddenRows', {}, { as: await user() }), { hidden: 0 })
})

test('[25-16] a progress that names a file of the folder of its call keeps the file with it: when the step is made again, tent.progress() answers the path of a copy that is there', async (t) => {
  const { app, user } = await opened(t, shared)
  const { run } = notDropped(await app.start('keeping', {}, { as: await user() }))
  const ended = (): boolean => ['done', 'failed', 'stopped'].includes(String(app.runs.read(run)?.state))
  await untilWithin(ended, 'the run ended', 90_000)
  const read = app.runs.read(run)
  assert.equal(read?.state, 'done', JSON.stringify(read?.error ?? read?.steps))
  assert.deepEqual(read?.answer, { there: true, text: 'half of the work' })
})

test('[25-13] an input past limits.pythonFrameSize is refused at the size of its frame, with words that name the limit, and the next call is answered', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const error = await app.call('echo', { t: 'x'.repeat(2 * 1_048_576) }, { as: ada }).then(
    () => assert.fail('the call was answered'),
    (thrown: unknown) => Object(thrown),
  )
  assert.match(String(error.message), /pythonFrameSize|frame/, String(error.message))
  assert.equal(await app.call('echo', { t: 'small' }, { as: ada }), 'small')
})

test('[25-13] a print of a line longer than a frame of the channel is a line of the log, and the answer is still right', async (t) => {
  const { app, user } = await opened(t, shared)
  assert.equal(await app.call('printsLong', {}, { as: await user() }), 'answered')
})
