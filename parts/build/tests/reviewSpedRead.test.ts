import assert from 'node:assert/strict'
import fs, { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// A file counts as saved where its bytes differ from what the newest build read of it, whatever its time: two saves
// of one size within one step of the disk's clock leave the same entry on the disk, so the entry alone cannot say so.

const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
  'screens/about.tsx': `import { screen } from 'tentjs/ui'

export const aboutScreen = screen('aboutScreen', { path: '/about', access: 'anyone', view: () => <span>About</span> })
`,
  // A file that nothing imports: the build reads it, and makes nothing of it, so each try is quick.
  'notes/said.ts': `export const said = 'About 0000'\n`,
}

/** Writes the project into a folder of its own, removed when the test ends. */
function projectIn(t: TestContext): string {
  const folder = join(process.cwd(), 'results', 'build', `sped-read-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** What the disk says of a file, as a build of a session asks it. */
const entryOf = (file: string): string => {
  const said = fs.statSync(file, { bigint: true })
  return `${said.ino} ${said.size} ${said.mtimeNs} ${said.ctimeNs}`
}

/**
 * Carries out `work` while an editor saves `file` twice as the build reads it: once just before the build asks the
 * disk of it, and once, with as many bytes, just after the build read it. Answers what the disk said of each save.
 */
async function savedTwiceWhile(
  file: string,
  first: string,
  second: string,
  work: () => Promise<unknown>,
): Promise<{ first?: string; second?: string }> {
  const said: { first?: string; second?: string } = {}
  const stat = fs.statSync
  const read = fs.readFileSync
  const ours = (given: unknown): boolean => resolve(String(given)) === resolve(file)
  Reflect.set(fs, 'statSync', (...given: Parameters<typeof fs.statSync>) => {
    if (ours(given[0]) && said.first === undefined) {
      Reflect.apply(fs.writeFileSync, fs, [file, first])
      said.first = ''
    }
    return Reflect.apply(stat, fs, given)
  })
  Reflect.set(fs, 'readFileSync', (...given: Parameters<typeof fs.readFileSync>) => {
    const answer: unknown = Reflect.apply(read, fs, given)
    if (ours(given[0]) && said.first === '' && said.second === undefined) {
      said.first = entryOf(file)
      Reflect.apply(fs.writeFileSync, fs, [file, second])
      said.second = entryOf(file)
    }
    return answer
  })
  syncBuiltinESMExports()
  try {
    await work()
  } finally {
    Reflect.set(fs, 'statSync', stat)
    Reflect.set(fs, 'readFileSync', read)
    syncBuiltinESMExports()
  }
  return said
}

test('[31-12] a file saved twice with as many bytes, the second time after a build of the session read it, is read anew by the next build, though the disk says the same of both saves', async (t) => {
  const folder = projectIn(t)
  const file = join(folder, 'notes', 'said.ts')
  await buildSaved(folder)
  // The disk's clock moves in steps: the two saves fall into one step often enough to be met within these tries.
  let met = 0
  for (let tried = 1; tried <= 2000 && met === 0; tried++) {
    const first = files['notes/said.ts'].replace('0000', `${tried}`.padStart(4, '0'))
    const second = first.replace('About ', 'Above ')
    const said = await savedTwiceWhile(file, first, second, () => buildSaved(folder))
    if (said.first !== undefined && said.first === said.second) met = tried
    // The save after the build is told, as the watcher tells of it, and is built.
    const next = await buildSaved(folder)
    assert.equal(next.source['notes/said.ts']?.text, second, `try ${tried}: the build reads the file as it lies`)
  }
  t.diagnostic(met ? `the two saves left one entry at try ${met}` : 'the two saves never left one entry')
})
