import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// What each test of an app touched, by the test, while `tent test` runs the program: the definitions it ran.
const touched = new Map<string, Set<string>>()
let written = false

/**
 * Notes that a definition ran, under the test that the program of a test of the app says runs now. Outside
 * `tent test` it does nothing. When the program ends, what each test touched is written into the folder that
 * `tent test` named, in a file of this program's own.
 */
export function noteTouched(name: string): void {
  const folder = process.env.TENT_TOUCHED
  const test = process.env.TENT_TEST
  if (folder === undefined || test === undefined) return
  const held = touched.get(test) ?? new Set<string>()
  held.add(name)
  touched.set(test, held)
  if (written) return
  written = true
  process.once('exit', () => {
    mkdirSync(folder, { recursive: true })
    const all = Object.fromEntries([...touched].map(([one, names]) => [one, [...names].sort()]))
    writeFileSync(join(folder, `${process.pid}.json`), JSON.stringify(all))
  })
}
