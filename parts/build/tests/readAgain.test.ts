import assert from 'node:assert/strict'
import fs, { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildSaved } from '../index.ts'

// A save reads the changed files alone: a build of a session reads anew each file whose entry on the disk changed
// since the build before read it, and takes every other as that build read it.

const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
  'functions/notes.ts': `import { anyone, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: anyone('every visitor') } })

export const allNotes = query('allNotes', { access: anyone('every visitor'), rows: notes.oldest('body').limit(20) })
`,
  'screens/about.tsx': `import { screen } from 'tentjs/ui'

export const aboutScreen = screen('aboutScreen', { path: '/about', access: 'anyone', view: () => <span>About the shop</span> })
`,
  'screens/help.tsx': `import { screen } from 'tentjs/ui'

export const helpScreen = screen('helpScreen', { path: '/help', access: 'anyone', view: () => <span>Help</span> })
`,
}

/** Writes the project into a folder of its own, removed when the test ends. */
function projectIn(t: TestContext, name: string): string {
  const folder = join(process.cwd(), 'results', 'build', `${name}-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** Saves a file of a project with one text in the place of another, as an editor does. */
function save(folder: string, file: string, from: string, to: string): void {
  const held = readFileSync(join(folder, file), 'utf8')
  assert.ok(held.includes(from), `${file} holds ${from}`)
  writeFileSync(join(folder, file), held.replace(from, to))
}

// The files of the root that other steps of the build read, or the build writes: none is a source file it finds.
const apart = new Set(['engine.ts', 'seed.ts', 'tent.d.ts'])

/** Every source file of the project that this program reads while `work` runs, by its path in the project. */
async function readWhile(folder: string, work: () => Promise<unknown>): Promise<string[]> {
  const read: string[] = []
  const was = fs.readFileSync
  Reflect.set(fs, 'readFileSync', (...given: Parameters<typeof fs.readFileSync>) => {
    const path = relative(folder, String(given[0])).replaceAll('\\', '/')
    if (!path.startsWith('..') && !path.startsWith('.tent') && !apart.has(path) && /\.tsx?$/.test(path)) read.push(path)
    return Reflect.apply(was, fs, given)
  })
  syncBuiltinESMExports()
  try {
    await work()
  } finally {
    Reflect.set(fs, 'readFileSync', was)
    syncBuiltinESMExports()
  }
  return [...new Set(read)].sort()
}

test('[31-21] a build of a session reads anew only the files whose entry on the disk changed since the build before read them, and takes every other as it read it', async (t) => {
  const folder = projectIn(t, 'read-again')
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  // Two files are saved: those two are read, and no other.
  save(folder, 'screens/about.tsx', 'About the shop', 'About this shop')
  save(folder, 'screens/help.tsx', '>Help<', '>Help me<')
  let saved: Awaited<ReturnType<typeof buildSaved>> | undefined
  assert.deepEqual(
    await readWhile(folder, async () => {
      saved = await buildSaved(folder)
    }),
    ['screens/about.tsx', 'screens/help.tsx'],
  )
  assert.match(String(saved?.source['screens/about.tsx'].text), /About this shop/)
  assert.match(String(saved?.source['screens/help.tsx'].text), />Help me</)
  assert.equal(saved?.prints['functions/notes.ts'], first.prints['functions/notes.ts'])
  // With nothing saved, nothing is read again; a file that comes is read.
  assert.deepEqual(await readWhile(folder, () => buildSaved(folder)), [])
  writeFileSync(
    join(folder, 'screens', 'more.tsx'),
    "import { screen } from 'tentjs/ui'\n\nexport const moreScreen = screen('moreScreen', { path: '/more', access: 'anyone', view: () => <span>More</span> })\n",
  )
  let added: Awaited<ReturnType<typeof buildSaved>> | undefined
  assert.deepEqual(
    await readWhile(folder, async () => {
      added = await buildSaved(folder)
    }),
    ['screens/more.tsx'],
  )
  assert.ok(Object.hasOwn(Object(added?.description.screens), 'moreScreen'))
})
