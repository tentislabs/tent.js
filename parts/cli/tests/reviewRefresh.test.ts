import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { packagesWatched } from '../packagesWatched.ts'

/** Lays a package into the folder of packages of a project, as an install writes it. */
function installed(folder: string, word: string): void {
  const lies = join(folder, 'node_modules', 'tiny-words')
  mkdirSync(lies, { recursive: true })
  writeFileSync(join(lies, 'package.json'), '{"name":"tiny-words","version":"1.0.0","type":"module"}\n')
  writeFileSync(join(lies, 'index.js'), `export const word = ${JSON.stringify(word)}\n`)
}

test('[31-22] a package that an install lays anew, its folder removed and written again, is still watched: tent dev goes on, and a changed file of it reloads the pages', async (t) => {
  const folder = join(process.cwd(), 'results', 'reviewRefresh', `packages-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  installed(folder, 'Word first')
  let told = 0
  const packages = packagesWatched(folder, () => {
    told += 1
  })
  t.after(() => packages.close())
  packages.watch(['tiny-words'])
  // An install removes the folder of the package and writes it again.
  rmSync(join(folder, 'node_modules', 'tiny-words'), { recursive: true, force: true })
  await new Promise((done) => setTimeout(done, 300))
  installed(folder, 'Word second')
  // The next save sets the packages to watch again, as tent dev does after each build.
  packages.watch(['tiny-words'])
  await new Promise((done) => setTimeout(done, 300))
  told = 0
  writeFileSync(join(folder, 'node_modules', 'tiny-words', 'index.js'), 'export const word = "Word third"\n')
  for (let n = 0; n < 100 && told === 0; n++) await new Promise((done) => setTimeout(done, 20))
  assert.ok(told > 0, 'a changed file of the package laid anew reloads the pages')
})
