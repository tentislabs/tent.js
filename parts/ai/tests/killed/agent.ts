// A program that runs an agent with two tools on a conversation, and is killed right after one of its steps
// was saved; the second start takes the run up and ends it, and prints its steps and the rows of the conversation.
// Run: node agent.ts <project folder> <bundle folder> <data folder> <folder of what is told> <step>
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { createEngine } from '../../../engine/index.ts'
import { testSecrets } from '../../../test/secrets.ts'

const [project, out, dataFolder, told, killAfter] = process.argv.slice(2)
mkdirSync(told, { recursive: true })
const named = join(told, 'bundle.txt')
if (!existsSync(named)) writeFileSync(named, (await buildProject(project, { for: 'release', out })).bundleFolder)
const bundle = readFileSync(named, 'utf8')
const once = join(told, 'killed-once')
const system = { kind: 'system' }

// The model asks for both tools first, and answers once their answers are in the conversation.
const writer = {
  async *reply(o) {
    const answered = o.messages.some((one) => one.who === 'tool')
    if (!answered) {
      yield {
        end: {
          text: 'Let me look.',
          calls: [
            { id: 'c1', tool: 'myOrders', input: { status: 'open' } },
            { id: 'c2', tool: 'markPaid', input: { order: readFileSync(join(told, 'order.txt'), 'utf8') } },
          ],
        },
      }
      return
    }
    yield { end: { text: 'Done.', calls: [] } }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
engine.on('step.done', (o) => {
  if (o.step !== killAfter || existsSync(once)) return
  writeFileSync(once, '')
  writeSync(1, `saved ${o.step}\n`)
  // The first start stands still here until it is killed, so that nothing follows the step.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
})
// Every secret that the project names has a value on the test data, as a test app gives it.
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [run] = app.runs.find({ flow: 'helper' })
let id = run?.id
if (!id) {
  const chat = String(Object(await app.call('newChat', {}, { as: system })).id)
  const order = String(Object(await app.call('addOrder', { item: 'tent', total: 120 }, { as: system })).id)
  writeFileSync(join(told, 'chat.txt'), chat)
  writeFileSync(join(told, 'order.txt'), order)
  id = (await app.start('helper', { message: 'Which orders are open?', thread: chat }, { as: system })).run
}
const answer = await app.runs.wait(id)
const steps = app.runs.read(id).steps.map((one) => `${one.name}:${one.state}`)
const rows = (await app.call('allMessages', {}, { as: system })).map((one) => one.who)
writeSync(1, `ended: ${JSON.stringify({ answer, steps, rows })}\n`)
await engine.close()
process.exit(0)
