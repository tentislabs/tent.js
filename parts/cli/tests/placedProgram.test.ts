import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and answers whether it did within the time. */
async function within(ms: number, holds: () => boolean): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (holds()) return true
    await new Promise((done) => setTimeout(done, 50))
  }
  return false
}

// A program of an outside server of MCP that stays running, and writes the folder it was started in each time.
const program =
  "require('fs').appendFileSync(process.env.TENT_SAID, process.cwd() + '\\n'); setInterval(() => {}, 1000)"

test('[21-17] a program of an outside server of MCP is started again from the folder of the version a save switched to, and the folder it left is tidied', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'placed-program', 'devs')
  const said = join(folder, '..', 'said.txt')
  writeFileSync(said, '')
  writeFileSync(
    join(folder, 'services.ts'),
    `import { service } from 'tentjs'

export const local = service('local', {
  mcp: { command: ['node', '-e', ${JSON.stringify(program)}], env: { TENT_SAID: ${JSON.stringify(said)} } },
})
`,
  )
  const lines = (): string[] => readFileSync(said, 'utf8').split('\n').filter(Boolean)
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  assert.ok(await within(15_000, () => lines().length === 1), 'the program is started')
  const first = lines()[0]
  assert.match(first, /placed/)
  const was = dev.version()
  const file = join(folder, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('The first heading', 'The saved heading'))
  assert.ok(await within(15_000, () => dev.version() !== was), 'the save runs')
  assert.ok(await within(15_000, () => lines().length === 2), 'the program is started again')
  const second = lines()[1]
  assert.notEqual(second, first, 'the program runs from the folder of the new version')
  assert.ok(existsSync(second))
  assert.ok(
    await within(15_000, () => !existsSync(first)),
    'the folder that the program left, which no loaded version names, is tidied',
  )
})
