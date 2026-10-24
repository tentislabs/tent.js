// A program of the tests that holds an app of the project of the calls, as a server does, so that a test can kill it:
// node engine.ts <bundle> <data folder> <what>. What it does by `what`, it says in lines of JSON.
//   pid       calls `pid` as a user, says the number of the Python program, and waits to be killed;
//   progress  starts the flow `scoring` that waits in its step, and says `saved` once its step kept its progress;
//   resume    opens the app again, which takes the run up, and says what the run answered.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createEngine } from '../../../engine/index.ts'

const [bundle = '', dataFolder = '', what = ''] = process.argv.slice(2)
const say = (value: object): void => void process.stdout.write(`${JSON.stringify(value)}\n`)
const engine = createEngine({ port: 0 })
const app = await engine.open(bundle, { dataFolder, mode: 'development' })
const user = async (): Promise<{ kind: 'user'; user: { id: string; roles: string[] } }> => {
  const rows: unknown = await app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  return {
    kind: 'user',
    user: { id: String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id')), roles: [] },
  }
}
if (what === 'pid') {
  say({ pid: await app.call('pid', {}, { as: await user() }) })
  setInterval(() => {}, 1000)
} else if (what === 'progress') {
  const { run } = await app.start('scoring', { wait: true }, { as: await user() })
  say({ run })
  const saved = join(dataFolder, 'disk', 'saved')
  const timer = setInterval(() => {
    if (existsSync(saved)) {
      clearInterval(timer)
      say({ saved: true })
      setInterval(() => {}, 1000)
    }
  }, 50)
} else if (what === 'resume') {
  const [found] = app.runs.find({ flow: 'scoring' })
  say({ answer: await app.runs.wait(found?.id ?? '') })
  await engine.close()
}
