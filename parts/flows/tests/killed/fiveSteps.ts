// A program that runs a flow of five steps, is killed right after one of them was saved, and started again: the
// second start takes the run up and ends it. Each step notes that it ran, and each pass notes what it was handed.
// Run: node fiveSteps.ts <data folder> <the step after which the first start is killed>
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sqliteStore } from '../../../data/index.ts'
import { createRunner, runsTable, scheduleTable, stepsTable } from '../../index.ts'
import { killedAt } from '../../../../rig/kill.ts'

const [folder, killAfter] = process.argv.slice(2)
const version = 'v1'
const store = sqliteStore()
store.open(folder)
if (!store.layout().some((one) => one.name === runsTable.name))
  store.write(() =>
    store.applyTableChanges([runsTable, stepsTable, scheduleTable].map((layout) => ({ do: 'addTable', table: layout.name, layout }))),
  )

const ran = join(folder, 'ran.log')
const seen = join(folder, 'seen.log')
const once = join(folder, 'killed-once')
const description = {
  format: 'tent.description/1',
  app: { name: 'killed', needsEngine: '1' },
  project: {},
  tables: {},
  functions: {},
  flows: { five: { form: 'code', export: 'five', input: { since: { kind: 'date' } } } },
}

/** The flow: five steps, each of which answers a date, and each pass writes down what it read of them. */
async function five({ input, step }) {
  const handed = input.since instanceof Date ? `a Date of ${input.since.toISOString()}` : typeof input.since
  appendFileSync(seen, `pass with input ${handed}\n`)
  let read = 0
  for (const n of [1, 2, 3, 4, 5]) {
    const answer = await step(`step ${n}`, () => {
      appendFileSync(ran, `${n}\n`)
      return { n, at: new Date(Date.UTC(2026, 0, n)) }
    })
    appendFileSync(seen, `step ${n} ${typeof answer.at} ${answer.at}\n`)
    read += 1
  }
  return read
}

const runner = createRunner({
  store,
  clock: { now: () => Date.now(), setTimer: (at, fn) => {
    const timer = setTimeout(fn, Math.max(0, at - Date.now()))
    return () => clearTimeout(timer)
  } },
  description: () => description,
  body: () => five,
  inside: (_at, work) => work(),
  db: () => ({}),
  caller: () => ({ kind: 'system' }),
  onThread: () => Promise.reject(new Error('no thread')),
  told: (what) => {
    if (what.kind !== 'step' || what.state !== 'done' || what.name !== `step ${killAfter}` || existsSync(once)) return
    // The step is saved. The first start stands still here until it is killed, so that nothing follows the step.
    writeFileSync(once, '')
    killedAt(`saved step ${killAfter}`)
  },
  removed: () => undefined,
})
runner.live(version)
const [held] = runner.find({ flow: 'five' })
const run = held?.id ?? runner.add({ flow: 'five', version, startedBy: { kind: 'system' }, input: { since: new Date(Date.UTC(2025, 5, 1)) } })
runner.start()
const answer = await runner.wait(run)
await runner.close()
const steps = runner.read(run).steps.map((one) => `${one.name}:${one.state}`)
store.close()
console.log(`ended: ${JSON.stringify({ answer, steps, ran: readFileSync(ran, 'utf8').trim().split('\n'), seen: readFileSync(seen, 'utf8').trim().split('\n') })}`)
