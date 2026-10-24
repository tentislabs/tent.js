import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// Each backend file of the project counts in the program how often it was run: a file holds a statement and a
// constant that is worked out, so the plain reader takes neither and the build runs both.
const ranFile = (name: string, limit: number): string => `import { action, anyone } from 'tentjs'

const LIMIT = Math.max(1, ${limit})
Reflect.set(globalThis, 'reviewRuns.${name}', Number(Reflect.get(globalThis, 'reviewRuns.${name}') ?? 0) + 1)

export const ${name} = action('${name}', { access: anyone('every visitor'), run: async () => LIMIT })
`

const runsOf = (name: string): number => Number(Reflect.get(globalThis, `reviewRuns.${name}`) ?? 0)

test('[31-21] a save of one backend file that is run has the build run that file again and no other: the definitions of a file the save did not reach are kept', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `reviewRun-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
    'package.json': `${JSON.stringify({ name: 'shop', private: true, type: 'module' })}\n`,
    'functions/first.ts': ranFile('reviewFirst', 2),
    'functions/second.ts': ranFile('reviewSecond', 2),
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.deepEqual([runsOf('reviewFirst'), runsOf('reviewSecond')], [1, 1], 'the first build runs each file once')
  const saved = join(folder, 'functions', 'first.ts')
  writeFileSync(saved, readFileSync(saved, 'utf8').replace('Math.max(1, 2)', 'Math.max(1, 3)'))
  const second = await buildSaved(folder)
  assert.deepEqual(
    second.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.deepEqual(
    [runsOf('reviewFirst'), runsOf('reviewSecond')],
    [2, 1],
    'the save runs the file it changed, and the file it did not reach is not run again',
  )
})
