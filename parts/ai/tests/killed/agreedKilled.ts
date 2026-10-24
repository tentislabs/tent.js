// A program that runs an agent whose tool calls an agreed function, approves the ask, and is killed while that
// function is made and before its answer is saved; a second start takes the run up and ends it, and prints how
// often the function was made.
// Run: node agreedKilled.ts <project folder> <bundle folder> <data folder> <folder of what is told>
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
const made = join(told, 'made.txt')
const system = { kind: 'system' }

// The model asks for the tool once, and answers once its answer is in the conversation.
const writer = {
  async *reply(o) {
    const answered = o.messages.some((one) => one.who === 'tool')
    if (!answered) {
      yield { end: { text: '', calls: [{ id: 'c1', tool: 'outer', input: { file: made } }] } }
      return
    }
    yield { end: { text: 'Done.', calls: [] } }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [found] = app.runs.find({ flow: 'guard' })
let id = found?.id
if (!id) {
  const user = await app.call('addUser', { name: 'Maya' }, { as: system })
  const as = { kind: 'user', user: { id: String(Object(user).id), roles: [] } }
  id = (await app.start('guard', { message: 'Tell them.' }, { as })).run
}
// The person says yes to each ask, as soon as it waits.
const answering = setInterval(() => {
  for (const step of app.runs.read(id)?.steps ?? [])
    if (step.state === 'waiting') {
      try {
        app.runs.approve(id, step.name, undefined, { repeat: step.repeat, n: step.ask ?? 1 })
      } catch {
        // Answered already.
      }
    }
}, 20)
const answer = await app.runs.wait(id)
clearInterval(answering)
const steps = app.runs.read(id).steps.map((one) => `${one.name}:${one.state}`)
const times = readFileSync(made, 'utf8').split('\n').filter(Boolean).length
writeSync(1, `ended: ${JSON.stringify({ answer, steps, times })}\n`)
await engine.close()
process.exit(0)
