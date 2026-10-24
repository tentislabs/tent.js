import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { boolean, json, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { startWords } from './startWords.ts'
import { closed, copied, shell, typed } from './typed.ts'

const key = 'w'.repeat(48)
const heavy = join(import.meta.dirname, '..', '..', 'test', 'tests', 'heavy')

/** Waits until something holds, for as long as a worker takes to join over a link on a loaded machine. */
async function until(what: string | (() => string), holds: () => boolean): Promise<void> {
  const ends = performance.now() + 30_000
  while (!holds()) {
    assert.ok(performance.now() < ends, `never: ${typeof what === 'string' ? what : what()}`)
    await new Promise((done) => setTimeout(done, 20))
  }
}

const ids = (app: App): string[] => app.workers().map((one) => String(Reflect.get(Object(one), 'id')))

test('[51-2] [15-6@7b] `tent workers` lists the workers and what waits, `--release` hands one nothing more, and `tent start --works` runs a worker', async (t) => {
  const engine = createEngine({ port: 0 })
  // The worker and the engine end before the folder of the test is removed: what ends a test is done in the order it was said.
  let worker: ChildProcess | undefined
  t.after(async () => {
    if (worker && worker.exitCode === null) {
      const ended = new Promise((done) => worker?.once('exit', done))
      worker.kill()
      await ended
    }
    await engine.close()
  })
  const project = copied(t, 'workers', heavy)
  const built = await buildProject(project, { for: 'dev' })
  const data = join(project, '..', 'writer')
  // With no engine on the data folder, the command says so, and starts none.
  const none = await typed(project, 'workers', '--data', data, '--json')
  assert.deepEqual([none.ended, none.answer.findings?.[0].code], [1, 'T0013'])
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test', workers: [key], insecure: true })
  const { port } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  const keyFile = join(project, '..', 'worker.key')
  writeFileSync(keyFile, `${key}\n`)
  closed(keyFile)
  // The worker is a program of its own, as a person starts one on another machine; it is ended by its own number.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const words = startWords(['start', '--works', `http://127.0.0.1:${port}`, '--key-from', keyFile, '--kinds', 'gpu'])
  worker = spawn(process.execPath, [shell, ...words, '--data', join(project, '..', 'worker'), '--insecure'], {
    cwd: project,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let said = ''
  worker.stderr?.on('data', (piece) => {
    said += String(piece)
  })
  await until(
    () => `the worker joined: ${said}`,
    () => ids(app).length === 1,
  )
  const listed = await typed(project, 'workers', '--data', data, '--json')
  assert.equal(listed.ended, 0, listed.printed)
  const shape = object({
    ok: boolean(),
    value: object({ workers: list(json()), work: list(json()) }),
    findings: list(json()),
  })
  assert.deepEqual(checkValue(shape, listed.answer), [])
  const value = Object(listed.answer.value)
  assert.deepEqual(
    value.workers.map((one: object) => [Reflect.get(one, 'id'), Reflect.get(one, 'kinds')]),
    [[ids(app)[0], ['gpu']]],
  )
  // The list shows 8 characters of an id, and those name the worker.
  const released = await typed(project, 'workers', '--data', data, '--release', ids(app)[0].slice(0, 8), '--json')
  assert.deepEqual(released.answer.value, { released: ids(app)[0], empty: true })
  assert.equal(Reflect.get(Object(app.workers()[0]), 'released'), true)
  const shown = object({ released: text(), empty: boolean() })
  assert.deepEqual(checkValue(shown, released.answer.value), [])
})
