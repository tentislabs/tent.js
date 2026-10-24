// A program that runs an agent whose model hands one sequence with an `all`, and is killed right after one of
// its steps was saved; a second start after the sequence was read is handed no reader of source, takes the run up
// and ends it, and prints its steps and the rows the sequence wrote.
// Run: node sequenceAll.ts <project folder> <bundle folder> <data folder> <folder of what is told> <step>
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject, readBody } from '../../../build/index.ts'
import { createEngine } from '../../../engine/index.ts'
import { testSecrets } from '../../../test/secrets.ts'

const [project, out, dataFolder, told, killAfter] = process.argv.slice(2)
mkdirSync(told, { recursive: true })
const named = join(told, 'bundle.txt')
if (!existsSync(named)) writeFileSync(named, (await buildProject(project, { for: 'release', out })).bundleFolder)
const bundle = readFileSync(named, 'utf8')
const once = join(told, 'killed-once')
const again = existsSync(once)
const system = { kind: 'system' }

// The late orders are marked side by side, in the entries of an `all`.
const run = [
  'const open = myOrders({})',
  'all(where(open, { total: { above: 100 } }), (o) => markLate({ order: o.id }))',
  'return { marked: 3 }',
].join('\n')

// The model hands the sequence first, and answers once its answer is in the conversation.
const writer = {
  async *reply(o) {
    const answered = o.messages.some((one) => one.who === 'tool')
    if (!answered) {
      yield { end: { text: '', calls: [{ id: 'c1', tool: 'sequence', input: { run } }] } }
      return
    }
    yield { end: { text: 'Done.', calls: [] } }
  },
}

// A second start after the sequence was read is handed no reader: what was read before stays read.
const bare = again && killAfter !== 'model 1'
const engine = createEngine({
  port: 0,
  makers: { providers: () => ({ anthropic: writer }) },
  ...(bare ? {} : { readBody }),
})
engine.on('step.done', (o) => {
  if (o.step !== killAfter || existsSync(once)) return
  writeFileSync(once, '')
  writeSync(1, `saved ${o.step}\n`)
  // The first start stands still here until it is killed, so that nothing follows the step.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
})
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [found] = app.runs.find({ flow: 'helper' })
let id = found?.id
if (!id) {
  const user = await app.call('addUser', { name: 'Maya' }, { as: system })
  const as = { kind: 'user', user: { id: String(Object(user).id), roles: [] } }
  for (const total of [50, 150, 250, 350]) await app.call('addOrder', { item: 'tent', total }, { as })
  id = (await app.start('helper', { message: 'Mark the late ones.' }, { as })).run
}
const answer = await app.runs.wait(id)
const steps = app.runs.read(id).steps.map((one) => `${one.name}:${one.state}`)
const lates = (await app.call('allLates', {}, { as: system })).length
writeSync(1, `ended: ${JSON.stringify({ answer, steps, lates })}\n`)
await engine.close()
process.exit(0)
