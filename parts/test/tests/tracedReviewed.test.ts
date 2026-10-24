import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'
import { answerJson, remoteOf, untilWithin } from './remotes.ts'

/** Every row of a table of a log, as it stands now. */
function rowsOf(logFile: string, table: string): Record<string, unknown>[] {
  const db = new DatabaseSync(logFile, { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    db.close()
  }
}

test('[44-1] a trace whose error comes in a run after its call was answered is kept whole at a share of 0, the door and the call with it', async (t) => {
  // The shipping service fails every quote: the run that the press started fails after the call was answered.
  const shipping = await remoteOf(t, (_, response) => answerJson(response, 500, { error: 'down' }))
  const folder = copyOf(t, 'traced')
  const project = join(folder, 'tent.ts')
  writeFileSync(project, readFileSync(project, 'utf8').replace('share: 1,', 'share: 0,'))
  const file = join(folder, 'functions.ts')
  const functions = readFileSync(file, 'utf8').replace('http://127.0.0.1:1', shipping.origin)
  // The run tries its work once, so that it fails at its first quote.
  writeFileSync(
    file,
    functions.replace("export const fulfil = flow('fulfil', {", "export const fulfil = flow('fulfil', {\n  tries: 1,"),
  )
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  const dataFolder = join(folder, 'data')
  testSecrets(dataFolder, made.description, { SHIPPING_KEY: 'k', OTLP_TOKEN: 'o' })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  const logFile = join(dataFolder, 'logs.db')
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const origin = `http://localhost:${port}`
  const place = async (title: string): Promise<string> => {
    const answer = await app.request(
      new Request(`${origin}/_t/call/placeOrder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ input: { title, note: 'fragile' } }),
      }),
    )
    assert.equal(answer.status, 200)
    return String(Object(await answer.json()).value)
  }
  // A first call warms the app, so that the call of the test is fast and kept for its error alone.
  await place('Warm')
  const order = await place('Lamp')
  const [call] = rowsOf(logFile, 'calls')
    .filter((row) => row.name === 'placeOrder')
    .slice(-1)
  const trace = String(call?.trace)
  assert.ok(Number(call?.ms) < 500, `the call of the test is no slow span: ${String(call?.ms)} ms`)
  // The run of the order fails its quote: the trace holds an error.
  const runOf = (): unknown => rowsOf(logFile, 'outgoing').find((row) => row.trace === trace)?.run
  await untilWithin('the run of the order called the service', () => runOf() !== undefined, 30_000)
  await untilWithin('the run of the order failed', () => app.runs.read(String(runOf()))?.state === 'failed', 60_000)
  await untilWithin('what the failure kept is written', () =>
    rowsOf(logFile, 'spans').some((row) => row.trace === trace && row.ok === 0),
  )
  const kept = rowsOf(logFile, 'spans').filter((row) => row.trace === trace)
  // Every trace that holds an error is kept whole (44-big-apps, section 1, point 5).
  assert.ok(
    kept.some((row) => row.kind === 'door') && kept.some((row) => row.kind === 'write'),
    `the door and the writes of the order ${order} are kept with its error: ${JSON.stringify(kept.map((row) => [row.kind, row.name, row.ok]))}`,
  )
})
