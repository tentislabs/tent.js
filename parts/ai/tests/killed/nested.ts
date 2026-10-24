// A program that runs an agent which calls another as its tool. The first start is killed while the called
// agent waits for its model; the second start takes both runs up and ends them, and prints the answer and how
// many runs of the called agent there are.
// Run: node nested.ts <project folder> <bundle folder> <data folder> <folder of what is told>
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
const waited = join(told, 'waited')
const again = existsSync(waited)

// The caller asks for the agent; the agent it called answers, but only in the second start.
const writer = {
  async *reply(o) {
    const last = o.messages.at(-1)
    if (o.instructions?.includes('You ask others')) {
      if (last?.who === 'user') {
        yield { end: { text: '', calls: [{ id: 'c1', tool: 'inner', input: { message: 'Go on.' } }] } }
        return
      }
      yield { end: { text: JSON.stringify(o.messages.filter((one) => one.who === 'tool').map((one) => one.result)), calls: [] } }
      return
    }
    if (!again) {
      writeFileSync(waited, '')
      writeSync(1, 'waiting\n')
      // The first start stands still here until it is killed.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
    yield { end: { text: 'inside', calls: [] } }
  },
}

if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const system = { kind: 'system' }
const [run] = app.runs.find({ flow: 'outer' })
const id = run ? run.id : (await app.start('outer', { message: 'Ask.' }, { as: system })).run
const answer = await app.runs.wait(id)
const inner = app.runs.find({ flow: 'inner' }).length
writeSync(1, `ended: ${JSON.stringify({ answer, inner })}\n`)
await engine.close()
process.exit(0)
