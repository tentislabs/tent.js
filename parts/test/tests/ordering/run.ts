// A program that carries the flow of a big order out, to be killed after one of its steps and started again.
// Run: node run.ts <bundle> <data folder> <file of the mail>
// Each start opens the app on a clock that the program moves past each wait, places the big order where none is
// placed yet, and prints `step done <name>` as each step is saved. Once the run has ended it prints `ended:` with
// the rows and the steps, and ends by itself.
import { appendFileSync, writeSync } from 'node:fs'

const [bundle, dataFolder, mailFile] = process.argv.slice(2)
const { createEngine } = await import('../../../engine/index.ts')

const system = { as: { kind: 'system' } }
let now = Date.now()
let timers = []
const clock = {
  now: () => now,
  setTimer(at, run) {
    const timer = { at, run }
    timers.push(timer)
    return () => {
      timers = timers.filter((one) => one !== timer)
    }
  },
}
const advance = (ms) => {
  now += ms
  const due = timers.filter((one) => one.at <= now)
  timers = timers.filter((one) => one.at > now)
  for (const one of due) one.run()
}
const mailer = {
  async send(message) {
    appendFileSync(mailFile, `${JSON.stringify({ to: message.to, subject: message.subject, text: message.text })}\n`)
    return {}
  },
}
const engine = createEngine({ port: 0, makers: { clock: () => clock, mailer: () => mailer } })
// The line is written at once, and the program then stands still a moment: a kill at the line lands before the
// next step does anything, on a quick computer as on a slow one.
engine.on('step.done', (told) => {
  writeSync(1, `step done ${told.step}\n`)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const orders = await app.read({ from: 'orders' }, system)
if (orders.length === 0) await app.call('placeBigOrder', {}, system)
for (;;) {
  const [run] = app.runs.find({ flow: 'bigOrder' })
  if (run && ['done', 'failed', 'stopped'].includes(run.state)) break
  if (run?.state === 'waiting' && run.steps?.some?.((step) => step.state === 'waiting')) advance(3 * 24 * 3600 * 1000 + 1000)
  await new Promise((done) => setTimeout(done, 20))
}
const [run] = app.runs.find({ flow: 'bigOrder' })
const rows = {
  customers: (await app.read({ from: 'customers' }, system)).map((row) => [row.name, row.email]),
  orders: (await app.read({ from: 'orders' }, system)).map((row) => row.total),
}
const steps = app.runs.read(run.id)?.steps.map((step) => `${step.name}:${step.state}`)
console.log(`ended: ${JSON.stringify({ state: run.state, error: run.error?.message, steps, rows })}`)
await engine.close()
process.exit(0)
