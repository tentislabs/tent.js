import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../index.ts'
import { listedFolder } from './listed.ts'

// What a session of development keeps between saves: each file and what it imports, never the project as a whole.

const files: Record<string, string> = {
  'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
  'engine.ts': 'export default {}\n',
  'package.json': `${JSON.stringify({ name: 'shop', private: true, type: 'module' })}\n`,
  'functions/notes.ts': `import { anyone, query, table, text } from 'tentjs'

export const notes = table('notes', { columns: { body: text() }, access: { read: anyone('every visitor') } })

export const allNotes = query('allNotes', { access: anyone('every visitor'), rows: notes.oldest('body').limit(20) })
`,
  'components/Badge.tsx': `import { component } from 'tentjs/ui'

export const Badge = component('Badge', { view: () => <span style={{ padding: 4 }}>New</span> })
`,
  'screens/home.tsx': `import { screen, read } from 'tentjs/ui'
import { allNotes } from '../functions/notes'
import { Badge } from '../components/Badge'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  data: { all: read(allNotes) },
  view: ({ all }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Badge />
      {all.map((o) => <span key={o.id}>{o.body}</span>)}
    </div>
  ),
})
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

/** Every file of a bundle by its path in it, with its bytes. */
function bundleOf(folder: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((one) => one.isFile())
      .map((one) => {
        const path = join(one.parentPath, one.name)
        return [path.slice(folder.length + 1).replaceAll('\\', '/'), readFileSync(path).toString('base64')]
      }),
  )
}

const screens = ['homeScreen', 'aboutScreen', 'helpScreen'] as const

/** Of each screen, whether a build answered the very record that the build before it answered. */
const keptOf = (
  before: Awaited<ReturnType<typeof buildSaved>>,
  after: Awaited<ReturnType<typeof buildSaved>>,
): Record<string, boolean> =>
  Object.fromEntries(screens.map((name) => [name, before.described.screens[name] === after.described.screens[name]]))

test('[31-21] after a save, a screen that does not reach the saved file keeps what was made of it, and one that reaches it is made anew', async (t) => {
  const folder = projectIn(t, 'keptReach')
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  // A save of a screen file makes that screen anew alone.
  save(folder, 'screens/about.tsx', 'About the shop', 'About this shop')
  const about = await buildSaved(folder)
  assert.deepEqual(keptOf(first, about), { homeScreen: true, aboutScreen: false, helpScreen: true })
  // A save of a component makes anew each screen that draws it, and no other.
  save(folder, 'components/Badge.tsx', '>New<', '>Fresh<')
  const badge = await buildSaved(folder)
  assert.deepEqual(keptOf(about, badge), { homeScreen: false, aboutScreen: true, helpScreen: true })
  assert.equal(badge.description.components.Badge === about.description.components.Badge, false)
  // A save of a backend file makes anew each screen that imports it.
  save(folder, 'functions/notes.ts', '.limit(20)', '.limit(30)')
  const notes = await buildSaved(folder)
  assert.deepEqual(keptOf(badge, notes), { homeScreen: false, aboutScreen: true, helpScreen: true })
})

test('[31-21] a build of a session that keeps writes the description and the bundle, byte for byte, that a build which keeps nothing writes', async (t) => {
  const folder = projectIn(t, 'keptSame')
  await buildSaved(folder)
  save(folder, 'screens/about.tsx', 'About the shop', 'About this shop')
  await buildSaved(folder)
  save(folder, 'components/Badge.tsx', 'padding: 4', 'padding: 6')
  const kept = await buildSaved(folder)
  // The version of the session is the list of its files: they are laid out as a folder to be held against it.
  const keptFiles = bundleOf(listedFolder(kept.bundleList))
  // The same files built by a build that keeps nothing: the description of the session is the description.
  const whole = await buildProject(folder, { for: 'dev' })
  assert.equal(whole.versionId, kept.versionId)
  assert.deepEqual(keptFiles, bundleOf(whole.bundleFolder))
})

test('[31-21] a change of tent.ts, of engine.ts, of the lock of the packages, and a package installed or removed, makes the next build keep nothing', async (t) => {
  const folder = projectIn(t, 'keptNone')
  let last = await buildSaved(folder)
  const changes: [string, () => void][] = [
    ['tent.ts', () => save(folder, 'tent.ts', "title: 'Shop'", "title: 'The shop'")],
    ['engine.ts', () => writeFileSync(join(folder, 'engine.ts'), 'export default {}\n\n')],
    ['the lock of the packages', () => writeFileSync(join(folder, 'package-lock.json'), '{"lockfileVersion":3}\n')],
    [
      'a package installed',
      () => {
        mkdirSync(join(folder, 'node_modules', 'tiny'), { recursive: true })
        writeFileSync(join(folder, 'node_modules', 'tiny', 'package.json'), '{"name":"tiny","version":"1.0.0"}\n')
        writeFileSync(join(folder, 'node_modules', '.package-lock.json'), '{"packages":{"node_modules/tiny":{}}}\n')
      },
    ],
    [
      'a package removed',
      () => {
        rmSync(join(folder, 'node_modules', 'tiny'), { recursive: true, force: true })
        writeFileSync(join(folder, 'node_modules', '.package-lock.json'), '{"packages":{}}\n')
      },
    ],
  ]
  for (const [what, change] of changes) {
    change()
    const next = await buildSaved(folder)
    assert.deepEqual(
      next.findings.filter((one) => one.level === 'error'),
      [],
      what,
    )
    assert.deepEqual(keptOf(last, next), { homeScreen: false, aboutScreen: false, helpScreen: false }, what)
    last = next
  }
  // With nothing changed, everything is kept again.
  const again = await buildSaved(folder)
  assert.deepEqual(keptOf(last, again), { homeScreen: true, aboutScreen: true, helpScreen: true })
})

/** When each file that the build keeps on the disk was last written, by its path in the folder. */
const writtenAt = (folder: string): Map<string, number> =>
  new Map(
    readdirSync(folder, { recursive: true })
      .map(String)
      .map((name) => [name, statSync(join(folder, name)).mtimeMs]),
  )

test('[31-21] a save of one screen has the builder make nothing anew of another screen: what it made is taken as it was kept', async (t) => {
  const folder = projectIn(t, 'keptCode')
  writeFileSync(
    join(folder, 'screens/count.tsx'),
    `import { useState } from 'react'
import { screen } from 'tentjs/ui'

export const countScreen = screen('countScreen', {
  path: '/count',
  access: 'anyone',
  view: () => {
    const [count] = useState(1)
    return <span>Counted {count}</span>
  },
})
`,
  )
  const first = await buildSaved(folder)
  assert.ok(first.description.screens.countScreen)
  const cache = join(folder, '.tent', 'cache')
  const before = writtenAt(cache)
  save(folder, 'screens/about.tsx', 'About the shop', 'About this shop')
  const after = await buildSaved(folder)
  assert.deepEqual(
    after.findings.filter((one) => one.level === 'error'),
    [],
  )
  // What the build keeps on the disk was written again for the saved screen alone: of the other, the builder was
  // asked for nothing.
  const written = [...writtenAt(cache)].filter(([name, at]) => before.get(name) !== at).map(([name]) => name)
  assert.ok(
    written.some((name) => name.includes('about')),
    'the saved screen is made anew',
  )
  assert.deepEqual(
    written.filter((name) => !name.includes('about') && !/^run-screens([\\/][0-9a-f]{12})?$/.test(name)),
    [],
  )
})

/** The text of every module of the server in a bundle, together. */
function serverOf(bundle: string): string {
  return readdirSync(join(bundle, 'server'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(bundle, 'server', name), 'utf8'))
    .join('\n')
}

test('[31-21] a copy of a project with what its build kept, changed, builds its own modules: what was kept for the files of another folder is never taken', async (t) => {
  const first = projectIn(t, 'keptCopy')
  writeFileSync(
    join(first, 'functions/clock.ts'),
    "import { anyone, query, text } from 'tentjs'\n\nexport const clock = query('clock', { access: anyone('every visitor'), output: text(), run: () => [new Intl.NumberFormat('en').format(1), 'tick one'].join(' ') })\n",
  )
  const made = await buildProject(first, { for: 'release' })
  assert.match(serverOf(made.bundleFolder), /tick one/)
  // The copy holds the folder of what the build kept, and a change of its own.
  const copy = `${first}-copy`
  t.after(() => rmSync(copy, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  cpSync(first, copy, { recursive: true })
  save(copy, 'functions/clock.ts', 'tick one', 'tick two')
  const again = await buildProject(copy, { for: 'release' })
  assert.match(serverOf(again.bundleFolder), /tick two/)
  assert.doesNotMatch(serverOf(again.bundleFolder), /tick one/)
})
