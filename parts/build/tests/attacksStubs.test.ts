import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Way } from './attackStubs.ts'
import { installed, markersIn, packageOf, reached, screenWith } from './attackStubs.ts'

const vault = '../functions/vault'

// The generated file of a backend file of the vault: the record of a definition, with its name.
const generated = /definition["'`]?:\s*["'`](vaultRows|vaultPlain|addToVault|askVault)["'`]/

// The ways that take nothing of the backend file into the code: a type, and a call that the builder does not read.
const takeNothing = ['type', 'require']

/**
 * Builds each way in a project that holds the package `tentjs`, so that a backend file which is answered with
 * itself builds too, and is found. Answers every browser file that holds a marker text, and each way that did not
 * build whole: with an error, with no bundle, with no screen, or with no generated file where it imports one.
 */
async function tried(ways: Record<string, Way>): Promise<{ leaks: string[]; failed: string[] }> {
  const leaks: string[] = []
  const failed: string[] = []
  for (const [name, way] of Object.entries(ways)) {
    const one = await reached(name, { ...installed, ...way })
    leaks.push(...one.leaks)
    if (!one.built || one.errors.length) failed.push(`${name}: ${one.errors.join(' ') || 'no bundle'}`)
    else if (!one.screen) failed.push(`${name}: no screen`)
    else if (!takeNothing.includes(name) && !generated.test(one.modules)) failed.push(`${name}: no generated file`)
  }
  return { leaks, failed }
}

test('[05-4.24] a screen that imports a helper file, which imports neither side, which imports a backend file with marker texts, and the same through a package: the browser files hold no marker text', async () => {
  // The search finds a marker where one is, as it is written and in base 64: a search that finds nothing proves nothing.
  assert.deepEqual(markersIn(`a MARKER-SECRET-OF-THE-BACKEND-FILE-0123456789 b`), [
    'MARKER-SECRET-OF-THE-BACKEND-FILE-',
  ])
  const packed = Buffer.from('// MARKER-COMMENT-OF-THE-BACKEND-FILE-0123456789').toString('base64')
  assert.deepEqual(markersIn(`url("data:video/mp2t;base64,${packed}")`), ['MARKER-COMMENT-OF-THE-BACKEND-FILE-'])

  const { leaks, failed } = await tried({
    // The row: a helper between, a helper that imports a helper, and a package, by `import` and by `require`.
    helper: {
      'screens/way.tsx': screenWith("import { vaultRows, askVault } from '../helpers/relay'", '[vaultRows, askVault]'),
    },
    'helper-of-helper': {
      'screens/way.tsx': screenWith(
        "import { everything, vaultRows } from '../helpers/deep'",
        '[everything, vaultRows]',
      ),
    },
    package: {
      ...packageOf('relay-package', "export * from '../../functions/vault.ts'\n"),
      'screens/way.tsx': screenWith("import * as all from 'relay-package'", 'JSON.stringify(all)'),
    },
    'package-require': {
      ...packageOf('relay-cjs', "module.exports = require('../../functions/vault.ts')\n", 'commonjs'),
      'screens/way.tsx': screenWith("import all from 'relay-cjs'", 'JSON.stringify(all)'),
    },
    // Every other way an import is written.
    direct: {
      'screens/way.tsx': screenWith(`import { vaultRows, askVault } from '${vault}'`, '[vaultRows, askVault]'),
    },
    everything: { 'screens/way.tsx': screenWith(`import * as all from '${vault}'`, 'JSON.stringify(all)') },
    'with-its-ending': { 'screens/way.tsx': screenWith(`import * as all from '${vault}.ts'`, 'JSON.stringify(all)') },
    type: {
      'screens/way.tsx': screenWith(
        `import type { VaultRowMARKERTYPE } from '${vault}'\nconst one: VaultRowMARKERTYPE = { amount: 1 }`,
        'one.amount',
      ),
    },
    'handed-on': {
      'screens/way.tsx': screenWith(`export * from '${vault}'\nexport { vaultRows as rows } from '${vault}'`, '1'),
    },
    'import-while-running': { 'screens/way.tsx': screenWith(`const all = import('${vault}')`, 'all') },
    require: {
      'screens/way.tsx': screenWith(
        `declare const require: (name: string) => unknown\nconst all = (): unknown => require('${vault}')`,
        'all',
      ),
    },
    'every-file-of-a-folder': {
      'screens/way.tsx': screenWith(
        "const all = import.meta.glob('../functions/*.ts', { eager: true })",
        'JSON.stringify(all)',
      ),
    },
    // A query that reads a table the caller may not read: the screen holds the name of the query, and not of its table.
    'plain-data': {
      'screens/way.tsx':
        "import { read, screen } from 'tentjs/ui'\n" +
        `import { vaultPlain } from '${vault}'\n` +
        "export const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', data: { rows: read(vaultPlain) }, view: ({ rows }) => <span>{rows.length}</span> })\n",
    },
  })
  assert.deepEqual(failed, [], 'each way builds with no error, and holds its screen and the generated file')
  assert.deepEqual(leaks, [])
})

test('[05-4.25] a screen file, a helper, a package and a style file that ask for a backend file as its text or as an address: the build ends with T1005 on the line that asks, and writes no bundle', async () => {
  // Where each way asks: the line of a screen file after its import of `tentjs/ui`, and the one line of any other file.
  const asks: Record<string, string> = {
    'as-text': 'screens/way.tsx:2',
    'as-an-address': 'screens/way.tsx:2',
    'as-an-address-of-its-own': 'screens/way.tsx:2',
    'helper-as-text': 'helpers/text.ts:1',
    'package-as-text': 'node_modules/relay-raw/index.js:1',
    'folder-as-text': 'screens/way.tsx:2',
    'project-as-addresses': 'screens/way.tsx:2',
    'style-file': 'screens/look.css:1',
  }
  const ways: Record<string, Way> = {
    'as-text': { 'screens/way.tsx': screenWith(`import text from '${vault}.ts?raw'`, 'text') },
    'as-an-address': { 'screens/way.tsx': screenWith(`import at from '${vault}.ts?url'`, 'at') },
    'as-an-address-of-its-own': {
      'screens/way.tsx': screenWith(`const at = new URL('${vault}.ts', import.meta.url)`, 'at'),
    },
    'helper-as-text': {
      'helpers/text.ts': `export { default as text } from '${vault}.ts?raw'\n`,
      'screens/way.tsx': screenWith("import { text } from '../helpers/text'", 'text'),
    },
    'package-as-text': {
      ...packageOf('relay-raw', "export { default } from '../../functions/vault.ts?raw'\n"),
      'screens/way.tsx': screenWith("import text from 'relay-raw'", 'text'),
    },
    'folder-as-text': {
      'screens/way.tsx': screenWith(
        "const all = import.meta.glob('../functions/*.ts', { eager: true, query: '?raw', import: 'default' })",
        'JSON.stringify(all)',
      ),
    },
    'project-as-addresses': {
      'screens/way.tsx': screenWith(
        "const all = import.meta.glob('../**/*.ts', { eager: true, query: '?url', import: 'default' })",
        'JSON.stringify(all)',
      ),
    },
    'style-file': {
      'screens/look.css': '.look { background: url("../functions/vault.ts") }\n',
      'screens/way.tsx': screenWith("import './look.css'", '1'),
    },
  }
  const seen: Record<string, unknown> = {}
  const wanted: Record<string, unknown> = {}
  for (const [name, way] of Object.entries(ways)) {
    const one = await reached(name, way)
    // No bundle, and T1005 alone, on the line that asks. What a bundle held, where one was written, is told with it.
    seen[name] = { built: one.built, errors: [...new Set(one.errors)], leaks: one.leaks }
    wanted[name] = { built: false, errors: [`T1005 ${asks[name]}`], leaks: [] }
  }
  assert.deepEqual(seen, wanted)
})

test('[05-4.26] a backend file that a screen file and a helper name with a question mark or a hash after its name, in a project that holds the package tentjs: the browser files hold its generated file and nothing else of it', async () => {
  const lone = '../functions/alone.ts'
  const ways: Record<string, Way> = {
    'question-mark': {
      ...installed,
      'screens/way.tsx': screenWith(`import * as all from '${lone}?x=1'`, 'JSON.stringify(all)'),
    },
    hash: { ...installed, 'screens/way.tsx': screenWith(`import * as all from '${lone}#x'`, 'JSON.stringify(all)') },
    'helper-question-mark': {
      ...installed,
      'helpers/asked.ts': `export * from '${lone}?helper'\n`,
      'screens/way.tsx': screenWith("import * as all from '../helpers/asked'", 'JSON.stringify(all)'),
    },
  }
  for (const [name, way] of Object.entries(ways)) {
    const one = await reached(name, way)
    assert.deepEqual([one.built, one.errors, one.screen], [true, [], true], name)
    // Nothing of the file itself: no marker text, no rule and no body of `run`.
    assert.deepEqual(one.leaks, [], name)
    for (const text of ['signedIn', 'input.note', '.join('])
      assert.ok(!one.modules.includes(text), `${name}: the browser files hold ${text}`)
    // The generated file is there: the record of the action, with its name, its kind and its input.
    // The builder writes a text between any of the three quotes.
    assert.match(one.modules, /definition["'`]?:\s*["'`]askAlone["'`]/, name)
    assert.match(one.modules, /kind["'`]?:\s*["'`]action["'`]/, name)
  }
})
