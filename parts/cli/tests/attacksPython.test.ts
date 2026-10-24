import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { buildProject } from '../../build/index.ts'
import { cleanPython } from '../../engine/index.ts'
import { logOf, opened, running, sharedPython, untilWithin } from './pythonApps.ts'
import { wheelOf } from './pythonStandIn.ts'
import { typed } from './typed.ts'

const shared = sharedPython('attacks', 'attacksPython')

/** Answers the error that a promise was refused with: a test reads its code and its words. */
async function refusal(promise: Promise<unknown>): Promise<{ code?: string; message: string; fields?: unknown }> {
  try {
    await promise
  } catch (error) {
    return Object(error)
  }
  return assert.fail('the call was answered')
}

/** How many rows a table of the data folder holds, read beside the engine: none where it is not there yet. */
function countOf(dataFolder: string, table: string): number {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return Number(data.prepare(`SELECT count(*) AS n FROM "${table}"`).get()?.n ?? 0)
  } catch {
    return 0
  } finally {
    data.close()
  }
}

/** The number that a Python program wrote into a file of the folder `disk/` of a data folder, once it is there. */
async function numberIn(dataFolder: string, file: string): Promise<number> {
  const path = join(dataFolder, 'disk', file)
  await untilWithin(() => existsSync(path) && readFileSync(path, 'utf8').trim() !== '', `${file} was written`)
  return Number(readFileSync(path, 'utf8'))
}

/** Points the engines of a test at a runner's folder of its own, which holds no part and no environment yet. */
function freshHome(t: TestContext): string {
  const home = mkdtempSync(join(shared.home, '..', 'fresh-'))
  const before = process.env.TENT_HOME
  process.env.TENT_HOME = home
  t.after(() => {
    process.env.TENT_HOME = before
  })
  return home
}

/** The bytes of a tar archive compressed with gzip, of folders, files and links, as an archive of a part is. */
function tarOf(entries: { path: string; kind: 'folder' | 'file' | 'link'; text?: string; to?: string }[]): Uint8Array {
  const encoder = new TextEncoder()
  const blocks: Uint8Array[] = []
  for (const entry of entries) {
    const head = new Uint8Array(512)
    const put = (at: number, value: string) => head.set(encoder.encode(value), at)
    const bytes = encoder.encode(entry.text ?? '')
    put(0, entry.path)
    put(100, entry.kind === 'folder' ? '0000755\0' : '0000644\0')
    put(108, '0000000\0')
    put(116, '0000000\0')
    put(124, `${bytes.length.toString(8).padStart(11, '0')}\0`)
    put(136, '00000000000\0')
    put(148, '        ')
    put(156, entry.kind === 'folder' ? '5' : entry.kind === 'link' ? '2' : '0')
    if (entry.to) put(157, entry.to)
    put(257, 'ustar\x0000')
    const sum = head.reduce((total, byte) => total + byte, 0)
    put(148, `${sum.toString(8).padStart(6, '0')}\0 `)
    blocks.push(head, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  return gzipSync(Buffer.concat(blocks))
}

test('[05-14.1] tent.call of a name that uses does not hold is T0013, and of one whose rule the caller does not pass T3101, each as itself when Python lets it out', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const rows = await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' })
  const customer = String(Object(Array.isArray(rows) ? rows[0] : rows).id)
  const unknown = await refusal(app.call('asks', { customer, what: 'unknown' }, { as: ada }))
  assert.equal(unknown.code, 'T0013')
  assert.match(unknown.message, /rowsOf/)
  const refused = await refusal(app.call('asks', { customer, what: 'refused' }, { as: ada }))
  assert.equal(refused.code, 'T3101')
})

test('[05-14.2] the environment of a Python program, read for the key of the secrets, does not hold it, under any name', async (t) => {
  const key = 'the-key-of-the-secrets-0123456789abcdef'
  process.env.TENT_SECRET_KEY = key
  t.after(() => {
    delete process.env.TENT_SECRET_KEY
  })
  const { app, user } = await opened(t, shared)
  const seen = Object(await app.call('environment', {}, { as: await user() }))
  assert.equal(seen.names.includes('TENT_SECRET_KEY'), false)
  assert.equal(
    seen.values.some((value: string) => value.includes(key)),
    false,
  )
})

test('[05-14.3] a package file whose bytes differ from the lock is refused with T0016, and the app keeps answering', async (t) => {
  freshHome(t)
  const file = 'tinyone-2.0-py3-none-any.whl'
  shared.stand.replace(
    file,
    wheelOf('tinyone', '2.0', 'py3-none-any', { 'tinyone/__init__.py': 'VALUE = 666\n' }).bytes,
  )
  t.after(() =>
    shared.stand.replace(
      file,
      wheelOf('tinyone', '2.0', 'py3-none-any', { 'tinyone/__init__.py': 'VALUE = 2\n' }).bytes,
    ),
  )
  const { app, user } = await opened(t, shared)
  const error = await refusal(app.call('packaged', {}, { as: await user() }))
  assert.equal(error.code, 'T0016')
  assert.match(error.message, /tinyone/)
  assert.ok(await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' }))
})

test('[05-14.3] a Python part whose archive holds a link that leaves it is refused with T0016, and nothing of it is laid', async (t) => {
  const home = freshHome(t)
  const archive = tarOf([
    { path: 'python/', kind: 'folder' },
    { path: 'python/README', kind: 'file', text: 'a Python of the builder' },
    { path: 'python/escape', kind: 'link', to: '../../../../../outside' },
  ])
  shared.stand.replace('own-python.tar.gz', archive)
  const project = mkdtempSync(join(shared.home, '..', 'own-'))
  cpSync(shared.project, project, { recursive: true })
  const fingerprint = createHash('sha256').update(archive).digest('hex')
  const tent = readFileSync(join(project, 'tent.ts'), 'utf8').replace(
    "python: { version: '3.15' }",
    `python: { version: '3.15', own: { version: '3.15', address: '${shared.stand.parts}/own-python.tar.gz', fingerprint: '${fingerprint}' } }`,
  )
  writeFileSync(join(project, 'tent.ts'), tent)
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const { app, user } = await opened(t, shared, built.bundleFolder)
  const error = await refusal(app.call('pid', {}, { as: await user() }))
  assert.equal(error.code, 'T0016')
  const fetched = join(home, 'fetched')
  assert.equal(
    existsSync(fetched) && readdirSync(fetched).some((one) => one.startsWith('python-own@')),
    false,
    'nothing of the part is laid',
  )
})

test("[05-14.4] Python code that prints a frame of the channel's own form for its own call: it lands in the log, and the call answers what run answered", async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  assert.equal(await app.call('forges', {}, { as: await user() }), 'the answer of run')
  await untilWithin(
    () => logOf(dataFolder, 'lines').some((one) => String(one.message).includes('forged')),
    'the frame that Python printed is a line of the log',
  )
})

test('[05-14.5] code that takes all the memory at once is ended at its limit, and the engine keeps answering', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const call = refusal(app.call('hog', { mb: 600 }, { as: ada }))
  const pid = await numberIn(dataFolder, 'hog.pid')
  const error = await call
  assert.equal(error.code, 'T7119')
  assert.match(error.message, /100 MB/)
  await untilWithin(() => !running(pid), 'the Python program that passed its memory ended')
  assert.ok(await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' }))
  assert.equal(typeof (await app.call('pid', {}, { as: ada })), 'number')
})

test('[05-14.5] code that never ends, holding the interpreter, is ended at its time with T0008, and the engine keeps answering meanwhile', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const call = refusal(app.call('spin', {}, { as: ada }))
  const pid = await numberIn(dataFolder, 'spin.pid')
  // While the code spins, the engine answers.
  assert.ok(await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' }))
  assert.equal((await call).code, 'T0008')
  await untilWithin(() => !running(pid), 'the Python program that never ended was ended')
  assert.equal(typeof (await app.call('pid', {}, { as: ada })), 'number')
})

test('[05-14.6] a file input whose name is ../../x: its copy is named by the engine and lies in the folder of that call', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  for (const name of ['../../x', '..\\..\\x', 'a/../../../x.txt', '/x']) {
    const id = String(await app.call('putNamed', { name, text: 'the words' }, { as: ada }))
    const seen = Object(await app.call('named', { f: id }, { as: ada }))
    assert.equal(seen.text, 'the words', name)
    assert.equal(seen.dir, seen.folder, `${name}: the copy lies in the folder of the call`)
    assert.match(seen.name, /^[\w-]+\.txt$/, `${name}: the copy is named by the engine`)
    assert.equal(seen.above, false, name)
  }
})

test('[05-14.7] a plan of rows over a table with a private column, for a caller who may read some of its rows: the file holds those rows and no others, without that column, and so does the table of a link', async (t) => {
  const { app, user } = await opened(t, shared)
  const [ada, grace] = [await user(), await user()]
  const rows = await app.write([{ add: 'customers', values: { name: 'Lovelace', secret: 'kept apart' } }], {
    as: 'system',
  })
  const customer = String(Object(Array.isArray(rows) ? rows[0] : rows).id)
  const order = (who: unknown, total: number) => ({
    add: 'orders',
    values: {
      customer,
      owner: String(Reflect.get(Object(who).user, 'id')),
      total,
      placedAt: '2026-10-15T08:00:00.000Z',
      note: 'private words',
    },
  })
  await app.write([order(ada, 10), order(grace, 20), order(grace, 30)], { as: 'system' })
  const read = Object(await app.call('rowsOf', { customer }, { as: ada }))
  for (const table of ['orders', 'linked']) {
    assert.deepEqual(
      read.tables[table].rows.map((one: Record<string, unknown>) => one.total),
      [10],
      `${table}: Ada's own order alone`,
    )
    assert.equal(read.tables[table].columns.includes('note'), false, table)
  }
  assert.equal(read.tables.linked_customer.columns.includes('secret'), false)
  assert.equal(JSON.stringify(read).includes('private words'), false)
  assert.equal(JSON.stringify(read).includes('kept apart'), false)
})

test('[05-14.8] a python that states changes: false, which calls a change through tent.call, is T0013, and nothing is written', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const error = await refusal(app.call('quiet', {}, { as: await user() }))
  assert.equal(error.code, 'T0013')
  assert.equal(countOf(dataFolder, 'notes'), 0)
})

test('[05-14.9] a file in the output whose path names a file of the computer outside the folder of the call, straight, beside it, through a link to a file and through a link to a folder, is T7119, and nothing is stored', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  assert.match(String(Object(await app.call('writes', { where: 'inside' }, { as: ada })).made), /^[\w-]+$/)
  const stored = countOf(dataFolder, '_t_files')
  for (const where of ['outside', 'dotdot', 'linked', 'folderLink']) {
    const error = await refusal(app.call('writes', { where }, { as: ada }))
    if (error.code === 'no-links') {
      t.diagnostic(`${where}: this user may make no link to a file on this computer`)
      continue
    }
    assert.equal(error.code, 'T7119', `${where}: ${error.message}`)
    assert.match(error.message, /made/, where)
  }
  assert.equal(countOf(dataFolder, '_t_files'), stored, 'nothing is stored')
})

test('[05-14.10] Python code that reads the standard input finds it closed', async (t) => {
  const { app, user } = await opened(t, shared)
  assert.equal(await app.call('stdin', {}, { as: await user() }), 'the input is closed')
})

test('[05-14.10] a frame of a gigabyte that Python writes to the channel is refused at its size and the Python program ended; so is an answer past the size of a frame', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const header = refusal(app.call('floods', { how: 'header' }, { as: ada }))
  const first = await numberIn(dataFolder, 'floods.pid')
  assert.equal((await header).code, 'T7119')
  await untilWithin(() => !running(first), 'the Python program that sent the frame was ended')
  const answer = await refusal(app.call('floods', { how: 'answer' }, { as: ada }))
  assert.equal(answer.code, 'T7119')
  assert.equal(typeof (await app.call('pid', {}, { as: ada })), 'number')
})

/** Starts the program of the tests that holds an app of the bundle, and answers its number and the lines of JSON it says. */
function holding(
  t: TestContext,
  dataFolder: string,
  what: string,
): { pid: number; next(): Promise<Record<string, unknown>> } {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, 'pythonPrograms', 'engine.ts'), shared.bundle, dataFolder, what],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  t.after(() => {
    if (child.exitCode === null) child.kill()
  })
  const lines: Record<string, unknown>[] = []
  const waiting: ((line: Record<string, unknown>) => void)[] = []
  createInterface({ input: child.stdout }).on('line', (line) => {
    const read = JSON.parse(line)
    const one = waiting.shift()
    if (one) one(read)
    else lines.push(read)
  })
  return {
    pid: child.pid ?? 0,
    next: () => {
      const line = lines.shift()
      return line ? Promise.resolve(line) : new Promise((done) => waiting.push(done))
    },
  }
}

test('[05-14.13] the engine killed while a Python program works leaves no Python program', async (t) => {
  const dataFolder = mkdtempSync(join(shared.home, '..', 'killed-'))
  const engine = holding(t, dataFolder, 'pid')
  const { pid } = await engine.next()
  assert.equal(running(Number(pid)), true)
  process.kill(engine.pid, 'SIGKILL')
  await untilWithin(() => !running(Number(pid)), 'the Python program ended with its engine', 15_000)
})

test('[05-14.13] a new version while a Python program is warm: the next call runs the new code, and the warm program of the old version is ended', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  assert.equal(await app.call('later', {}, { as: ada }), 'the first version')
  const old = Number(await app.call('pid', {}, { as: ada }))
  const next = mkdtempSync(join(shared.home, '..', 'later-'))
  cpSync(shared.project, next, { recursive: true })
  writeFileSync(join(next, 'py', 'later.py'), 'def run(input, tent):\n    return "the second version"\n')
  const built = await buildProject(next, { for: 'dev' })
  await app.switch(await app.add(built.bundleFolder))
  assert.equal(await app.call('later', {}, { as: ada }), 'the second version')
  await untilWithin(() => !running(old), 'the warm Python program of the old version ended')
})

test('[05-14.13] a new version while a Python program works: the call under way keeps its folder and its rows file, and is answered', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  await app.write([{ add: 'notes', values: { body: 'one' } }], { as: 'system' })
  const next = mkdtempSync(join(shared.home, '..', 'held-'))
  cpSync(shared.project, next, { recursive: true })
  writeFileSync(join(next, 'py', 'later.py'), 'def run(input, tent):\n    return "the second version"\n')
  const built = await buildProject(next, { for: 'dev' })
  const call = app.call('holder', {}, { as: ada })
  await untilWithin(() => existsSync(join(dataFolder, 'disk', 'holder.started')), 'the call is under way')
  await app.add(built.bundleFolder)
  assert.deepEqual(await call, { text: 'held', notes: 1 })
})

test('[05-14.14] tent python install of a project whose lock holds a line that is an option is T7020, and makes no environment', async (t) => {
  const home = freshHome(t)
  const project = mkdtempSync(join(shared.home, '..', 'optioned-'))
  cpSync(shared.project, project, { recursive: true })
  const lock = readFileSync(join(project, 'python.lock'), 'utf8').split('\n')
  lock.splice(2, 0, '--index-url http://127.0.0.1:9/elsewhere/simple')
  writeFileSync(join(project, 'python.lock'), lock.join('\n'))
  const done = await typed(project, 'python', 'install', '--json')
  const findings: unknown = Reflect.get(done.answer, 'findings')
  assert.ok(
    Array.isArray(findings) && findings.some((one) => Reflect.get(Object(one), 'code') === 'T7020'),
    done.printed,
  )
  const envs = join(home, 'fetched', 'python-envs')
  assert.equal(existsSync(envs) && readdirSync(envs).some((one) => !one.startsWith('.')), false)
})

test('[05-14.17] a python that reaches itself through tent.call is T5105 at callDepth, and leaves no Python program of its calls', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const warm = Number(await app.call('pid', {}, { as: ada }))
  const error = await refusal(app.call('selfie', {}, { as: ada }))
  assert.equal(error.code, 'T5105')
  assert.equal(Number(await app.call('pid', {}, { as: ada })), warm)
})

for (const how of ['time', 'memory', 'exit'] as const)
  test(`[05-14.18] a program that the Python code started is ended with the Python program, where that was ended at its ${how === 'exit' ? 'crash' : how}, and the next call is answered`, async (t) => {
    const { app, user, dataFolder } = await opened(t, shared)
    const ada = await user()
    const call = refusal(app.call('spawns', { how }, { as: ada }))
    const child = await numberIn(dataFolder, `child-${how}`)
    // A program that is left behind holds the folders of the test until it ends by itself.
    t.after(() =>
      untilWithin(() => !running(child), 'the program left behind ended by itself', 45_000).catch(() => undefined),
    )
    // The Python program waits for the word of the test, so that it cannot end before the test has looked.
    assert.equal(running(child), true)
    writeFileSync(join(dataFolder, 'disk', `go-${how}`), '')
    const error = await call
    await untilWithin(() => !running(child), 'the program that the Python code started was ended', 10_000)
    assert.equal(error.code, how === 'time' ? 'T0008' : 'T7119', error.message)
    const began = performance.now()
    assert.equal(typeof (await app.call('pid', {}, { as: ada })), 'number')
    assert.ok(performance.now() - began < 20_000)
  })

test('[05-14.18] a Python program that crashed while a program it started still holds its output: the next call is answered by a new Python program, and the crashed call is T7119', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const before = Number(await app.call('pid', {}, { as: ada }))
  const call = refusal(app.call('spawns', { how: 'exit' }, { as: ada }))
  const child = await numberIn(dataFolder, 'child-exit')
  t.after(() =>
    untilWithin(() => !running(child), 'the program left behind ended by itself', 45_000).catch(() => undefined),
  )
  writeFileSync(join(dataFolder, 'disk', 'go-exit'), '')
  const error = await call
  const next = await app.call('pid', {}, { as: ada }).catch((thrown: unknown) => thrown)
  assert.equal(typeof next, 'number', `the next call: ${String(Reflect.get(Object(next), 'code'))}`)
  assert.notEqual(next, before)
  assert.equal(error.code, 'T7119', error.message)
})

test('[05-14.19] a small definition called in a Python program that holds a large one is held to what it adds', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const [large, small] = await Promise.all([
    app.call('large', {}, { as: ada }),
    new Promise((done) => setTimeout(done, 500)).then(() => app.call('small', {}, { as: ada })),
  ])
  assert.deepEqual([large, small], [200, 10])
})

test('[05-14.20] tent python clean while another engine uses the environment: the environment was used within its time, and stays', async (t) => {
  const { app, user } = await opened(t, shared)
  const envs = join(shared.home, 'fetched', 'python-envs')
  const ada = await user()
  await app.call('pid', {}, { as: ada })
  const [env] = readdirSync(envs).filter((one) => !one.startsWith('.'))
  assert.ok(env)
  // Its mark says it was last used forty days ago, and another engine uses it now.
  const old = new Date(Date.now() - 40 * 86_400_000)
  utimesSync(join(envs, env, '.tent-whole'), old, old)
  const other = await opened(t, shared)
  await other.app.call('pid', {}, { as: await other.user() })
  const cleaned = await cleanPython({ folder: shared.home })
  assert.deepEqual(cleaned.removed, [])
  assert.ok(existsSync(join(envs, env, '.tent-whole')))
  assert.equal(typeof (await app.call('pid', {}, { as: ada })), 'number')
})

test('[05-14.21] a file that Python wrote which is larger than uploadSize is T7119, and nothing is stored', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const stored = countOf(dataFolder, '_t_files')
  const error = await refusal(app.call('writes', { where: 'large' }, { as: ada }))
  assert.equal(error.code, 'T7119')
  assert.match(error.message, /uploadSize/)
  assert.equal(countOf(dataFolder, '_t_files'), stored)
})
