import assert from 'node:assert/strict'
import fs, { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../index.ts'
import { listedFolder } from './listed.ts'

// The packages that the screens import are built once in development, apart from the views, and kept between saves.

const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n",
  'screens/bars.tsx': `import { useState } from 'react'
import { screen } from 'tentjs/ui'
import { BarLine } from 'tiny-bars'

export const barsScreen = screen('barsScreen', {
  path: '/',
  access: 'anyone',
  view: () => {
    const [value] = useState(10)
    return <BarLine label="Bars" value={value} />
  },
})
`,
  'node_modules/tiny-bars/package.json': JSON.stringify({
    name: 'tiny-bars',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/tiny-bars/index.js': `import { createElement } from 'react'

export function BarLine({ label, value }) {
  return createElement('div', { className: 'bar' }, label, ' version one ', createElement('span', { style: { width: value } }))
}
`,
}

/** The files of one side of a bundle that are modules of packages. */
const packageFiles = (bundle: string, side: 'browser' | 'server'): string[] =>
  readdirSync(join(bundle, side)).filter((one) => one.startsWith('package.') && one.endsWith('.js'))

test('[31-21] in development a package that a screen imports is built once into a module of its own, named by what was built: a save keeps it, the view names it, and a package installed anew is another module', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `packagesKept-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const built = await buildSaved(folder)
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  // A version of the session is the list of its files: each is laid out as a folder, to be read by its path.
  const first = { ...built, bundleFolder: listedFolder(built.bundleList) }
  const [server] = packageFiles(first.bundleFolder, 'server')
  const [browser] = packageFiles(first.bundleFolder, 'browser')
  assert.match(String(server), /^package\.tiny-bars\.[0-9a-f]{12}\.js$/)
  assert.match(String(browser), /^package\.tiny-bars\.[0-9a-f]{12}\.js$/)
  assert.match(readFileSync(join(first.bundleFolder, 'server', server), 'utf8'), /version one/)
  // The module of the screen's file names the package by its module, and holds none of it.
  const view = readdirSync(join(first.bundleFolder, 'server')).find((one) => one === 'src.screens.bars.tsx.js')
  const viewText = readFileSync(join(first.bundleFolder, 'server', String(view)), 'utf8')
  assert.match(viewText, new RegExp(`from "tent-package:${server.replaceAll('.', '\\.')}"`))
  assert.doesNotMatch(viewText, /version one/)
  assert.ok(Object(first.description.browser).shared.includes(`browser/${browser}`))

  // A save of the screen makes its file again, and takes the modules of the package as they were kept.
  const screen = join(folder, 'screens', 'bars.tsx')
  writeFileSync(screen, readFileSync(screen, 'utf8').replace('label="Bars"', 'label="Saved bars"'))
  const saved = { bundleFolder: listedFolder((await buildSaved(folder)).bundleList) }
  assert.deepEqual(packageFiles(saved.bundleFolder, 'server'), [server])
  assert.deepEqual(packageFiles(saved.bundleFolder, 'browser'), [browser])
  // The module of the screen's file lies at its address with no fingerprint, and holds what the save wrote.
  const fileOf = (bundle: string): string => readFileSync(join(bundle, 'browser', 'src.screens.bars.tsx.js'), 'utf8')
  assert.notEqual(fileOf(saved.bundleFolder), fileOf(first.bundleFolder), 'the screen file is made again')

  // The package installed anew in another version is built anew: an older module of the same package never answers.
  // An install writes the lock of the packages, by which what was made of a package is held.
  const lies = join(folder, 'node_modules', 'tiny-bars', 'index.js')
  writeFileSync(lies, readFileSync(lies, 'utf8').replace('version one', 'version two'))
  writeFileSync(join(folder, 'node_modules', '.package-lock.json'), '{"packages":{"node_modules/tiny-bars":{}}}\n')
  const again = { bundleFolder: listedFolder((await buildSaved(folder)).bundleList) }
  const [anew] = packageFiles(again.bundleFolder, 'server')
  assert.notEqual(anew, server)
  assert.match(readFileSync(join(again.bundleFolder, 'server', anew), 'utf8'), /version two/)

  // A release holds every package in the modules of its views, as before.
  const release = await buildProject(folder, { for: 'release' })
  assert.deepEqual(packageFiles(release.bundleFolder, 'server'), [])
})

/** The files that a piece of work reads, by their places, as the runtime is asked for them. */
async function readWhile(work: () => Promise<unknown>): Promise<string[]> {
  const read: string[] = []
  const wrap = (holder: object, name: string): (() => void) => {
    const was: unknown = Reflect.get(holder, name)
    if (typeof was !== 'function') return () => undefined
    Reflect.set(holder, name, (...given: unknown[]) => {
      read.push(String(given[0]).replaceAll('\\', '/'))
      return Reflect.apply(was, holder, given)
    })
    return () => Reflect.set(holder, name, was)
  }
  const undo = [wrap(fs, 'readFileSync'), wrap(fs.promises, 'readFile')]
  syncBuiltinESMExports()
  try {
    await work()
  } finally {
    for (const one of undo) one()
    syncBuiltinESMExports()
  }
  return read
}

test('[31-21] a save of a screen holds the packages built apart by the lock of the packages, as Vite holds its prebundled ones: it reads no file of a package', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `packagesLock-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  await buildSaved(folder)
  const screen = join(folder, 'screens', 'bars.tsx')
  writeFileSync(screen, readFileSync(screen, 'utf8').replace('label="Bars"', 'label="Saved bars"'))
  const read = await readWhile(() => buildSaved(folder))
  assert.deepEqual(
    read.filter((one) => one.includes('/node_modules/tiny-bars/') && !one.endsWith('/package.json')),
    [],
  )
  // A package installed anew changes the lock, and its modules are built anew from its files.
  const lies = join(folder, 'node_modules', 'tiny-bars', 'index.js')
  writeFileSync(lies, readFileSync(lies, 'utf8').replace('version one', 'version two'))
  writeFileSync(
    join(folder, 'node_modules', '.package-lock.json'),
    '{"packages":{"node_modules/tiny-bars":{"version":"1.0.1"}}}\n',
  )
  const again = await buildSaved(folder)
  const laid = listedFolder(again.bundleList)
  const [module] = readdirSync(join(laid, 'server')).filter((one) => one.startsWith('package.tiny-bars.'))
  assert.match(readFileSync(join(laid, 'server', String(module)), 'utf8'), /version two/)
})

test('[31-21] in development the stylesheet of a package that a screen imports is built apart with the packages and kept by their lock: a save of the screen builds its view and not the stylesheet', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `packageStyles-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const project: Record<string, string> = {
    'tent.ts': files['tent.ts'],
    'screens/styled.tsx': `import 'tiny-styles/styles.css'
import { useState } from 'react'
import { screen } from 'tentjs/ui'

export const styledScreen = screen('styledScreen', {
  path: '/',
  access: 'anyone',
  view: () => {
    const [said] = useState('Styled first')
    return <span>{said}</span>
  },
})
`,
    'node_modules/tiny-styles/package.json': JSON.stringify({ name: 'tiny-styles', version: '1.0.0' }),
    'node_modules/tiny-styles/styles.css': '.tiny-styled { color: rebeccapurple }\n',
  }
  for (const [path, text] of Object.entries(project)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const first = await buildSaved(folder)
  assert.deepEqual(
    first.findings.filter((one) => one.level === 'error'),
    [],
  )
  const laid = listedFolder(first.bundleList)
  // The page of the screen loads the stylesheet of the package, which holds its rule.
  const loads: string[] = Object(first.description.browser).screens.styledScreen
  const sheet = loads.find(
    (one) => one.endsWith('.css') && readFileSync(join(laid, one), 'utf8').includes('.tiny-styled'),
  )
  assert.ok(sheet, loads.join(', '))
  // The module of the screen's file holds no stylesheet of its own: the stylesheet is the packages', kept with them.
  const own = (bundle: string): string[] => readdirSync(join(bundle, 'browser')).filter((one) => one.startsWith('src.'))
  assert.deepEqual(
    own(laid).filter((one) => one.endsWith('.css')),
    [],
  )
  // A save of the screen makes its file again, and the stylesheet stays as it was kept.
  const screen = join(folder, 'screens', 'styled.tsx')
  writeFileSync(screen, readFileSync(screen, 'utf8').replace('Styled first', 'Styled saved'))
  const saved = await buildSaved(folder)
  assert.ok(Object(saved.description.browser).screens.styledScreen.includes(sheet))
  const after = listedFolder(saved.bundleList)
  const madeOf = (bundle: string): string[] =>
    own(bundle).map((one) => readFileSync(join(bundle, 'browser', one), 'utf8'))
  assert.deepEqual(own(after), own(laid))
  assert.notDeepEqual(madeOf(after), madeOf(laid), 'the screen file is made again')
})
