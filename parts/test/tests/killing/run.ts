// A program that runs the flows of an app, to be killed at a random moment and started again, many times over.
// Run: node run.ts <bundle> <data folder> <runs of a batch>
// Each start opens the app. Where every run has ended it starts a batch of new ones, so that each start has work
// to be killed in; it then waits until every run has ended, prints `ended:` with the state and the steps of each
// run and the marks the steps wrote, and ends by itself.
const [bundle, dataFolder, batch] = process.argv.slice(2)
const { createEngine } = await import('../../../engine/index.ts')

const system = { as: { kind: 'system' } }
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const all = () => app.runs.find({ flow: 'chain' })
const over = (run) => run.state === 'done' || run.state === 'failed' || run.state === 'stopped'
const before = all()
if (before.every(over))
  for (let k = 0; k < Number(batch); k++) await app.start('chain', { i: before.length + k }, system)
while (!all().every(over)) await new Promise((done) => setTimeout(done, 20))
const runs = all().map((run) => ({
  state: run.state,
  input: run.input,
  steps: app.runs.read(run.id)?.steps.map((step) => `${step.name}:${step.state}`),
}))
const marks = await app.read({ from: 'marks' }, system)
// Written to a pipe, a long line is still going out when the program ends: the end waits until it is written.
const line = `ended: ${JSON.stringify({ runs, marks: marks.map((row) => row.tag) })}\n`
await new Promise((done) => process.stdout.write(line, done))
await engine.close()
process.exit(0)
