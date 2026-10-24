import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../index.ts'

// The attacks of the reviewer on what a session of development keeps between saves: a save is never answered from
// what the disk held before it, where the watcher of the project's folder could not see the change.

test('[31-21] a file that comes in a folder of `roots` while a session runs is found by the next save', async (t) => {
  const tree = join(process.cwd(), 'results', 'build', `sessionRoots-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(tree, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const files: Record<string, string> = {
    'app/tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop', roots: ['../shared'] })\n`,
    'app/functions/labels.ts': `import { query, table, text } from 'tentjs'
import { LABEL } from '../../shared/labels'

export const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn' } })

export const labelled = query('labelled', { access: 'signedIn', about: LABEL, rows: notes.where({ body: LABEL }) })
`,
    'shared/.keep': '',
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    writeFileSync(join(tree, path), text)
  }
  const app = join(tree, 'app')
  // The file of the root is not there yet: the build says so.
  const before = await buildSaved(app)
  assert.ok(before.findings.some((one) => one.level === 'error'))
  // It comes, outside the folder of the project, where the watcher of the session does not look; the file that
  // imports it is saved again.
  writeFileSync(join(tree, 'shared', 'labels.ts'), "export const LABEL = 'shared'\n")
  writeFileSync(join(app, 'functions', 'labels.ts'), `${files['app/functions/labels.ts']}\n`)
  const after = await buildSaved(app)
  assert.deepEqual(
    after.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  assert.equal(after.description.functions.labelled.about, 'shared')
})

/** The text of every module of the server in a bundle, together. */
function serverText(bundleFolder: string): string {
  const folder = join(bundleFolder, 'server')
  return readdirSync(folder, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.js') || name.endsWith('.mjs'))
    .map((name) => readFileSync(join(folder, name), 'utf8'))
    .join('\n')
}

test('[31-21] a package of a backend file that is installed anew is built anew: a build never keeps the code of the one it replaced', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `keptPackage-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n`,
    'functions/greeting.ts': `import { anyone, query, text } from 'tentjs'
import { greet } from 'greet'

export const greeting = query('greeting', { access: anyone('every visitor'), output: text(), run: () => greet() })
`,
    'node_modules/greet/package.json': JSON.stringify({
      name: 'greet',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    }),
    'node_modules/greet/index.js': "export const greet = () => 'greeting-of-version-one'\n",
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  for (const kind of ['release', 'dev'] as const) {
    writeFileSync(join(folder, 'node_modules/greet/index.js'), "export const greet = () => 'greeting-of-version-one'\n")
    const first = await buildProject(folder, { for: kind })
    assert.match(serverText(first.bundleFolder), /greeting-of-version-one/, `${kind}: the package is in the module`)
    // The package is installed anew in another version; no file of the project changes.
    writeFileSync(join(folder, 'node_modules/greet/index.js'), "export const greet = () => 'greeting-of-version-two'\n")
    const second = await buildProject(folder, { for: kind })
    const text = serverText(second.bundleFolder)
    assert.doesNotMatch(text, /greeting-of-version-one/, `${kind}: nothing of the version that was replaced is built`)
    assert.match(text, /greeting-of-version-two/, `${kind}: the version installed now is built`)
  }
})
