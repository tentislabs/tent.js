import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'
import { buildProject, describeProject } from '../index.ts'
import { copyOf, errorsOf, filesOf, lineWith, placesOf } from './projects.ts'

const print = (bytes: Uint8Array): string => fingerprintOf(bytes)

/** A copy of the project of these tests, with what git cannot hold laid in it: a folder of packages and the engine's own. */
function pythoned(as: string): string {
  const app = copyOf('pythoned/app', as)
  for (const [path, text] of [
    ['node_modules/pkg/a.py', 'packaged = True\n'],
    ['.tent/own.py', 'own = True\n'],
  ]) {
    mkdirSync(join(app, path, '..'), { recursive: true })
    writeFileSync(join(app, path), text)
  }
  return app
}

/** Changes a file of a copy: what stood at one place of its text stands in another form. */
function changed(app: string, file: string, from: string, to: string): void {
  const text = readFileSync(join(app, file), 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(join(app, file), text.replace(from, to))
}

/** The findings of one code, each as its file, its line and its words. */
const told = (findings: Finding[], code: string): string[] =>
  findings.filter((one) => one.code === code).map((one) => `${one.where?.file}:${one.where?.line} ${one.message}`)

test('[25-12] a python is described as the description format stores it; every .py file of the project and of its roots is in the bundle at its path, none of a left-out folder and none that is a link, a file that files names is there, and each lock beside them', async () => {
  const app = pythoned('python-bundle')
  // A `.py` file under a link is no file of the project: a folder that leads out of it, which every system can
  // make, and where this user may make one, a file that leads out and one that stays inside.
  mkdirSync(join(app, '..', 'outside'), { recursive: true })
  writeFileSync(join(app, '..', 'outside', 'far.py'), 'outside = True\n')
  symlinkSync(join(app, '..', 'outside'), join(app, 'ml', 'far'), 'junction')
  try {
    symlinkSync(join(app, '..', 'outside', 'far.py'), join(app, 'ml', 'out.py'), 'file')
    symlinkSync(join(app, 'ml', 'util.py'), join(app, 'ml', 'again.py'), 'file')
  } catch {
    // This system lets this user make no link to a file: the folder that is a link holds the rule.
  }
  const made = await buildProject(app, { for: 'dev' })
  assert.deepEqual(errorsOf(made.findings), [])
  const churn = made.description.functions.churnScore
  assert.equal(churn?.kind, 'action')
  assert.equal(churn?.form, 'code')
  assert.deepEqual(churn?.python, {
    file: 'ml/churn.py',
    packages: ['tinyone>=1', 'natone'],
    files: ['ml/*.joblib', 'data/**/*.csv', 'venv/*.py'],
  })
  assert.deepEqual(made.description.functions.oldScore?.python, {
    file: 'ml/old.py',
    packages: ['tinyone==1.0'],
    lock: 'old',
  })
  const bytesOf = (path: string): Uint8Array => readFileSync(join(app, path))
  const copied = [
    'data/a/rows.csv',
    'ml/churn.py',
    'ml/model.joblib',
    'ml/old.py',
    'ml/util.py',
    'python.old.lock',
    'top.py',
    'venv/site.py',
  ]
  const shared = readFileSync(join(app, '..', 'shared', 'py', 'helper.py'))
  assert.deepEqual(made.description.python, {
    lock: print(bytesOf('python.lock')),
    files: {
      ...Object.fromEntries(copied.map((path) => [path, print(bytesOf(path))])),
      'roots/0/py/helper.py': print(shared),
    },
  })
  const inBundle = Object.keys(filesOf(made.bundleFolder))
    .filter((path) => path.startsWith('python/'))
    .sort()
  assert.deepEqual(
    inBundle,
    [...copied.map((path) => `python/${path}`), 'python/python.lock', 'python/roots/0/py/helper.py'].sort(),
  )
  // The files keep their bytes.
  assert.deepEqual(readFileSync(join(made.bundleFolder, 'python', 'ml', 'churn.py')), bytesOf('ml/churn.py'))
})

test('[25-12] [15-1@9d] T7020: the project as it is passes, and a package that the second line of the lock does not name fails with exactly that code, at the lock, with the command as its fix, and writes no bundle', async () => {
  const passing = await describeProject(pythoned('python-lock-passes'))
  assert.deepEqual(errorsOf(passing.findings), [])
  const app = pythoned('python-lock-stale')
  changed(
    app,
    'functions/churn.ts',
    "packages: ['tinyone>=1', 'natone']",
    "packages: ['tinyone>=1', 'natone', 'pandas']",
  )
  const made = await buildProject(app, { for: 'dev' })
  assert.deepEqual([...new Set(made.findings.map((one) => one.code))], ['T7020'])
  const [one] = made.findings
  assert.deepEqual(one?.where, { file: 'python.lock', line: 2 })
  assert.match(one?.message ?? '', /pandas/)
  assert.match(one?.fix ?? '', /tent python lock/)
  assert.equal(one?.docs, 'tent docs T7020')
  assert.equal(made.bundleFolder, '')
  // So does the check, which reads what the build reads.
  assert.deepEqual(told((await describeProject(app)).findings, 'T7020').length, 1)
})

test('[25-12] [15-1@9d] a line of the lock that is an option, an address or another file is T7020 at its line, and so is a named lock that is not there and a lock made for another Python than the project names', async () => {
  for (const [line, why] of [
    ['--index-url https://packages.example.net/simple', 'an option'],
    ['-e .', 'an option'],
    ['tinyone @ https://packages.example.net/tinyone-2.0-py3-none-any.whl', 'an address'],
    ['https://packages.example.net/tinyone-2.0-py3-none-any.whl', 'an address'],
    ['./wheels/tinyone-2.0-py3-none-any.whl', 'a file'],
    ['C:\\wheels\\tinyone-2.0-py3-none-any.whl', 'a file'],
    ['# a comment of another form', 'another form'],
  ]) {
    const app = pythoned('python-lock-line')
    changed(app, 'python.lock', 'tinyone==2.0', `${line}\ntinyone==2.0`)
    const found = told((await describeProject(app)).findings, 'T7020')
    assert.equal(found.length, 1, `${why}: ${line}`)
    assert.match(found[0] ?? '', /^python\.lock:6 /, `${why}: ${line}`)
  }
  const unnamed = pythoned('python-lock-gone')
  rmSync(join(unnamed, 'python.old.lock'))
  const gone = told((await describeProject(unnamed)).findings, 'T7020')
  assert.equal(gone.length, 1)
  assert.match(gone[0] ?? '', /python\.old\.lock/)
  const other = pythoned('python-lock-version')
  changed(other, 'python.lock', '# python 3.15', '# python 3.14')
  const versions = told((await describeProject(other)).findings, 'T7020')
  assert.equal(versions.length, 1)
  assert.match(versions[0] ?? '', /^python\.lock:1 .*3\.14.*3\.15/)
})

test('[25-12] an entry of packages that holds an option or an address is T1014 at its definition, and so is an index whose address holds a name and a password or is not https, and an entry of build that is no name', async () => {
  for (const [entry, why] of [
    ['--extra-index-url=https://packages.example.net/simple', 'an option'],
    ['natone --hash=sha256:00', 'an option'],
    ['natone @ https://packages.example.net/natone.whl', 'an address'],
    ['git+https://example.net/natone.git', 'an address'],
    ['./wheels/natone.whl', 'a file'],
  ]) {
    const app = pythoned('python-entry')
    changed(app, 'functions/churn.ts', "'natone']", `'natone', ${JSON.stringify(entry)}]`)
    const made = await describeProject(app)
    const line = lineWith(readFileSync(join(app, 'functions', 'churn.ts'), 'utf8'), "python('churnScore'")
    assert.ok(placesOf(made.findings, 'T1014').includes(`functions/churn.ts:${line}`), `${why}: ${entry}`)
  }
  // The standard's own two additions are no option: a part in square brackets and the mark of a system.
  const marked = pythoned('python-entry-marked')
  changed(marked, 'functions/churn.ts', "'natone']", `'natone[fast]>=1.0, <2', "winonly; sys_platform == 'win32'"]`)
  assert.deepEqual(placesOf((await describeProject(marked)).findings, 'T1014'), [])
  for (const [from, to] of [
    ["url: 'https://packages.example.com/simple'", "url: 'https://reader:s3cret@packages.example.com/simple'"],
    ["url: 'https://packages.example.com/simple'", "url: 'http://packages.example.com/simple'"],
    ["build: ['sdistonly']", "build: ['sdistonly>=1']"],
  ]) {
    const app = pythoned('python-index')
    changed(app, 'tent.ts', from, to)
    const made = await describeProject(app)
    const line = lineWith(readFileSync(join(app, 'tent.ts'), 'utf8'), "project('churny'")
    assert.ok(placesOf(made.findings, 'T1014').includes(`tent.ts:${line}`), to)
    assert.equal(
      made.findings.some((one) => one.message.includes('s3cret')),
      false,
      'a finding never prints the password',
    )
  }
})
