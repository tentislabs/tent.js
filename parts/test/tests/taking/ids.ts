// A program that reads an app with the clock of the system set back a day, takes over once its writer is gone,
// adds a row, and says the id of that row beside the ids it holds.
// Run: node ids.ts <address of the writer> <key> <data folder>
// The clock stands a day behind from before the engine is loaded: the maker of ids reads the time of the system.
const realNow = Date.now
Date.now = () => realNow() - 86_400_000

const [from, key, dataFolder] = process.argv.slice(2)
const { createEngine } = await import('../../../engine/index.ts')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const system = { as: { kind: 'system' } }
const engine = createEngine({ port: 0 })
const app = await engine.read({ from, key, dataFolder, insecure: true })
while (!app.at().current) await sleep(20)
console.log('current')

// The test writes on, and then stops the writer: this machine takes over once it knows that its writer is gone.
let took
for (;;) {
  try {
    took = await app.takeOver()
    break
  } catch (error) {
    if (!['T0032', 'T0029'].includes(error?.code)) throw error
    await sleep(50)
  }
}
const made = await app.call('addOrder', { title: 'by the machine that took over' }, system)
const held = (await app.read({ from: 'orders' }, system)).map((row) => row.id)
await engine.close()
console.log(`told: ${JSON.stringify({ made: made.id, held, n: took.n })}`)
process.exit(0)
