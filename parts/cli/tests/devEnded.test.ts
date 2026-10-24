import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** The numbers of the programs that this program started and that still run, as the system lists them. */
function childrenNow(): number[] {
  const listed =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            // The program that lists them is a child of this program too: it leaves itself out.
            `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | Where-Object { $_.ProcessId -ne $PID }).ProcessId`,
          ],
          { encoding: 'utf8', windowsHide: true },
        ).stdout
      : spawnSync('pgrep', ['-P', String(process.pid)], { encoding: 'utf8' }).stdout
  return listed
    .split(/\s+/)
    .filter((one) => /^\d+$/.test(one))
    .map(Number)
}

/** Waits until no program of this program's runs but those that ran before, and answers those that still run. */
async function leftOf(before: number[]): Promise<number[]> {
  let left: number[] = []
  for (let n = 0; n < 40; n++) {
    left = childrenNow().filter((one) => !before.includes(one))
    if (!left.length) return []
    await new Promise((done) => setTimeout(done, 500))
  }
  return left
}

test('[31-12] tent dev that waits for a save which mends the project ends when it is told to, and leaves nothing running', async (t) => {
  const folder = copied(t, 'dev-ended', 'devs')
  // A file the builder cannot read: the session has nothing to run, and waits for the save that mends it.
  writeFileSync(join(folder, 'broken.ts'), 'export const = \n')
  const before = childrenNow()
  const ending = new AbortController()
  const lines: string[] = []
  const started = startDev(folder, { port: 0, signal: ending.signal, out: (line) => lines.push(line) })
  setTimeout(() => ending.abort(), 3000).unref()
  await assert.rejects(started, (error: unknown) => Reflect.get(Object(error), 'code') === 'T0013')
  assert.deepEqual(await leftOf(before), [], 'no program that the session started runs on')
})

test('[31-12] tent dev that runs and is told to end is closed whole: its engine, and the programs it started, the type checker among them', async (t) => {
  const folder = copied(t, 'dev-told', 'devs')
  const before = childrenNow()
  const ending = new AbortController()
  const dev = await startDev(folder, { port: 0, signal: ending.signal, out: () => undefined })
  // The command ends the signal at the signal of the system, and then closes the session.
  ending.abort()
  await dev.close()
  assert.equal(existsSync(join(folder, '.tent', 'engine.json')), false, 'the engine is closed')
  assert.deepEqual(await leftOf(before), [], 'no program that the session started runs on')
})
