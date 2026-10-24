// A program that starts twelve runs of a flow that is paced, three each fifth of a second, and is killed after one
// of its starts: the second start adds the starts that the first did not, and waits for every run to end.
// Run: node paced.ts <data folder>
import { appendFileSync, readFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { sqliteStore } from '../../../data/index.ts'
import { createRunner, runTableSteps } from '../../index.ts'
import { movingClock } from './moving.ts'

const [folder] = process.argv.slice(2)
const version = 'v1'
const store = sqliteStore()
store.open(folder)
const steps = runTableSteps(store.layout(), { make: true })
if (steps.length) store.write(() => store.applyTableChanges(steps))

const ran = join(folder, 'ran.log')
const description = {
  format: 'tent.description/1',
  app: { name: 'paced', needsEngine: '1' },
  project: {},
  tables: {},
  functions: {},
  flows: {
    paced: {
      form: 'code',
      export: 'paced',
      input: { n: { kind: 'number' } },
      pace: { perMinute: 3 },
    },
  },
}

/** The flow: one step, which notes the number it was handed. */
async function paced({ input, step }) {
  return step('note', () => {
    appendFileSync(ran, `${input.n}\n`)
    return input.n
  })
}

const runner = createRunner({
  store,
  clock: movingClock,
  description: () => description,
  body: () => paced,
  inside: (_at, work) => work(),
  db: () => ({}),
  caller: () => ({ kind: 'system' }),
  onThread: () => Promise.reject(new Error('no thread')),
  told: () => undefined,
  removed: () => undefined,
})
runner.live(version)
runner.start()
const had = new Set(runner.find({ flow: 'paced' }).map((run) => run.input.n))
for (let n = 1; n <= 12; n += 1) {
  if (had.has(n)) continue
  runner.add({ flow: 'paced', version, startedBy: { kind: 'system' }, input: { n } })
  // The start is written when `add` answers: the line tells the harness that it may kill the program here.
  writeSync(1, `added ${n}\n`)
}
const runs = runner.find({ flow: 'paced' })
const answers = await Promise.all(runs.map((run) => runner.wait(run.id)))
await runner.close()
store.close()
const noted = readFileSync(ran, 'utf8').trim().split('\n').map(Number)
console.log(`ended: ${JSON.stringify({ answers: answers.sort((a, b) => a - b), noted: [...new Set(noted)].sort((a, b) => a - b) })}`)
