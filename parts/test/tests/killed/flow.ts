// A program that opens an app, starts a run of a flow, and stands still when one of its steps is saved, until it
// is killed. Started again, it opens the app once more, waits for the run to end and says what it finds.
// Run: node flow.ts <bundle> <data folder> <flow> <how many steps are done when the first start stands still>
import { existsSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createEngine } from '../../../engine/index.ts'

const [bundle, dataFolder, flow, after] = process.argv.slice(2)
const once = join(dataFolder, '..', 'killed-once')
const system = { as: { kind: 'system' } }

const engine = createEngine({ port: 0 })
let done = 0
engine.on('step.done', () => {
  done += 1
  if (done !== Number(after) || existsSync(once)) return
  // The step is saved. The first start stands still here until it is killed, so that nothing follows the step.
  writeFileSync(once, '')
  writeSync(1, `saved step ${after}\n`)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [held] = app.runs.find({ flow })
const run = held?.id ?? (await app.start(flow, { name: 'Ada' }, system)).run
const answer = await app.runs.wait(run)
const steps = app.runs.read(run).steps.map((step) => `${step.name} ${step.repeat} ${step.state}`)
const marks = (await app.call('allMarks', {}, system)).map((row) => row.what)
await engine.close()

// Each time the work of a step was carried out, it wrote one line of the log.
const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
const noted = log
  .prepare(`SELECT data FROM "lines" WHERE message = 'noted' ORDER BY rowid`)
  .all()
  .map((row) => JSON.parse(String(row.data)).what)
log.close()
console.log(`ended: ${JSON.stringify({ answer, steps, marks, noted })}`)
