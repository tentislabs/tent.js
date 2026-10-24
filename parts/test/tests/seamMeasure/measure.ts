// A program of its own that builds the project beside it with the parts of one tree, opens it, and on each line
// `go` of its input calls each of the four calls of the measure and prints how long each took, in milliseconds.
// Run: node measure.ts <the root of a tree> <a work folder>
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [root, work] = process.argv.slice(2)
const project = fileURLToPath(new URL('./project/', import.meta.url))
const { buildProject } = await import(pathToFileURL(join(root, 'parts', 'build', 'index.ts')).href)
const { createEngine } = await import(pathToFileURL(join(root, 'parts', 'engine', 'index.ts')).href)

const built = await buildProject(project, { for: 'release', out: join(work, 'bundle') })
const engine = createEngine({ port: 0 })
const app = await engine.open(built.bundleFolder, { dataFolder: join(work, 'data'), mode: 'test' })
const system = { kind: 'system' }
const nobody = { kind: 'nobody' }
const id = await app.call('oneWrite', {}, { as: system })
const first = await app.page('/', { as: nobody })
if (first.status !== 200) throw new Error(`the screen answered ${first.status}: ${first.html.slice(0, 400)}`)

/** The time of a number of calls of one kind, in milliseconds. */
async function timed(times: number, call: () => Promise<unknown>): Promise<number> {
  const began = performance.now()
  for (let k = 0; k < times; k++) await call()
  return performance.now() - began
}

/** One round: each call of the measure, as many times as the measure asks. */
async function round(): Promise<Record<string, number>> {
  return {
    query: await timed(100_000, () => app.call('oneRead', { id }, { as: system })),
    change: await timed(100_000, () => app.call('oneWrite', {}, { as: system })),
    action: await timed(100_000, () => app.call('atOnce', {}, { as: system })),
    screen: await timed(1_000, () => app.page('/', { as: nobody })),
  }
}

const lines = createInterface({ input: process.stdin })
lines.on('line', async (line) => {
  if (line === 'go') process.stdout.write(`${JSON.stringify(await round())}\n`)
  if (line === 'end') lines.close()
})
// The program ends with its input: also where the test that started it ended first.
lines.on('close', async () => {
  await engine.close()
  process.exit(0)
})
process.stdout.write('ready\n')
