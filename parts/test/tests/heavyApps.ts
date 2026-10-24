import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** A caller of the system. */
export const system = { as: { kind: 'system' } } as const

/** The test app of the project of heavy work, with kinds of worker and options of its project added to what it states, closed when the test ends. */
export async function heavyWith(t: TestContext, kinds = '', project = ''): Promise<TestApp> {
  const folder = copyOf(t, 'heavy')
  const file = join(folder, 'tent.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('  workers: {\n', `${project}  workers: {\n${kinds}`))
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

export const heavyMoment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Waits until something holds, and fails where it never comes to. */
export async function untilAsync(what: string, holds: () => boolean | Promise<boolean>, tries = 1000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    await heavyMoment(5)
  }
  assert.fail(`never: ${what}`)
}

/** A worker of those kinds, closed when the test ends, once the writer holds it ready. */
export async function joined(t: TestContext, app: TestApp, kinds: string[], atOnce = 1): Promise<TestWorker> {
  const worker = await app.worker({ kinds, atOnce })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await untilAsync('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

/** Moves the clock on beat by beat, so that the writer takes a silent worker as gone. */
export async function beats(app: TestApp, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    app.clock.advance('1 second')
    await heavyMoment(5)
  }
}

/** The runs that a worker works on now. */
export const workingOn = (worker: TestWorker): string[] => worker.at().working.map((one) => one.run)
