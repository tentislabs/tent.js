import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { opened, running, sharedPython, untilWithin } from './pythonApps.ts'

const shared = sharedPython('program')

/** Answers the error that a promise was refused with: a test reads its code and its words. */
async function refusal(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise
  } catch (error) {
    return Object(error)
  }
  return assert.fail('the call was answered')
}

/** Starts the program of the tests that holds the app, and answers it with the lines of JSON it says, as they come. */
function holding(
  t: TestContext,
  dataFolder: string,
  what: string,
): { pid: number; next(): Promise<Record<string, unknown>> } {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, 'pythonPrograms', 'engine.ts'), shared.bundle, dataFolder, what],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
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

test('[25-14] a second call is carried out by the same Python program, and with one Python program two calls are carried out one after the other, while a definition with atOnce: 2 takes two at once', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const first = await app.call('pid', {}, { as: ada })
  assert.equal(await app.call('pid', {}, { as: ada }), first)
  const [one, two] = (
    await Promise.all([
      app.call('inTurn', { seconds: 1 }, { as: ada }),
      app.call('inTurn', { seconds: 1 }, { as: ada }),
    ])
  ).map((answer) => Object(answer))
  assert.equal(one.pid, two.pid)
  assert.ok(Math.max(one.began, two.began) >= Math.min(one.ended, two.ended) - 0.05, 'one after the other')
  const [three, four] = (
    await Promise.all([
      app.call('together', { seconds: 1 }, { as: ada }),
      app.call('together', { seconds: 1 }, { as: ada }),
    ])
  ).map((answer) => Object(answer))
  assert.equal(three.pid, four.pid)
  assert.ok(Math.max(three.began, four.began) < Math.min(three.ended, four.ended), 'at one time')
})

test('[25-14] a python that calls another through tent.call does not wait for itself: the inner one is handed a Python program beyond the count', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const said = String(await app.call('outer', {}, { as: ada }))
  const [outer, inner] = [...said.matchAll(/in (\d+)/g)].map((one) => one[1])
  assert.ok(outer && inner && outer !== inner, said)
})

test('[25-14] a call past its time is T0008 and the next call works, and the loading of a slow file does not count on the time of a call', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const ended = await refusal(app.call('slow', { seconds: 4 }, { as: ada }))
  assert.equal(ended.code, 'T0008')
  assert.equal(typeof (await app.call('slow', { seconds: 0 }, { as: ada })), 'number')
  // The file sleeps three seconds as it loads, and its call may take one.
  assert.equal(await app.call('slowLoad', {}, { as: ada }), 'loaded')
})

test('[25-14] a call that takes more memory than its limit is T7119 that names the limit, and a small definition in a Python program that holds a large one is held to what it adds', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const error = await refusal(app.call('hog', { mb: 300 }, { as: ada }))
  assert.equal(error.code, 'T7119')
  assert.match(error.message, /100 MB/)
  assert.equal(await app.call('hog', { mb: 10 }, { as: ada }), 10)
  // The large one holds two hundred MB once loaded, in the same program as the small one, which adds ten.
  const [large, small] = await Promise.all([
    app.call('large', {}, { as: ada }),
    new Promise((done) => setTimeout(done, 500)).then(() => app.call('small', {}, { as: ada })),
  ])
  assert.deepEqual([large, small], [200, 10])
})

test('[25-14] a Python program that ends in the middle of a call fails that call alone with T7119, and the engine keeps answering, with a new Python program for the next call', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const before = Number(await app.call('pid', {}, { as: ada }))
  assert.equal((await refusal(app.call('dies', {}, { as: ada }))).code, 'T7119')
  const after = Number(await app.call('pid', {}, { as: ada }))
  assert.notEqual(after, before)
  assert.equal(running(before), false)
  const rows = await app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' })
  assert.ok(rows)
})

test('[25-14] an idle Python program is ended after pythonStopAfter, and the next call starts a new one', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  const idle = Number(await app.call('pid', {}, { as: ada }))
  await untilWithin(() => !running(idle), 'the idle Python program ended', 15_000)
  assert.notEqual(await app.call('pid', {}, { as: ada }), idle)
})

test('[25-14] after a new version the next call runs the new code, in a Python program of the new version', async (t) => {
  const { app, user } = await opened(t, shared)
  const ada = await user()
  assert.equal(await app.call('later', {}, { as: ada }), 'the first version')
  const next = mkdtempSync(join(shared.home, '..', 'later-'))
  cpSync(shared.project, next, { recursive: true })
  writeFileSync(join(next, 'py', 'later.py'), 'def run(input, tent):\n    return "the second version"\n')
  const built = await buildProject(next, { for: 'dev' })
  const version = await app.add(built.bundleFolder)
  await app.switch(version)
  assert.equal(await app.call('later', {}, { as: ada }), 'the second version')
})

test('[25-14] the Python program of the old version ends after a switch once it holds no call, with no call of the new version', async (t) => {
  const { app, user } = await opened(t, shared)
  const next = mkdtempSync(join(shared.home, '..', 'switched-'))
  cpSync(shared.project, next, { recursive: true })
  writeFileSync(join(next, 'py', 'later.py'), 'def run(input, tent):\n    return "the second version"\n')
  const version = await app.add((await buildProject(next, { for: 'dev' })).bundleFolder)
  const old = Number(await app.call('pid', {}, { as: await user() }))
  await app.switch(version)
  // Sooner than pythonStopAfter, three seconds: the switch ends it, not its idle time.
  await untilWithin(() => !running(old), 'the Python program of the old version ended', 1500)
})

test('[25-14] the engine killed leaves no Python program', async (t) => {
  const dataFolder = mkdtempSync(join(shared.home, '..', 'killed-'))
  const engine = holding(t, dataFolder, 'pid')
  const { pid } = await engine.next()
  assert.equal(typeof pid, 'number')
  assert.equal(running(Number(pid)), true)
  process.kill(engine.pid)
  await untilWithin(() => !running(Number(pid)), 'the Python program ended with its engine', 15_000)
})

test('[25-14] a call that holds the processor for a second counts a second of cpuMs under its name, two calls that overlap share the time of the overlap, a call ended at its time counts all but its last second, and children of engine.program() holds the time of the loading', async (t) => {
  const { app, engine, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  const before = engine.program().children.cpuMs
  await app.call('spin', { seconds: 1 }, { as: ada })
  // Two calls that overlap in one program share the time of the overlap: together they hold it a second.
  await Promise.all([app.call('spin', { seconds: 1 }, { as: ada }), app.call('spin', { seconds: 1 }, { as: ada })])
  assert.equal((await refusal(app.call('spinLong', { seconds: 5 }, { as: ada }))).code, 'T0008')
  // The program of the call that was ended at its time has ended once its children's time stands still.
  await new Promise((done) => setTimeout(done, 2000))
  const children = engine.program().children.cpuMs - before
  // What was counted is written when the app closes, and read from its data then.
  await app.close()
  const db = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  const spent = (name: string): number =>
    db
      .prepare('SELECT amount FROM _t_counts WHERE name = ? AND unit = ?')
      .all(name, 'cpuMs')
      .reduce((sum, row) => sum + Number(Reflect.get(Object(row), 'amount')), 0)
  const [one, ended] = [spent('spin'), spent('spinLong')]
  db.close()
  assert.ok(one >= 1400 && one <= 3000, 'two seconds of the processor under spin: ' + one)
  // A call of three seconds ended at its time has counted what its last reading, once a second, said of it.
  assert.ok(ended >= 1800 && ended <= 3200, 'all but the last second of the call ended at its time: ' + ended)
  assert.ok(children >= one + ended, 'the children hold the calls and the loading: ' + children)
})

test('[25-15b] with the stand-in switched off a first call fails with T0016 and the app keeps answering, and the wait of a first install does not count on the time of the call', async (t) => {
  // A runner's folder of its own, which holds no part and no environment yet.
  const home = mkdtempSync(join(shared.home, '..', 'fresh-'))
  const before = process.env.TENT_HOME
  process.env.TENT_HOME = home
  const parts = process.env.TENT_PARTS
  t.after(() => {
    process.env.TENT_HOME = before
    process.env.TENT_PARTS = parts
  })
  process.env.TENT_PARTS = 'http://127.0.0.1:9/parts'
  const off = await opened(t, shared)
  const ada = await off.user()
  const error = await refusal(off.app.call('slow', { seconds: 0 }, { as: ada }))
  assert.equal(error.code, 'T0016')
  assert.ok(await off.app.write([{ add: 'customers', values: { name: 'Lovelace' } }], { as: 'system' }))
  // With the stand-in, the first call waits for the installer, the Python and the environment, which take longer
  // than the two seconds the call may take, and answers.
  process.env.TENT_PARTS = parts
  const on = await opened(t, shared)
  const grace = await on.user()
  const began = performance.now()
  assert.equal(typeof (await on.app.call('slow', { seconds: 0 }, { as: grace })), 'number')
  assert.ok(performance.now() - began > 2000, 'the making was waited for')
})
