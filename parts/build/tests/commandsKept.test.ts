import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// A command file that counts in the program how often it was run, so a test sees each run of it.
const commandFile = (name: string, about: string): string => `import { command } from 'tentjs/cli'

Reflect.set(globalThis, 'keptRuns.${name}', Number(Reflect.get(globalThis, 'keptRuns.${name}') ?? 0) + 1)

export const ${name} = command('${name}', { about: '${about}', run: async () => undefined })
`

const runsOf = (name: string): number => Number(Reflect.get(globalThis, `keptRuns.${name}`) ?? 0)

test('[31-21] a save of one command file has the build run that file again and no other, and the file it was run from before is let go', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `commandsKept-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
    'package.json': `${JSON.stringify({ name: 'shop', private: true, type: 'module' })}\n`,
    'commands/first.ts': commandFile('keptFirst', 'The first'),
    'commands/second.ts': commandFile('keptSecond', 'The second'),
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const errors = (made: Awaited<ReturnType<typeof buildSaved>>) => made.findings.filter((one) => one.level === 'error')
  assert.deepEqual(errors(await buildSaved(folder)), [])
  assert.deepEqual([runsOf('keptFirst'), runsOf('keptSecond')], [1, 1], 'the first build runs each command file once')
  const saved = join(folder, 'commands', 'first.ts')
  writeFileSync(saved, readFileSync(saved, 'utf8').replace('The first', 'The first, saved'))
  assert.deepEqual(errors(await buildSaved(folder)), [])
  assert.deepEqual([runsOf('keptFirst'), runsOf('keptSecond')], [2, 1], 'the save runs the file it changed alone')
  const kept = readdirSync(join(folder, '.tent', 'cache', 'commands'))
  assert.equal(kept.filter((one) => one.startsWith('commands.first.')).length, 1, 'one file of the saved command file')
})
