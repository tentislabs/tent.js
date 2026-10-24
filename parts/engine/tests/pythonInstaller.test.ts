import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { runInstaller, startedWith } from '../python/installer.ts'
import { startedProgram } from '../rooms/inProgram/program.ts'

const secrets: Record<string, string> = { INDEX_USER: 'reader', INDEX_PASSWORD: 's3cret' }
const secret = (name: string): string => {
  const value = secrets[name]
  if (value === undefined) throw new Error(`no secret ${name}`)
  return value
}

test('[25-12] python.index with a secret, and python.build, reach the installer: each index by its address, its name and password in the environment of that index alone, and every package but those that may be built held to ready-built files', () => {
  const started = startedWith({
    words: ['pip', 'sync', 'python.lock'],
    python: '/fetched/python-3.15@3.15.0/python/bin/python3',
    cache: '/fetched/python-cache',
    usual: 'https://pypi.org/simple',
    project: {
      index: [
        'https://packages.example.com/simple',
        {
          url: 'https://own.example.com/simple',
          user: { secret: 'INDEX_USER' },
          password: { secret: 'INDEX_PASSWORD' },
        },
      ],
      build: ['sdistonly'],
    },
    packages: ['natone', 'sdistonly', 'tinyone'],
    secret,
  })
  const { args, env } = started
  assert.deepEqual(args.slice(0, 3), ['pip', 'sync', 'python.lock'])
  const after = (flag: string): string[] => args.flatMap((one, at) => (one === flag ? [args[at + 1] ?? ''] : []))
  assert.deepEqual(after('--index'), [
    'tent0=https://packages.example.com/simple',
    'tent1=https://own.example.com/simple',
  ])
  assert.deepEqual(after('--default-index'), ['https://pypi.org/simple'])
  assert.deepEqual(after('--only-binary'), ['natone', 'tinyone'])
  assert.deepEqual(after('--python'), ['/fetched/python-3.15@3.15.0/python/bin/python3'])
  assert.deepEqual(after('--cache-dir'), ['/fetched/python-cache'])
  for (const flag of ['--no-config', '--no-python-downloads']) assert.ok(args.includes(flag), flag)
  assert.equal(env.UV_INDEX_TENT1_USERNAME, 'reader')
  assert.equal(env.UV_INDEX_TENT1_PASSWORD, 's3cret')
  assert.equal(env.UV_INDEX_TENT0_USERNAME, undefined)
  // The password stands in the environment of the installer alone, and in none of its words.
  assert.equal(args.join(' ').includes('s3cret'), false)
  // With nothing that may be built, every package is held to ready-built files.
  const plain = startedWith({
    words: ['pip', 'sync', 'python.lock'],
    python: 'python',
    cache: 'cache',
    usual: 'https://pypi.org/simple',
    project: {},
    packages: ['natone', 'tinyone'],
    secret,
  })
  assert.deepEqual(
    plain.args.flatMap((one, at) => (one === '--only-binary' ? [plain.args[at + 1]] : [])),
    [':all:'],
  )
})

test("[25-12] the installer is started with a named list of the environment alone: the search path, the person's folder, the temporary folder, the proxy and the language, and no secret of the engine", (t) => {
  const before = { ...process.env }
  t.after(() => {
    for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name]
    Object.assign(process.env, before)
  })
  Object.assign(process.env, {
    TENT_SECRET_KEY: 'the-key-of-the-secrets',
    UV_INDEX_URL: 'https://elsewhere.example.com/simple',
    PIP_INDEX_URL: 'https://elsewhere.example.com/simple',
    PYTHONPATH: '/somewhere',
    HTTPS_PROXY: 'http://proxy.example.com:3128',
    NO_PROXY: 'localhost',
    LANG: 'tr_TR.UTF-8',
    SOMETHING_ELSE: 'of the engine',
  })
  const { env } = startedWith({
    words: ['pip', 'compile', '-'],
    python: 'python',
    cache: 'cache',
    usual: 'https://pypi.org/simple',
    project: {},
    packages: [],
    secret,
  })
  for (const name of ['TENT_SECRET_KEY', 'UV_INDEX_URL', 'PIP_INDEX_URL', 'PYTHONPATH', 'SOMETHING_ELSE'])
    assert.equal(env[name], undefined, name)
  assert.equal(env.HTTPS_PROXY, 'http://proxy.example.com:3128')
  assert.equal(env.NO_PROXY, 'localhost')
  assert.equal(env.LANG, 'tr_TR.UTF-8')
  assert.ok(env.PATH ?? env.Path, 'the search path')
  assert.ok(process.platform === 'win32' ? env.USERPROFILE : env.HOME, "the person's folder")
  assert.ok(process.platform === 'win32' ? env.TEMP : true, 'the temporary folder')
  assert.equal(
    Object.values(env).some((value) => value.includes('the-key-of-the-secrets')),
    false,
  )
})

test("[25-12] the installer reads no .netrc of the person's own: it is handed an empty one of the engine's, which stands in its cache", async (t) => {
  const person = mkdtempSync(join(tmpdir(), 'tent-person-'))
  const before = process.env.NETRC
  t.after(() => {
    if (before === undefined) delete process.env.NETRC
    else process.env.NETRC = before
    rmSync(person, { recursive: true, force: true })
  })
  writeFileSync(join(person, '.netrc'), 'machine packages.example.com login reader password s3cret\n')
  process.env.NETRC = join(person, '.netrc')
  const cache = join(person, 'cache')
  const started = startedWith({
    words: ['pip', 'sync', 'python.lock'],
    python: 'python',
    cache,
    usual: 'https://pypi.org/simple',
    project: {},
    packages: [],
    secret,
  })
  assert.equal(dirname(String(started.env.NETRC)), cache)
  // What the installer finds there when it starts: a program of the test reads the file that it is named.
  const read = await runInstaller(
    startedProgram,
    process.execPath,
    {
      args: ['-e', 'process.stdout.write(String(require("fs").readFileSync(process.env.NETRC).length))'],
      env: started.env,
    },
    { time: 20_000 },
  )
  assert.equal(read.out, '0', read.err)
})
