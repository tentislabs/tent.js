// A program that offers a source of tools to the engine and starts an agent with it. The first start is killed
// right after the first `model` step was saved; the second start offers the source again, takes the run up, and
// ends it with the tool of the source. It prints the answer, the steps, and the tools the model was handed.
// Run: node sourced.ts <project folder> <bundle folder> <data folder> <folder of what is told>
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
const handed = []

// The model asks for the tool of the source, and answers what it answered.
const writer = {
  async *reply(o) {
    handed.push((o.tools ?? []).map((one) => one.name))
    const answer = o.messages.find((one) => one.who === 'tool')
    if (!answer) {
      yield { end: { text: '', calls: [{ id: 'c1', tool: 'deskLookUp', input: { word: 'tent' } }] } }
      return
    }
    yield { end: { text: String(answer.result ?? answer.error), calls: [] } }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
engine.offer('desk', {
  tools: ({ context }) => [
    { name: 'deskLookUp', about: `Looks a word up at the desk of ${context.desk}`, input: { word: { kind: 'text' } }, sends: false },
  ],
  call: async ({ tool, input, context, starter }) => `${tool} at ${context.desk} for ${starter.kind}: ${input.word}`,
})
engine.on('step.done', (o) => {
  if (o.step !== 'model 1' || existsSync(once)) return
  writeFileSync(once, '')
  writeSync(1, 'saved model 1\n')
  // The first start stands still here until it is killed, so that nothing follows the step.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
})
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const system = { kind: 'system' }
const [run] = app.runs.find({ flow: 'counted' })
const id = run
  ? run.id
  : (await app.start('counted', { message: 'Look it up.' }, { as: system, sources: [{ name: 'desk', context: { desk: 'one' } }] }))
      .run
const answer = await app.runs.wait(id)
const steps = app.runs.read(id).steps.map((one) => `${one.name}:${one.state}`)
writeSync(1, `ended: ${JSON.stringify({ answer, steps, handed })}\n`)
await engine.close()
process.exit(0)
