// A program of its own whose opening of an app is refused late, and which then has work of its own to do.
// Run: node refused.ts <bundle folder> <data folder> <milliseconds to go on for>
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createEngine } from '../../index.ts'

const [bundle, dataFolder, ms] = process.argv.slice(2)
// A folder in the place of `engine.json`: the opening fails at its last step, when everything else was started.
mkdirSync(join(dataFolder, 'engine.json'), { recursive: true })
const engine = createEngine({ port: 0 })
try {
  await engine.open(bundle, { dataFolder, mode: 'test' })
  console.log('opened')
} catch {
  console.log('refused')
}
setTimeout(() => {
  console.log('still runs')
  void engine.close()
}, Number(ms))
