import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import { serveSync } from '../../publish/index.ts'
import { copied } from './typed.ts'

/** A server of these tests: the project `merging` run in an engine with its history served, and how to reach it. */
export interface Served {
  project: string
  data: string
  address: string
  app: App
  history: History
}

/**
 * Starts a server as `tent start` does: the project `merging` is built for release and run live on a data folder
 * of its own, on a port the system gives, with the addresses of publishing. It is closed when the test ends, and
 * `TENT_HOME`, `TENT_KEY` and `TENT_AT` are put back.
 */
export async function servedApp(t: TestContext, name: string): Promise<Served> {
  const before = { home: process.env.TENT_HOME, key: process.env.TENT_KEY, at: process.env.TENT_AT }
  const engine = createEngine({ port: 0 })
  let history: History | undefined
  t.after(async () => {
    await engine.close()
    history?.close()
    for (const [variable, value] of [
      ['TENT_HOME', before.home],
      ['TENT_KEY', before.key],
      ['TENT_AT', before.at],
    ] as const)
      if (value === undefined) delete process.env[variable]
      else process.env[variable] = value
  })
  const project = copied(t, name, 'merging')
  const built = await buildProject(project, { for: 'release' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '..', 'server-data')
  mkdirSync(data, { recursive: true })
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'live' })
  history = openHistory(data)
  serveSync(engine, app, history)
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  process.env.TENT_HOME = join(project, '..', 'home')
  return { project, data, address: `http://127.0.0.1:${port}`, app, history }
}
