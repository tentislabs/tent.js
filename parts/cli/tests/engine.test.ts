import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import { buildProject, buildSaved } from '../../build/index.ts'
import type { Type } from '../../core/index.ts'
import { boolean, choice, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import { tent } from '../shell.ts'
import type { Typed } from './typed.ts'
import { startWords } from './startWords.ts'
import { copied, program, shell, typed, typedApart } from './typed.ts'

/** Copies the project of these tests into an empty folder of its own, which is removed when the test ends. */
const projectOf = (t: TestContext, name: string): string => copied(t, `engine-${name}`)

/** Waits until something holds, and fails where it does not within the time a test gives it. */
async function until(holds: () => boolean | Promise<boolean>, what: string, within = 20_000): Promise<void> {
  const ends = performance.now() + within
  while (performance.now() < ends) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`it did not come to hold within ${within} ms: ${what}`)
}

/** What `engine.json` of a data folder holds, or nothing where there is none. */
function engineFile(dataFolder: string): { port: number; pid: number; mode: string } | undefined {
  try {
    return JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/** Whether a program of that number runs on this computer. */
function runs(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** The shape of one finding as a command prints it with `--json`. */
const finding = object({
  code: text({ pattern: '^T\\d{4}$' }),
  name: text(),
  message: text(),
  level: choice(['error', 'warning', 'note']),
  docs: text({ pattern: '^tent docs T\\d{4}$' }),
  fix: text({ optional: true }),
  where: object({ file: text(), line: number(), definition: text({ optional: true }) }, { optional: true }),
})

/** What every command prints with `--json`, around the shape of its own value. */
const printed = (value: Type): Type => object({ ok: boolean(), value, findings: list(finding) })

const line = object({
  at: number(),
  level: choice(['info', 'warn', 'error']),
  message: text(),
  data: json({ optional: true }),
  name: text({ optional: true }),
  run: text({ optional: true }),
})
const rule = text({ min: 1 })

/** The stored shape of the value of each command of the engine. */
const shapes: Record<string, Type> = {
  run: object({ value: json({ optional: true }), lines: list(line) }),
  logs: object({ calls: list(json()), errors: list(json()), slow: list(json()) }),
  'logs --errors': object({ errors: list(json()) }),
  access: object({
    tables: list(object({ table: text(), read: rule, add: rule, change: rule, remove: rule })),
    functions: list(
      object({
        name: text(),
        kind: choice(['query', 'change', 'action']),
        access: rule,
        system: text({ optional: true }),
        sql: boolean({ optional: true }),
      }),
    ),
  }),
  'data rows': list(json()),
  'data backup': object({ file: text(), writes: number(), rows: number({ optional: true }) }),
  'data restore': object({ restored: text() }),
  'data clean': object({ dropped: list(json()) }),
  'data user export': object({ id: text(), user: json({ optional: true }), rows: json() }),
  'data user remove': object({
    removed: boolean(),
    rows: json(),
    refused: list(json(), { optional: true }),
    backups: number({ optional: true }),
    archive: boolean({ optional: true }),
  }),
  test: object({ passed: number(), failed: number(), files: list(text()) }),
  start: object({
    app: text(),
    version: text({ pattern: '^[0-9a-f]{32}$' }),
    port: number(),
    mode: choice(['development', 'test', 'live']),
  }),
}

/** Holds what a command printed with `--json` to the stored shape of its name, and answers its value. */
function shaped(name: string, output: Typed): Record<string, unknown> {
  assert.equal(output.ended, 0, `tent ${name} ends with 0: ${output.printed}`)
  assert.deepEqual(checkValue(printed(shapes[name]), output.answer), [], `the shape of tent ${name} --json`)
  assert.deepEqual([output.answer.ok, output.answer.findings], [true, []], name)
  return Object(output.answer.value)
}

test('[22-20] in development, as tent dev opens it, an engine.ts that imports a value of tentjs/engine gives its makers, as in a release', async (t) => {
  const project = projectOf(t, 'makers-dev')
  writeFileSync(
    join(project, 'engine.ts'),
    `import type { Makers } from 'tentjs/engine'
import { ProviderFailure } from 'tentjs/engine'

export default {
  providers: () => ({ own: { reply: () => { throw new ProviderFailure('notAccepted', 'none') } } }),
} satisfies Makers
`,
  )
  // `tent dev` opens the list of the files of a save, and `tent start` the folder of a release.
  for (const kind of ['dev', 'release'] as const) {
    const built =
      kind === 'dev'
        ? await buildSaved(project).then((one) => ({ ...one, bundle: one.bundleList }))
        : await buildProject(project, { for: kind }).then((one) => ({ ...one, bundle: one.bundleFolder }))
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error'),
      [],
    )
    const engine = createEngine({ port: 0 })
    try {
      const mode = kind === 'dev' ? 'development' : 'test'
      const app = await engine.open(built.bundle, { dataFolder: join(project, '.tent', kind), mode })
      assert.equal(app.versions().length, 1, kind)
    } finally {
      await engine.close()
    }
  }
})

test('[15-7] `tent run` with no engine running starts one, answers, and leaves nothing running', async (t) => {
  const project = projectOf(t, 'run')
  const data = join(project, '.tent')
  // As a program of its own: it ends by itself, which it could not with an engine left running in it.
  const first = program(project, 'run', 'whoAmI', '--json')
  assert.equal(first.status, 0, first.out + first.err)
  assert.deepEqual(JSON.parse(first.out), { ok: true, value: { value: 'no user', lines: [] }, findings: [] })
  // The engine it started ran on the development data of the project, and is gone with its file.
  assert.equal(existsSync(join(data, 'data.db')), true)
  assert.equal(engineFile(data), undefined)

  // The data stays between two commands: what the first wrote, the second reads.
  const added = await typed(project, 'run', 'addUser', '--with', '{"name":"Maya","roles":["staff"]}', '--json')
  const maya = String(Object(shaped('run', added).value).id)
  assert.equal(shaped('run', await typed(project, 'run', 'staffOnly', '--as', maya, '--json')).value, maya)
  assert.equal(shaped('run', await typed(project, 'run', 'whoAmI', '--as', 'nobody', '--json')).value, 'no user')
  // Left out, the caller is the system.
  assert.equal(shaped('run', await typed(project, 'run', 'staffOnly', '--json')).value, 'no user')
  // The lines that the code of the function wrote are printed with its answer.
  const noted = shaped('run', await typed(project, 'run', 'noted', '--as', maya, '--json'))
  assert.deepEqual(
    (Array.isArray(noted.lines) ? noted.lines : []).map((one) => [one.level, one.message, one.data, one.name]),
    [['info', 'an order was looked at', { by: 'the desk' }, 'noted']],
  )
  assert.equal(engineFile(data), undefined)

  // A call that the door refuses is an error of what was asked, and ends the command with 1.
  const refused = await typed(project, 'run', 'staffOnly', '--as', 'nobody', '--json')
  assert.deepEqual([refused.ended, refused.answer.ok, refused.answer.findings?.[0].code], [1, false, 'T0006'])
  const wrong = await typed(project, 'run', 'addOrder', '--with', '{"title":""}', '--as', maya, '--json')
  assert.deepEqual([wrong.ended, wrong.answer.findings?.[0].code], [1, 'T0002'])
  const lost = await typed(project, 'run', 'noSuchFunction', '--json')
  assert.deepEqual([lost.ended, lost.answer.findings?.[0].code], [1, 'T0001'])
  // What is no JSON after `--with` is a failure of the command itself.
  assert.equal((await typed(project, 'run', 'whoAmI', '--with', '{title', '--json')).ended, 2)
  // As text, the answer is printed, and the lines under it.
  assert.match((await typed(project, 'run', 'whoAmI', '--as', maya)).printed, new RegExp(maya))

  // An `engine.json` that an engine left behind, whose program is gone, is no engine: the command starts its own.
  writeFileSync(
    join(data, 'engine.json'),
    JSON.stringify({ port: 9, token: 'left-behind', pid: 2 ** 22 + 1, mode: 'live' }),
  )
  assert.equal(shaped('run', await typed(project, 'run', 'whoAmI', '--json')).value, 'no user')
  assert.equal(engineFile(data), undefined)

  // A project that does not build starts no engine: the findings of the build are the answer.
  writeFileSync(
    join(project, 'functions', 'hidden.ts'),
    "import { table } from 'tentjs'\nconst hidden = table('hidden', {})\n",
  )
  const unbuilt = await typed(project, 'run', 'whoAmI', '--json')
  assert.deepEqual([unbuilt.ended, unbuilt.answer.findings?.[0].code], [1, 'T1001'])
  assert.equal(engineFile(data), undefined)
})

test('[15-6@4] the output of each command of the engine with --json has its stored shape', async (t) => {
  const project = projectOf(t, 'shapes')
  const data = join(project, '.tent')
  const temp = join(project, '..', 'temp')
  mkdirSync(temp)
  const seen = new Set<string>()
  const held = (name: string, output: Typed): Record<string, unknown> => {
    seen.add(name)
    return shaped(name, output)
  }
  const maya = String(
    Object(held('run', await typed(project, 'run', 'addUser', '--with', '{"name":"Maya","roles":[]}', '--json')).value)
      .id,
  )
  await typed(project, 'run', 'addOrder', '--with', '{"title":"A shelf"}', '--as', maya, '--json')
  await typed(project, 'run', 'staffOnly', '--as', maya, '--json')

  const logs = held('logs', await typed(project, 'logs', '--json'))
  assert.deepEqual(
    (Array.isArray(logs.calls) ? logs.calls : []).map((call) => [call.name, call.ok, call.code]),
    [
      ['addUser', 1, null],
      ['addOrder', 1, null],
      ['staffOnly', 0, 'T3101'],
    ],
  )
  held('logs --errors', await typed(project, 'logs', '--errors', '--since', '1 hour', '--json'))

  const access = held('access', await typed(project, 'access', '--json'))
  assert.deepEqual(access.tables, [
    { table: 'orders', read: 'owner', add: 'signedIn', change: 'role staff', remove: 'role staff' },
    { table: 'users', read: 'signedIn', add: 'nobody', change: 'nobody', remove: 'nobody' },
  ])

  const rows = await typed(project, 'data', 'rows', 'orders', '--json')
  seen.add('data rows')
  assert.equal(rows.ended, 0, rows.printed)
  assert.deepEqual(checkValue(printed(shapes['data rows']), rows.answer), [])
  assert.deepEqual(
    (Array.isArray(rows.answer.value) ? rows.answer.value : []).map((row) => [row.title, row.owner, row.paid]),
    [['A shelf', maya, false]],
  )

  const backup = held('data backup', await typed(project, 'data', 'backup', '--json'))
  assert.equal(String(backup.file).startsWith(join(data, 'backups')), true)
  await typed(project, 'run', 'addOrder', '--with', '{"title":"A stool"}', '--as', maya, '--json')
  held('data restore', await typed(project, 'data', 'restore', String(backup.file), '--json'))
  assert.equal(Object((await typed(project, 'data', 'rows', 'orders', '--json')).answer.value).length, 1)
  held('data clean', await typed(project, 'data', 'clean', '--json'))

  const out = join(temp, 'maya.json')
  const exported = held(
    'data user export',
    await typed(project, 'data', 'user', 'export', maya, '--out', out, '--json'),
  )
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), exported)
  const shown = await typed(project, 'data', 'user', 'remove', maya, '--json')
  seen.add('data user remove')
  assert.deepEqual(checkValue(printed(shapes['data user remove']), shown.answer), [])
  assert.equal(Object(shown.answer.value).removed, false)
  const removed = held('data user remove', await typed(project, 'data', 'user', 'remove', maya, '--yes', '--json'))
  assert.deepEqual([removed.removed, removed.backups], [true, 1])
  assert.deepEqual((await typed(project, 'data', 'rows', 'users', '--json')).answer.value, [])

  // `tent test`: the tests of the app, each against a fresh temporary copy of the app.
  const was = ['TEMP', 'TMP', 'TMPDIR'].map((name) => [name, process.env[name]] as const)
  for (const [name] of was) process.env[name] = temp
  t.after(() => {
    for (const [name, value] of was)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  })
  // The command starts the test runner of the runtime, which starts none inside a test: so it is a program of its own.
  const tested = held('test', typedApart(project, 'test', '--json'))
  assert.deepEqual(tested, { passed: 2, failed: 0, files: ['tests/orders.test.ts'] })
  // A test that fails is an error, and is named with what it failed by. A file of AI tests is left out.
  writeFileSync(
    join(project, 'tests', 'fails.test.ts'),
    "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('one and one', () => assert.equal(1 + 1, 3))\n",
  )
  writeFileSync(join(project, 'tests', 'helper.ai.ts'), "throw new Error('a file of AI tests was run')\n")
  const failed = typedApart(project, 'test', '--json')
  assert.deepEqual([failed.ended, failed.answer.ok], [1, false])
  assert.deepEqual(failed.answer.value, {
    passed: 2,
    failed: 1,
    files: ['tests/fails.test.ts', 'tests/orders.test.ts'],
  })
  assert.match(String(failed.answer.findings?.[0].message), /one and one/)
  rmSync(join(project, 'tests', 'fails.test.ts'))
  // A test app leaves nothing in the temporary place but what the test itself wrote there.
  assert.deepEqual(readdirSync(temp), ['maya.json'])

  // `tent start` runs a bundle until it is told to stop, and then answers what it ran.
  const built = await buildProject(project, { for: 'release' })
  const served = join(project, '..', 'served')
  const lines: string[] = []
  const ended = tent(
    startWords(['start', built.bundleFolder, '--data', served, '--port', '0', '--mode', 'test', '--seed', '--json']),
    {
      folder: project,
      out: (one) => lines.push(one),
    },
  )
  await until(() => engineFile(served) !== undefined, 'the engine of tent start')
  const running = engineFile(served)
  assert.deepEqual([running?.mode, running?.pid], ['test', process.pid])
  const health = await (await fetch(`http://127.0.0.1:${running?.port}/_t/health`)).json()
  assert.deepEqual(Object(health).value, { app: 'shop', version: built.versionId })
  // A command that names the data folder reaches the engine that runs there, and starts none: the seed is there.
  const users = await typed(project, 'data', 'rows', 'users', '--data', served, '--json')
  assert.deepEqual(
    (Array.isArray(users.answer.value) ? users.answer.value : []).map((row) => row.name),
    ['Ada', 'Bob'],
  )
  assert.equal(engineFile(served)?.pid, process.pid)
  // The signal that ends a program ends `tent start`, which closes its engine first.
  process.emit('SIGTERM')
  seen.add('start')
  const answer: Typed['answer'] = { ...JSON.parse((await ended) === 0 ? lines.join('\n') : '{}') }
  assert.deepEqual(checkValue(printed(shapes.start), answer), [], 'the shape of tent start --json')
  assert.deepEqual(answer.value, { app: 'shop', version: built.versionId, port: running?.port, mode: 'test' })
  assert.equal(engineFile(served), undefined)
  // Started again on the same data, `--seed` adds nothing: the data is not empty.
  const again = tent(
    startWords(['start', built.bundleFolder, '--data', served, '--port', '0', '--mode', 'test', '--seed']),
    {
      folder: project,
      out: () => undefined,
    },
  )
  await until(() => engineFile(served) !== undefined, 'the engine of the second tent start')
  assert.equal(
    Object((await typed(project, 'data', 'rows', 'users', '--data', served, '--json')).answer.value).length,
    2,
  )
  process.emit('SIGTERM')
  assert.equal(await again, 0)

  assert.deepEqual([...seen].sort(), Object.keys(shapes).sort())
})

test('[15-6@4] `tent data rows`, as it is typed with a space', async (t) => {
  const project = projectOf(t, 'typed')
  const rows = await typed(project, 'data', 'rows', 'orders', '--json')
  assert.deepEqual([rows.ended, rows.answer.value], [0, []])
})

/** Starts `tent start` as a program of its own, and answers it with the port it says it listens on. */
async function started(
  t: TestContext,
  bundle: string,
  data: string,
): Promise<{ child: ChildProcess; port: number; ended: Promise<void> }> {
  const child = spawn(process.execPath, [shell, ...startWords(['start', bundle, '--data', data, '--port', '0'])], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const ended = new Promise<void>((done) => child.once('exit', () => done()))
  // Where a test fails, the program it started is ended all the same: by its own number, and no other.
  t.after(async () => {
    child.kill()
    await ended
  })
  let said = ''
  child.stderr?.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  await until(() => /:(\d+)\b/.test(said) || child.exitCode !== null, 'the line that tent start says it listens with')
  const port = Number(/:(\d+)\b/.exec(said)?.[1])
  assert.equal(Number.isInteger(port) && port > 0, true, `tent start said: ${said}`)
  return { child, port, ended }
}

/** The memory that a program holds, in bytes, as the system counts it. */
function memoryOf(pid: number): number {
  if (process.platform === 'win32') {
    const asked = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`], {
      encoding: 'utf8',
    })
    return Number(asked.stdout.trim())
  }
  return Number(spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()) * 1024
}

test('[21-6] `tent start` to the first answered request, and the memory of a running app doing nothing, are within their budgets', async (t) => {
  const project = projectOf(t, 'start')
  const built = await buildProject(project, { for: 'release' })
  const data = join(project, '..', 'data')
  const answered = async (port: number): Promise<boolean> => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/_t/health`)).status === 200
    } catch {
      return false
    }
  }
  // Each start is a program of its own on data that was opened before, and is ended once it has answered.
  const start = await measure(
    'start.first.source',
    async () => {
      const before = performance.now()
      const { child, port, ended } = await started(t, built.bundleFolder, data)
      await until(() => answered(port), 'the first answered request')
      const took = performance.now() - before
      child.kill()
      await ended
      return took
    },
    { warm: true },
  ).catch((missed: unknown) => missed)

  const { child, port, ended } = await started(t, built.bundleFolder, data)
  await until(() => answered(port), 'the first answered request')
  assert.equal(runs(Number(child.pid)), true)
  const memory = await measure(
    'memory.idle.source',
    async () => {
      // The app does nothing for a moment before each reading.
      await new Promise((done) => setTimeout(done, 1000))
      return memoryOf(Number(child.pid))
    },
    { unit: 'bytes' },
  ).catch((missed: unknown) => missed)
  child.kill()
  await ended
  assert.equal(runs(Number(child.pid)), false)
  // Both are measured before either is held, so that one missed bar leaves the other measure written.
  for (const measured of [start, memory]) if (measured instanceof Error) throw measured
  assert.equal(Number(start) > 0 && Number(memory) > 0, true)
})
