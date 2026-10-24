import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { packagesWatched } from '../packagesWatched.ts'

/** Lays a package into the folder of packages of a project, as an install writes it. */
function installed(folder: string, word: string): void {
  const lies = join(folder, 'node_modules', 'tiny-words')
  mkdirSync(lies, { recursive: true })
  writeFileSync(join(lies, 'package.json'), '{"name":"tiny-words","version":"1.0.0","type":"module"}\n')
  writeFileSync(join(lies, 'index.js'), `export const word = ${JSON.stringify(word)}\n`)
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A project folder of its own, removed when the test ends, and how often its watched packages told a change. */
function watching(t: TestContext): { folder: string; told(): number; reset(): void; watch(names: string[]): void } {
  const folder = join(process.cwd(), 'results', 'packagesWatched', `${Math.random().toString(36).slice(2)}`)
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  let told = 0
  const packages = packagesWatched(folder, () => {
    told += 1
  })
  t.after(() => packages.close())
  return {
    folder,
    told: () => told,
    reset: () => {
      told = 0
    },
    watch: (names) => packages.watch(names),
  }
}

/** Waits until a change was told, for two seconds at most. */
async function toldSoon(at: { told(): number }): Promise<boolean> {
  for (let n = 0; n < 100 && at.told() === 0; n++) await pause(20)
  return at.told() > 0
}

test('[31-22] a package that an install lays anew is watched again with no save between: its arrival and a later change of a file of it each reload the pages, and the watch of the folder that went tells nothing more', async (t) => {
  const at = watching(t)
  installed(at.folder, 'Word first')
  at.watch(['tiny-words'])
  rmSync(join(at.folder, 'node_modules', 'tiny-words'), { recursive: true, force: true })
  await pause(300)
  at.reset()
  installed(at.folder, 'Word second')
  assert.ok(await toldSoon(at), 'the package laid anew reloads the pages')
  await pause(300)
  // Quiet once the install is over: no watch of a folder that went tells without end.
  at.reset()
  await pause(400)
  assert.equal(at.told(), 0, 'nothing is told while nothing changes')
  writeFileSync(join(at.folder, 'node_modules', 'tiny-words', 'index.js'), 'export const word = "Word third"\n')
  assert.ok(await toldSoon(at), 'a changed file of the package laid anew reloads the pages')
})

test('[31-22] a package that is not installed when it is watched is told as a change when an install lays it there, also into a folder of packages that did not lie there yet', async (t) => {
  const at = watching(t)
  at.watch(['tiny-words'])
  installed(at.folder, 'Word first')
  assert.ok(await toldSoon(at), 'the package that an install laid reloads the pages')
  await pause(300)
  at.reset()
  writeFileSync(join(at.folder, 'node_modules', 'tiny-words', 'index.js'), 'export const word = "Word second"\n')
  assert.ok(await toldSoon(at), 'a changed file of it reloads the pages')
})
