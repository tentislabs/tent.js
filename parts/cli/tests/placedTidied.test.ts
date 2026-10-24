import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

// An outside server of MCP that is a program, which the engine starts in a folder of links to the whole version. The
// program is a stand-in that is not there, so no program holds the folder while the test looks at it.
const services = `import { service } from 'tentjs'

export const local = service('local', { mcp: { command: ['tent-stand-in-that-is-not-there'] } })
`

test('[21-17] tent dev removes each folder of links that a program of another language was handed, once no loaded version needs it', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'placed-tidied', 'devs')
  writeFileSync(join(folder, 'services.ts'), services)
  const placed = join(folder, '.tent', 'build', 'placed')
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  assert.ok(await within(10_000, () => existsSync(placed) && readdirSync(placed).length > 0), 'the version is laid out')
  const first = readdirSync(placed)
  const was = dev.version()
  const file = join(folder, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('The first heading', 'The saved heading'))
  assert.ok(await within(15_000, () => dev.version() !== was), 'the save runs')
  assert.ok(
    await within(10_000, () => first.every((name) => !existsSync(join(placed, name)))),
    `the folder of the version that was left stands: ${readdirSync(placed).join(', ')}`,
  )
})
