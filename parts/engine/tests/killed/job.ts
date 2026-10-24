// A program that runs a flow whose step calls a model over a service call that states `job`. The first start is
// killed while the job is checked; the second start takes the run up again and ends it. The stand-in of the service
// writes down each job it starts.
// Run: node job.ts <project folder> <bundle folder> <data folder> <folder of what is told>
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { createEngine } from '../../index.ts'
import { testSecrets } from '../../../test/secrets.ts'

const [project, out, dataFolder, told] = process.argv.slice(2)
mkdirSync(told, { recursive: true })
// The first start builds the project; the second runs the bundle it wrote.
const named = join(told, 'bundle.txt')
if (!existsSync(named)) writeFileSync(named, (await buildProject(project, { for: 'release', out })).bundleFolder)
const bundle = readFileSync(named, 'utf8')
const started = join(told, 'started.txt')
const checked = join(told, 'checked.txt')
// The second start finds what the first one checked: its job is then done.
const again = existsSync(checked)

if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
app.standIn('decisions', {
  paint: () => {
    appendFileSync(started, 'started\n')
    return { id: 'job-1' }
  },
  status: (input: { job: string }) => {
    if (again) return { status: 'succeeded', picture: `${input.job}.png` }
    writeFileSync(checked, 'checked\n')
    // The first start stands still in its check until it is killed.
    writeSync(1, 'waiting\n')
    return new Promise(() => undefined)
  },
})
const [run] = app.runs.find({ flow: 'paintIt' })
const id = run ? run.id : (await app.start('paintIt', { prompt: 'a tent' }, { as: { kind: 'system' } })).run
const answer = await app.runs.wait(id)
writeSync(1, `answer: ${JSON.stringify(answer)}\n`)
await engine.close()
process.exit(0)
