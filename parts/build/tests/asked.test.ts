import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

const head = "import { screen } from 'tentjs/ui'\n"
const tail = (uses: string): string =>
  `\nexport const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => <span>{String(${uses})}</span> })\n`

/** Writes files into a copy of the project of the stubs, in place of its screens, builds it, and answers what the build gave. */
async function built(name: string, files: Record<string, string>, mode: 'dev' | 'release' = 'release') {
  const folder = copyOf('stubs', `asked-${name}`)
  for (const file of readdirSync(join(folder, 'screens'))) writeFileSync(join(folder, 'screens', file), '')
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    writeFileSync(join(folder, file), text)
  }
  const made = await buildProject(folder, { for: mode })
  const errors = made.findings.filter((one) => one.level === 'error')
  return { made, errors, folder }
}

/** Every file of a bundle that a browser may load, each with its text. */
function browserFiles(bundle: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const name of readdirSync(join(bundle, 'browser')))
    found[name] = readFileSync(join(bundle, 'browser', name), 'latin1')
  return found
}

const backend = '../functions/orders.ts'

test('[31-1a] a backend file asked for as its text or as an address is refused: the build ends with T1005 on the line that asks, and writes no bundle', async () => {
  // Each way, with the file and the line that asks.
  const ways: Record<string, { files: Record<string, string>; at: [string, number] }> = {
    'as its text': {
      files: { 'screens/way.tsx': `${head}import held from '${backend}?raw'\n${tail('held')}` },
      at: ['screens/way.tsx', 2],
    },
    'as an address': {
      files: { 'screens/way.tsx': `${head}import held from '${backend}?url'\n${tail('held')}` },
      at: ['screens/way.tsx', 2],
    },
    'written into the code': {
      files: { 'screens/way.tsx': `${head}import held from '${backend}?inline'\n${tail('held')}` },
      at: ['screens/way.tsx', 2],
    },
    'as an address of its own': {
      files: {
        'screens/way.tsx': `${head}\nconst held = new URL('${backend}', import.meta.url)\n${tail('held.href')}`,
      },
      at: ['screens/way.tsx', 3],
    },
    'from a helper': {
      files: {
        'helpers/reach.ts': `// A helper that imports neither side.\nimport held from '${backend}?raw'\nexport const text = held\n`,
        'screens/way.tsx': `${head}import { text } from '../helpers/reach'\n${tail('text')}`,
      },
      at: ['helpers/reach.ts', 2],
    },
    'by a pattern of files as text': {
      files: {
        'screens/way.tsx': `${head}const held = import.meta.glob('../functions/*.ts', { eager: true, query: '?raw', import: 'default' })\n${tail('JSON.stringify(held)')}`,
      },
      at: ['screens/way.tsx', 2],
    },
    'by a pattern of files as addresses': {
      files: {
        'screens/way.tsx': `${head}const held = import.meta.glob('../tables/*.ts', { eager: true, query: '?url', import: 'default' })\n${tail('JSON.stringify(held)')}`,
      },
      at: ['screens/way.tsx', 2],
    },
    'from a style file': {
      files: {
        'screens/way.css': `.way {\n  background: url("${backend}");\n}\n`,
        'screens/way.tsx': `${head}import './way.css'\n${tail("'styled'")}`,
      },
      at: ['screens/way.css', 2],
    },
    'from a package': {
      files: {
        'node_modules/reach-package/package.json':
          '{ "name": "reach-package", "type": "module", "main": "index.js" }\n',
        'node_modules/reach-package/index.js': `import held from '../../functions/orders.ts?raw'\nexport default held\n`,
        'screens/way.tsx': `${head}import held from 'reach-package'\n${tail('held')}`,
      },
      at: ['node_modules/reach-package/index.js', 1],
    },
  }
  for (const mode of ['release', 'dev'] as const)
    for (const [name, way] of Object.entries(ways)) {
      const { made, errors } = await built(`${mode}-${name.replaceAll(' ', '-')}`, way.files, mode)
      const said = `${name}, for ${mode}: ${errors.map((one) => `${one.code} ${one.message}`).join(' | ')}`
      assert.deepEqual([...new Set(errors.map((one) => one.code))], ['T1005'], said)
      assert.equal(made.bundleFolder, '', said)
      const [found] = errors
      assert.deepEqual([found.where?.file, found.where?.line], way.at, said)
      assert.match(found.message, /orders\.ts/, said)
      assert.ok(found.fix, said)
    }
})

test('[31-1a] a file that is no backend file is still taken as its text and as an address', async () => {
  const { made, errors } = await built('free', {
    'screens/words.txt': 'WORDS-OF-A-TEXT-FILE\n',
    'screens/way.tsx': `${head}import held from './words.txt?raw'\nconst at = new URL('./words.txt', import.meta.url)\n${tail('held + at.href')}`,
  })
  assert.deepEqual(errors, [])
  assert.ok(Object.values(browserFiles(made.bundleFolder)).some((text) => text.includes('WORDS-OF-A-TEXT-FILE')))
})

test('[31-1a] a backend file named with a question mark or a hash after its name is answered with the generated file: the browser files hold its stubs and nothing else of it', async () => {
  const ways: Record<string, Record<string, string>> = {
    'a question mark': {
      'screens/way.tsx': `${head}import * as all from '${backend}?x=1'\n${tail('JSON.stringify(all)')}`,
    },
    'a hash': { 'screens/way.tsx': `${head}import * as all from '${backend}#x'\n${tail('JSON.stringify(all)')}` },
    'from a helper': {
      'helpers/reach.ts': `export * from '${backend}?v=2#top'\n`,
      'screens/way.tsx': `${head}import * as all from '../helpers/reach'\n${tail('JSON.stringify(all)')}`,
    },
  }
  for (const [name, files] of Object.entries(ways)) {
    const { made, errors } = await built(`named-${name.replaceAll(' ', '-')}`, files)
    assert.deepEqual(
      errors.map((one) => `${one.code} ${one.message}`),
      [],
      name,
    )
    const texts = Object.values(browserFiles(made.bundleFolder)).join('\n')
    // The stub of the query is there, by its name and its kind, and nothing of the file itself.
    assert.match(texts, /definition["'`]?:\s*["'`]openOrders["'`]/, name)
    assert.doesNotMatch(texts, /MARKER-OF-THE-BACKEND-FILE/, name)
    assert.doesNotMatch(texts, /sk_live_|paymentKey/, name)
  }
})
