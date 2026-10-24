// A program that makes the starts of a flow paced by one part of `pace`, and is killed after its last start: the
// second start makes none, and waits for every run that the kept starts make.
// Run: node pacedParts.ts <data folder> <part>
import { appendFileSync, existsSync, readFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { sqliteStore } from '../../../data/index.ts'
import { createRunner, runTableSteps } from '../../index.ts'
import { movingClock } from './moving.ts'

const [folder, part] = process.argv.slice(2)
const version = 'v1'
const store = sqliteStore()
store.open(folder)
const steps = runTableSteps(store.layout(), { make: true })
if (steps.length) store.write(() => store.applyTableChanges(steps))

// The pace of each part, and the starts the first start of the program makes: each with its number and its rank.
const paces = {
  debounce: { debounce: 300 },
  batch: { batch: { max: 5, wait: 300 } },
  drop: { drop: { max: 1, per: 3_600_000 } },
  perMinute: { perMinute: 1 },
  ranked: { order: { export: 'paced_pace_order' }, turns: 'key' },
}
const starts = [1, 2, 3]
const ran = join(folder, 'ran.log')
const made = join(folder, 'made')
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
      pace: paces[part],
      ...(part === 'ranked' ? { together: { max: 1 } } : {}),
    },
  },
}

/** The flow: one step, which notes what it was handed: its input, or the inputs of the starts of its batch. */
async function paced({ input, events, step }) {
  const handed = events ? events.map((one) => one.input.n).join(' ') : String(input.n)
  return step('note', async () => {
    // Under `ranked` the first run holds its turn a moment, so that the others wait behind it.
    if (part === 'ranked' && input.n === 0) await new Promise((done) => setTimeout(done, 300))
    appendFileSync(ran, `${handed}\n`)
    return handed
  })
}

const runner = createRunner({
  store,
  clock: movingClock,
  description: () => description,
  body: () => paced,
  arrow: () => (handed) => handed.input.n,
  inside: (_at, work) => work(),
  db: () => ({}),
  caller: () => ({ kind: 'system' }),
  onThread: () => Promise.reject(new Error('no thread')),
  told: () => undefined,
  removed: () => undefined,
})
runner.live(version)
runner.start()
if (!existsSync(made)) {
  // Under `ranked` a run that holds the turn comes first, so that the three starts wait and are ordered.
  for (const n of part === 'ranked' ? [0, ...starts] : starts)
    runner.add({ flow: 'paced', version, startedBy: { kind: 'system' }, input: { n } })
  appendFileSync(made, 'made\n')
  // Every start is written: the harness kills the program here, while the kept starts wait.
  writeSync(1, 'added all\n')
  await new Promise((done) => setTimeout(done, 60_000))
}
// The second start makes no start: it waits until each run that was kept has ended.
for (;;) {
  const runs = runner.find({ flow: 'paced' })
  if (runs.length && runs.every((run) => ['done', 'failed', 'stopped'].includes(run.state))) break
  await new Promise((done) => setTimeout(done, 20))
}
await new Promise((done) => setTimeout(done, 400))
const runs = runner.find({ flow: 'paced' }).length
await runner.close()
store.close()
const noted = existsSync(ran) ? readFileSync(ran, 'utf8').trim().split('\n') : []
console.log(`ended: ${JSON.stringify({ runs, noted })}`)
