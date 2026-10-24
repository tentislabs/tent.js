// A program that runs a flow whose step makes a model call that is a long job. The first start is killed while the
// model layer waits between two checks; the second start takes the run up again and ends it. The provider writes
// down each job it begins.
// Run: node job.ts <project folder> <bundle folder> <data folder> <folder of what is told>
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { createEngine } from '../../../engine/index.ts'

const [project, out, dataFolder, told] = process.argv.slice(2)
mkdirSync(told, { recursive: true })
// The first start builds the project; the second runs the bundle it wrote.
const named = join(told, 'bundle.txt')
if (!existsSync(named)) writeFileSync(named, (await buildProject(project, { for: 'release', out })).bundleFolder)
const bundle = readFileSync(named, 'utf8')
const begun = join(told, 'begun.txt')
const checked = join(told, 'checked.txt')
// The second start finds what the first one checked: its job is then done.
const again = existsSync(checked)
let jobs = 0

const jobsProvider = {
  async begin() {
    jobs++
    appendFileSync(begun, 'begun\n')
    return { job: `job ${jobs}` }
  },
  async check(o) {
    if (!again) {
      writeFileSync(checked, 'checked\n')
      // The first start stands still between two checks until it is killed.
      writeSync(1, 'waiting\n')
      return { wait: 60_000 }
    }
    return { output: `made of ${o.job}` }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ jobs: jobsProvider }) } })
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const [run] = app.runs.find({ flow: 'makeIt' })
const id = run ? run.id : (await app.start('makeIt', {}, { as: { kind: 'system' } })).run
const answer = await app.runs.wait(id)
writeSync(1, `answer: ${JSON.stringify(answer)}\n`)
await engine.close()
process.exit(0)
