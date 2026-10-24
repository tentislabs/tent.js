import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { App, Workers } from '../index.ts'
import { bundled, engineOf, portOf, testClock, workFolder } from './apps.ts'

/** The keys of the workers of these tests: one free, one bound to a kind with one place, and one bound to one worker. */
export const joiningKeys = { free: 'f'.repeat(40), gpuOnly: 'g'.repeat(40), single: 's'.repeat(40) }

/** A writer of the project of heavy work on a clock that the test moves, which lets the workers of `joiningKeys` join. */
export async function writerOf(
  t: TestContext,
  o: {
    change?: (description: Description) => void
    workers?: Workers
    bodies?: Record<string, Record<string, object>>
  } = {},
) {
  const { clock, advance } = testClock()
  const bundle = await bundled(t, {
    project: 'working',
    ...(o.change ? { change: o.change } : {}),
    ...(o.bodies ? { bodies: o.bodies } : {}),
  })
  const host = o.workers
  const engine = engineOf(t, { makers: { clock: () => clock, ...(host ? { workers: () => host } : {}) } })
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, {
    dataFolder,
    mode: 'test',
    insecure: true,
    workers: [
      joiningKeys.free,
      { key: joiningKeys.gpuOnly, kinds: ['gpu'], atOnce: 1 },
      { key: joiningKeys.single, workers: 1 },
    ],
  })
  return { app, engine, advance, clock, dataFolder, origin: `http://localhost:${portOf(dataFolder)}` }
}

/** A worker that the test drives by hand: what it sends, and the messages that the writer sent it, in order. */
export interface RawWorker {
  send(message: object): void
  sendText(text: string): void
  heard: Record<string, unknown>[]
  closed(): boolean
  close(): void
  /** Waits for the first message of that name from the writer that this worker has not been handed yet, and answers it. */
  next(t: string): Promise<Record<string, unknown>>
}

/** Opens the link of a worker to an app with no network, with a key, and holds what arrives. */
export function rawWorker(app: App, key: string): RawWorker {
  const link = app.link(new Request('http://localhost/_t/work', { headers: { authorization: `Bearer ${key}` } }))
  const heard: Record<string, unknown>[] = []
  const taken = new Set<Record<string, unknown>>()
  let over = false
  link.each(
    (frame) => {
      if (typeof frame === 'string') heard.push(Object(JSON.parse(frame)))
    },
    () => {
      over = true
    },
  )
  return {
    send: (message) => link.send(JSON.stringify(message)),
    sendText: (text) => link.send(text),
    heard,
    closed: () => over,
    close: () => link.close(),
    async next(t) {
      for (let i = 0; i < 2000; i++) {
        const found = heard.find((one) => one.t === t && !taken.has(one))
        if (found) {
          taken.add(found)
          return found
        }
        await new Promise((done) => setTimeout(done, 5))
      }
      assert.fail(`the writer never sent ${t}: it sent ${JSON.stringify(heard.map((one) => one.t))}`)
    },
  }
}

/** What a worker says when it joins. */
export const here = (o: { id?: string; kinds?: string[]; atOnce?: number; engine?: string } = {}) => ({
  t: 'here',
  id: o.id ?? '01m4x5y72ke6aay7szexb9d1dz',
  kinds: o.kinds ?? ['gpu'],
  atOnce: o.atOnce ?? 1,
  engine: o.engine ?? '1.0.0',
  working: [],
  lost: [],
})

/** A worker by hand that joined and is ready for every version. */
export async function readyWorker(app: Parameters<typeof rawWorker>[0], key: string, kinds: string[] = ['gpu']) {
  const worker = rawWorker(app, key)
  worker.send(here({ kinds }))
  await worker.next('go')
  const versions = await worker.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    worker.send({ t: 'ready', version: Object(one).version })
  return worker
}
