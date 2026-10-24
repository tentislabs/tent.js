import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { programRuns } from '../../core/internal.ts'

// The updates that this program holds now: a second update of one program waits as one of another program does.
const held = new Set<string>()

/**
 * Takes the folder of an install. Takes `update.lock` for the process that updates, waiting while another update
 * holds it; a lock whose process no longer runs was left behind, and is taken. Answers what gives it up again.
 */
export async function heldUpdate(home: string): Promise<() => void> {
  mkdirSync(home, { recursive: true })
  const file = join(home, 'update.lock')
  for (;;) {
    if (!held.has(file))
      try {
        const handle = openSync(file, 'wx')
        writeSync(handle, `${process.pid}\n`)
        closeSync(handle)
        held.add(file)
        return () => {
          held.delete(file)
          rmSync(file, { force: true })
        }
      } catch {
        // Another update holds it, or left it behind.
        let pid = Number.NaN
        try {
          pid = Number(readFileSync(file, 'utf8').trim())
        } catch {
          continue
        }
        if (!Number.isInteger(pid) || (pid !== process.pid && !programRuns(pid))) {
          rmSync(file, { force: true })
          continue
        }
      }
    await new Promise((done) => setTimeout(done, 100))
  }
}
