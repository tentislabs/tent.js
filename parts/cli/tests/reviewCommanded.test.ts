import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine, makeSecretKey, readSecrets, storedValues } from '../../engine/index.ts'
import { openHistory } from '../../history/index.ts'
import { copied, shell, typed, typedApart } from './typed.ts'

// A value of a secret of this computer, long enough to be looked for, and found nowhere by chance.
const payKey = 'sk_live_REVIEW-0123456789-abcdefghij'

test('[32-13] tent export holds the public pages to the guard of the build: a secret of this computer in the code of a screen stops the export, and nothing is written', async (t) => {
  // The engine is closed before its folder is removed: the hooks of a test run in the order they were given.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'review-export', 'valued')
  writeFileSync(join(project, 'held.ts'), `export const held: string = ${JSON.stringify(payKey)}\n`)
  writeFileSync(
    join(project, 'leaks.tsx'),
    [
      "import { screen } from 'tentjs/ui'",
      "import { held } from './held'",
      '',
      "export const leakScreen = screen('leakScreen', {",
      "  path: '/leak',",
      "  access: 'anyone',",
      '  view: () => <p>{held}</p>,',
      '})',
      '',
    ].join('\n'),
  )
  // The engine of `tent dev` runs on the data of the project, whose secrets hold the value.
  const dev = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    dev.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '.tent')
  makeSecretKey(data)
  storedValues(data, dev.description, { kind: 'secrets', name: 'PAY_KEY', value: payKey })
  assert.deepEqual(readSecrets(data), [payKey])
  // `tent build` holds the code to the same guard: it is refused there.
  const built = await typed(project, 'build', '--json')
  assert.deepEqual(
    (built.answer.findings ?? []).map((one) => one.code),
    ['T3007'],
    built.printed,
  )
  await engine.open(dev.bundleFolder, { dataFolder: data, mode: 'development' })
  const exported = await typed(project, 'export', '--out', 'site', '--json')
  assert.deepEqual(
    (exported.answer.findings ?? []).filter((one) => one.level === 'error').map((one) => one.code),
    ['T3007'],
    exported.printed,
  )
  assert.equal(existsSync(join(project, 'site', 'leak', 'index.html')), false, 'no page of the site is written')
})

test('[24-15] TENT_KEY is the key of the address that TENT_AT names alone: tent login of another server never sends it', async (t) => {
  const project = copied(t, 'review-login', 'shop')
  const home = join(project, '..', 'home')
  mkdirSync(home, { recursive: true })
  const sent: string[] = []
  const server = createServer((request, response) => {
    sent.push(String(request.headers.authorization ?? ''))
    request.resume()
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: false, error: { code: 'T9104', name: 'refused', message: 'refused' } }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  const address = `http://127.0.0.1:${Number(Object(server.address()).port)}`
  const { NODE_TEST_CONTEXT: _, ...rest } = process.env
  const env = { ...rest, TENT_HOME: home, TENT_KEY: 'the-key-of-another-app', TENT_AT: 'https://other.example.com' }
  const child = spawn(process.execPath, [shell, 'login', address, '--insecure', '127.0.0.1', '--json'], {
    cwd: project,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.end('')
  const ended = await new Promise<number | null>((done) => child.on('exit', done))
  assert.notEqual(ended, null)
  assert.equal(
    sent.some((one) => one.includes('the-key-of-another-app')),
    false,
    `the key of ${env.TENT_AT} was sent to ${address}`,
  )
})

test('[51-12] tent filled --look takes --of <tenant id> and --all, for a tenant table', async (t) => {
  const project = copied(t, 'review-filled', 'shop')
  for (const words of [['--of', 'tenant-1'], ['--all']]) {
    const printed = await typed(project, 'filled', '--look', ...words, '--json')
    const said = (printed.answer.findings ?? []).map((one) => one.message).join('\n')
    assert.doesNotMatch(said, /takes no --/, printed.printed)
  }
})

test('[17-4] tent test --ai keeps its evaluation in evals/ of the engine’s own folder of the project', (t) => {
  const project = copied(t, 'review-evals', 'evaluated')
  const ran = typedApart(project, 'test', '--ai', '--json', '--budget', 'none')
  assert.equal(ran.ended, 0, ran.printed)
  const file = String(Reflect.get(Object(ran.answer.value), 'evaluation'))
  assert.ok(file.startsWith(join(project, '.tent', 'evals')), file)
  assert.equal(existsSync(join(project, 'evals')), false, 'no folder evals/ is written beside the files of the project')
})

test('[40-14] tent api read, a command that writes a file of the project, records a point of the kind command before it and one after', async (t) => {
  const project = copied(t, 'review-api-points', 'shop')
  const description = { openapi: '3.1.0', info: { title: 'Shop', version: '1' }, paths: {} }
  writeFileSync(join(project, '..', 'shop.json'), JSON.stringify(description))
  const commandPoints = (): number => {
    const history = openHistory(join(project, '.tent'))
    try {
      return history.list({ kinds: ['command'], newest: 100 }).length
    } finally {
      history.close()
    }
  }
  const before = commandPoints()
  const read = await typed(project, 'api', 'read', join(project, '..', 'shop.json'), '--out', 'api/shop.json', '--json')
  assert.equal(read.ended, 0, read.printed)
  assert.ok(existsSync(join(project, 'api', 'shop.json')))
  assert.ok(commandPoints() >= before + 1, 'the file that the command wrote is held by a point of the kind command')
})
