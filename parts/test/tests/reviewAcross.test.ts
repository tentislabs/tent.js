import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { ChangeSink } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testClock } from '../clock.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: 'system' } as const

test('[20-6] a sink that fails is handed the write again after limits.sinkWait of the project, and not before', async (t) => {
  const project = copyOf(t, 'bare')
  const file = join(project, 'tent.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace("{ title: 'Bare' }", "{ title: 'Bare', limits: { sinkWait: '1 minute' } }"),
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.code),
    [],
  )
  const dataFolder = join(built.bundleFolder, '..', 'data')
  const { clock, moves } = testClock()
  // The numbers of the writes the sink was handed, and the one it failed on.
  const handed: number[] = []
  let failed: number | undefined
  const sink: ChangeSink = {
    start: (n) => n,
    wrote: (change) => {
      handed.push(change.n)
      if (failed === undefined && change.rows?.some((one) => one.table === 'things')) {
        failed = change.n
        throw new Error('the store of the copy is away')
      }
    },
  }
  const engine = createEngine({ port: 0, makers: { clock: () => clock, changes: () => sink } })
  closing(t, () => engine.close())
  testSecrets(dataFolder, built.description, {})
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: '*' })
  await app.write([{ add: 'things', values: { name: 'one' } }], system)
  // How often the write that failed was handed, once what is due has run.
  const handedAt = async (): Promise<number> => {
    for (let k = 0; k < 20; k++) await new Promise((done) => setImmediate(done))
    return handed.filter((n) => n === failed).length
  }
  assert.equal(await handedAt(), 1, 'the sink was handed the write once')
  moves.advance('10 seconds')
  assert.equal(await handedAt(), 1, 'ten seconds after the failure, a wait of a minute has not passed')
  moves.advance('1 minute')
  assert.equal(await handedAt(), 2, 'after the minute the write is handed again')
})
