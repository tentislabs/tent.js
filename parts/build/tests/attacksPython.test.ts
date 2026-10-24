import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { buildProject, describeProject } from '../index.ts'
import { copyOf, filesOf, lineWith, placesOf } from './projects.ts'

/** Changes a file of a copy: what stood at one place of its text stands in another form. */
function changed(app: string, file: string, from: string, to: string): void {
  const text = readFileSync(join(app, file), 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(join(app, file), text.replace(from, to))
}

/** The places of the findings of one code, each as its file and its line. */
const codes = (findings: Finding[], code: string): string[] =>
  findings.filter((one) => one.code === code).map((one) => `${one.where?.file}:${one.where?.line}`)

test('[05-14.11] an entry of packages that holds an option or an address, also behind the end of a line, is T1014 at its definition', async () => {
  for (const entry of [
    '--extra-index-url=https://packages.example.net/simple',
    '-r other.txt',
    'natone @ https://packages.example.net/natone.whl',
    // The installer is handed the entries one to a line: an entry that holds the end of a line hands it two.
    'natone;\n-r other.txt',
    'natone ;\n-e .',
    'natone; \r\n-c constraints.txt',
  ]) {
    const app = copyOf('pythoned/app', 'python-attack-entry')
    changed(app, 'functions/churn.ts', "'natone']", `'natone', ${JSON.stringify(entry)}]`)
    const made = await describeProject(app)
    const line = lineWith(readFileSync(join(app, 'functions', 'churn.ts'), 'utf8'), "python('churnScore'")
    assert.ok(placesOf(made.findings, 'T1014').includes(`functions/churn.ts:${line}`), JSON.stringify(entry))
  }
})

test('[05-14.12] a .py file that is a link out of the project is not copied, nor one under a folder that is a link, also where files names it', async () => {
  const app = copyOf('pythoned/app', 'python-attack-link')
  mkdirSync(join(app, '..', 'outside'), { recursive: true })
  writeFileSync(join(app, '..', 'outside', 'far.py'), 'outside = True\n')
  symlinkSync(join(app, '..', 'outside'), join(app, 'ml', 'far'), 'junction')
  let file = true
  try {
    symlinkSync(join(app, '..', 'outside', 'far.py'), join(app, 'ml', 'out.py'), 'file')
  } catch {
    // This user may make no link to a file here: the folder that is a link holds the rule.
    file = false
  }
  changed(app, 'functions/churn.ts', "files: ['ml/*.joblib',", "files: ['ml/**/*.py', 'ml/*.joblib',")
  const made = await buildProject(app, { for: 'dev' })
  const bundled = made.bundleFolder ? Object.keys(filesOf(made.bundleFolder)) : []
  assert.equal(
    bundled.some((path) => path.includes('far') || path.includes('out.py')),
    false,
    `nothing that a link leads to is in the bundle${file ? '' : ' (no link to a file was made)'}`,
  )
})

test('[05-14.14] a line of the lock that is an option, an address or another file, also where it follows a package and a semicolon, is T7020 at its line', async () => {
  for (const line of [
    '--index-url https://packages.example.net/simple',
    '-r other.txt',
    'tinyone @ https://packages.example.net/tinyone-2.0-py3-none-any.whl',
    './wheels/tinyone-2.0-py3-none-any.whl',
    'natone==1.0 ; --index-url https://packages.example.net/simple',
    'natone==1.0 ; python_version >= "3" -e ./wheels',
  ]) {
    const app = copyOf('pythoned/app', 'python-attack-lock')
    changed(app, 'python.lock', 'tinyone==2.0', `${line}\ntinyone==2.0`)
    const found = codes((await describeProject(app)).findings, 'T7020')
    assert.deepEqual(found, ['python.lock:6'], line)
  }
})

test('[05-14.15] an entry of python.index that holds a name and a password in its address is T1014, in either form of an entry, and no finding prints the password', async () => {
  for (const to of [
    "url: 'https://reader:s3cret@packages.example.com/simple'",
    "url: 'https://reader:s3cret@packages.example.com/simple', user: secret('INDEX_USER')",
  ]) {
    const app = copyOf('pythoned/app', 'python-attack-index')
    changed(app, 'tent.ts', "url: 'https://packages.example.com/simple'", to)
    const made = await describeProject(app)
    const line = lineWith(readFileSync(join(app, 'tent.ts'), 'utf8'), "project('churny'")
    assert.ok(placesOf(made.findings, 'T1014').includes(`tent.ts:${line}`), to)
    assert.equal(
      made.findings.some((one) => `${one.message} ${one.fix ?? ''}`.includes('s3cret')),
      false,
    )
  }
  const plain = copyOf('pythoned/app', 'python-attack-index-plain')
  changed(
    plain,
    'tent.ts',
    "index: [{ url: 'https://packages.example.com/simple', user: secret('INDEX_USER'), password: secret('INDEX_PASSWORD') }]",
    "index: ['https://reader:s3cret@packages.example.com/simple']",
  )
  assert.equal(codes((await describeProject(plain)).findings, 'T1014').length, 1)
})

test('[05-14.12] a lock that a definition names by a name that leads out of the project is refused, and nothing is read or written outside the project and its bundle', async () => {
  const app = copyOf('pythoned/app', 'python-attack-lock-name')
  // What the name leads to, three folders up from the root: a lock that holds the entries of the definition.
  const stolen = join(app, '..', '..', 'stolen.lock')
  writeFileSync(stolen, readFileSync(join(app, 'python.old.lock')))
  changed(app, 'functions/churn.ts', "lock: 'old'", "lock: '/../../../stolen'")
  const made = await buildProject(app, { for: 'dev' })
  const refused = made.findings.filter((one) => one.level === 'error' && /lock/.test(one.message))
  assert.ok(refused.length > 0, 'a lock whose name is no name is refused')
  if (made.bundleFolder)
    assert.equal(
      existsSync(join(made.bundleFolder, '..', 'stolen.lock')),
      false,
      'nothing is written beside the bundle',
    )
})
