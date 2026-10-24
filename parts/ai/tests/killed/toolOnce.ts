// A program that runs an agent whose tool adds an order, and is killed right after the tool's write was committed
// and before its step was saved; the second start takes the run up and ends it, and prints the orders there are.
// Run: node toolOnce.ts <project folder> <bundle folder> <data folder> <folder of what is told>
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { createEngine } from '../../../engine/index.ts'
import { testSecrets } from '../../../test/secrets.ts'

const [project, out, dataFolder, told] = process.argv.slice(2)
mkdirSync(told, { recursive: true })
const named = join(told, 'bundle.txt')
if (!existsSync(named)) writeFileSync(named, (await buildProject(project, { for: 'release', out })).bundleFolder)
const bundle = readFileSync(named, 'utf8')
const once = join(told, 'killed-once')
const system = { kind: 'system' }

// The model asks for the tool first, and answers once its answer is in the conversation.
const writer = {
  async *reply(o) {
    if (!o.messages.some((one) => one.who === 'tool')) {
      yield { end: { text: 'Adding.', calls: [{ id: 'c1', tool: 'addOrder', input: { item: 'lamp', total: 5 } }] } }
      return
    }
    yield { end: { text: 'Done.', calls: [] } }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
engine.on('change.done', (o) => {
  if (o.name !== 'addOrder' || existsSync(once)) return
  writeFileSync(once, '')
  writeSync(1, 'added\n')
  // The first start stands still here, its write committed and its step not saved, until it is killed.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
})
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [run] = app.runs.find({ flow: 'helper' })
let id = run?.id
if (!id) {
  const chat = String(Object(await app.call('newChat', {}, { as: system })).id)
  id = (await app.start('helper', { message: 'Add a lamp.', thread: chat }, { as: system })).run
}
const answer = await app.runs.wait(id)
const orders = (await app.call('myOrders', {}, { as: system })).map((one) => one.item)
writeSync(1, `ended: ${JSON.stringify({ answer, orders })}\n`)
await engine.close()
process.exit(0)
