import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import type { Way } from './attackStubs.ts'
import { installed, markersIn, packageOf, screenWith } from './attackStubs.ts'
import { copyOf } from './projects.ts'

const filesIn = (folder: string, path = ''): string[] =>
  readdirSync(join(folder, path)).flatMap((name) => {
    const below = path ? `${path}/${name}` : name
    return statSync(join(folder, below)).isDirectory() ? filesIn(folder, below) : [below]
  })

/** What a build gave: whether a bundle was written, each error with its place, the browser files without the page code, and the marker texts they hold. */
interface Gave {
  built: boolean
  errors: string[]
  modules: string
  leaks: string[]
}

/** Builds the project in a folder, by the path it is given, and answers what every browser file of the bundle holds. */
async function gave(folder: string, mode: 'dev' | 'release'): Promise<Gave> {
  const made = await buildProject(folder, { for: mode })
  const errors = made.findings
    .filter((one) => one.level === 'error')
    .map((one) => `${one.code} ${one.where?.file}:${one.where?.line}`)
  if (made.bundleFolder === '') return { built: false, errors, modules: '', leaks: [] }
  let modules = ''
  for (const file of filesIn(made.bundleFolder)) {
    if (!file.startsWith('browser/') && !file.startsWith('assets/')) continue
    if (!file.startsWith('browser/page.')) modules += readFileSync(join(made.bundleFolder, file), 'latin1')
  }
  return { built: true, errors, modules, leaks: markersIn(modules) }
}

/** Writes the files of a way into a copy of the project of the vault, with the stand-in package, and answers its folder. */
function projectOf(name: string, way: Way): string {
  const folder = copyOf('attack-stubs', `places-${name}`)
  for (const [file, text] of Object.entries({ ...installed, ...way })) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    writeFileSync(join(folder, file), text)
  }
  return folder
}

/** Whether the disk of the tests takes a name in another case for the same file. */
function tellsNoCaseApart(): boolean {
  const folder = copyOf('attack-stubs', 'places-probe')
  return existsSync(join(folder, 'FUNCTIONS', 'VAULT.TS'))
}

/** The short name that the disk gives a folder, on Windows, or nothing where it gives none. */
function shortNameOf(folder: string): string | undefined {
  if (process.platform !== 'win32') return undefined
  try {
    // The command line is handed to `cmd` as it is written: a quote that the runtime escaped would be part of the name.
    const asked = `"for %I in ("${folder}") do @echo %~snxI"`
    const said = spawnSync('cmd', ['/d', '/s', '/c', asked], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
    }).stdout
    const name = said.trim()
    return name !== '' && name.includes('~') ? name : undefined
  } catch {
    return undefined
  }
}

/** Makes a link to a folder, and answers whether the system let it be made. */
function linkTo(folder: string, link: string): boolean {
  rmSync(link, { recursive: true, force: true })
  try {
    symlinkSync(folder, link, 'junction')
    return true
  } catch {
    return false
  }
}

// The generated file of the lone action, and what the file itself holds beside it.
const generated = /definition["'`]?:\s*["'`]askAlone["'`]/
const ofTheFile = ['signedIn', 'input.note', '.join(']

/** Holds that a build wrote a bundle whose browser files hold the generated file of the lone action and nothing else of it. */
function holdsTheGenerated(one: Gave, said: string): void {
  assert.deepEqual([one.built, one.errors, one.leaks], [true, [], []], said)
  assert.match(one.modules, generated, said)
  for (const text of ofTheFile) assert.ok(!one.modules.includes(text), `${said}: the browser files hold ${text}`)
}

/** Holds that a build ended with T1005 alone, at one place, and wrote no bundle. */
function refusedAt(one: Gave, place: string, said: string): void {
  assert.deepEqual([one.built, [...new Set(one.errors)], one.leaks], [false, [`T1005 ${place}`], []], said)
}

test('[05-4.28] a backend file named in another case, where the disk tells no case apart: its generated file where it is asked for as code, and T1005 on the line where it is asked for as text or as an address', async () => {
  // A disk that tells the case of a name apart has no other writing of this kind: there the test holds nothing.
  if (!tellsNoCaseApart()) return
  for (const mode of ['release', 'dev'] as const) {
    const ways: Record<string, { way: Way; at?: string }> = {
      'as text': {
        way: { 'screens/way.tsx': screenWith("import held from '../Functions/Vault.ts?raw'", 'held') },
        at: 'screens/way.tsx:2',
      },
      'as text, from a helper of plain code': {
        way: {
          'helpers/reach.js': "import held from '../FUNCTIONS/vault.ts?raw'\nexport const text = held\n",
          'screens/way.tsx': screenWith("import { text } from '../helpers/reach.js'", 'text'),
        },
        at: 'helpers/reach.js:1',
      },
      'as an address': {
        way: { 'screens/way.tsx': screenWith("import held from '../functions/VAULT.ts?url'", 'held') },
        at: 'screens/way.tsx:2',
      },
      'as an address of its own': {
        way: {
          'screens/way.tsx': screenWith("const held = new URL('../FUNCTIONS/vault.ts', import.meta.url)", 'held'),
        },
        at: 'screens/way.tsx:2',
      },
      'in a style file': {
        way: {
          'screens/look.css': '.look { background: url("../Functions/vault.ts") }\n',
          'screens/way.tsx': screenWith("import './look.css'", '1'),
        },
        at: 'screens/look.css:1',
      },
      'as code': {
        way: { 'screens/way.tsx': screenWith("import * as all from '../Functions/Alone.ts'", 'JSON.stringify(all)') },
      },
      'as code, with a question mark': {
        way: {
          'screens/way.tsx': screenWith("import * as all from '../FUNCTIONS/ALONE.ts?x=1'", 'JSON.stringify(all)'),
        },
      },
    }
    for (const [name, { way, at }] of Object.entries(ways)) {
      const one = await gave(projectOf(`case-${mode}-${name.replaceAll(/[ ,]+/g, '-')}`, way), mode)
      if (at === undefined) holdsTheGenerated(one, `${name}, for ${mode}`)
      else refusedAt(one, at, `${name}, for ${mode}`)
    }
  }
})

test('[05-4.28] a backend file named by a short name of the disk: its generated file where it is asked for as code, and T1005 on the line where it is asked for as text', async () => {
  const probe = projectOf('short-probe', {})
  const short = shortNameOf(join(probe, 'functions'))
  // A disk that gives a folder no short name has no other writing of this kind: there the test holds nothing.
  if (short === undefined) return
  const asText = await gave(
    projectOf('short-text', { 'screens/way.tsx': screenWith(`import held from '../${short}/vault.ts?raw'`, 'held') }),
    'release',
  )
  refusedAt(asText, 'screens/way.tsx:2', 'as text')
  const asCode = await gave(
    projectOf('short-code', {
      'screens/way.tsx': screenWith(`import * as all from '../${short}/alone.ts'`, 'JSON.stringify(all)'),
    }),
    'release',
  )
  holdsTheGenerated(asCode, 'as code')
})

test('[05-4.28] a project that is built through a link to its folder: each backend file is answered with its generated file, and refused as text and as an address', async () => {
  for (const mode of ['release', 'dev'] as const) {
    const ways: Record<string, { way: Way; at?: string }> = {
      'the plain import of every screen': {
        way: {
          'screens/way.tsx': screenWith("import * as all from '../functions/alone.ts'", 'JSON.stringify(all)'),
        },
      },
      'through a helper and a package': {
        way: {
          ...packageOf('relay-package', "export * from '../../functions/alone.ts'\n"),
          'helpers/reach.ts': "export * from 'relay-package'\n",
          'screens/way.tsx': screenWith("import * as all from '../helpers/reach'", 'JSON.stringify(all)'),
        },
      },
      'as text': {
        way: { 'screens/way.tsx': screenWith("import held from '../functions/vault.ts?raw'", 'held') },
        at: 'screens/way.tsx:2',
      },
      'as an address of its own': {
        way: {
          'screens/way.tsx': screenWith("const held = new URL('../functions/vault.ts', import.meta.url)", 'held'),
        },
        at: 'screens/way.tsx:2',
      },
    }
    for (const [name, { way, at }] of Object.entries(ways)) {
      const tag = `link-${mode}-${name.replaceAll(/[ ,]+/g, '-')}`
      const folder = projectOf(tag, way)
      const link = join(dirname(dirname(folder)), `${tag}-linked`)
      assert.ok(linkTo(dirname(folder), link), 'a link to a folder can be made on this computer')
      const one = await gave(join(link, 'attack-stubs'), mode)
      if (at === undefined) holdsTheGenerated(one, `${name}, for ${mode}`)
      else refusedAt(one, at, `${name}, for ${mode}`)
    }
  }
})

test('[31-1a@6] an import while running whose name holds a value, of a backend file as its text or as an address: T1005 on the line that asks, wherever it stands in its file', async () => {
  // The name of the file as each way writes it: between backticks, with a value in the place of the name.
  const named = (after: string): string => ['`../functions/$', `{name}.ts${after}\``].join('')
  const ways: Record<string, { way: Way; at: string }> = {
    'as text, by a value': {
      way: {
        'screens/way.tsx': screenWith(
          `const name = 'vault'\nconst held = (): Promise<unknown> => import(${named('?raw')})`,
          'String(held)',
        ),
      },
      at: 'screens/way.tsx:3',
    },
    'as an address, by a value, in a helper': {
      way: {
        'helpers/reach.ts': `// A helper.\n\nexport const held = (name: string): Promise<unknown> =>\n  import(${named('?url')})\n`,
        'screens/way.tsx': screenWith("import { held } from '../helpers/reach'", 'String(held)'),
      },
      at: 'helpers/reach.ts:4',
    },
  }
  for (const [name, { way, at }] of Object.entries(ways))
    refusedAt(await gave(projectOf(`value-${name.replaceAll(/[ ,()]+/g, '-')}`, way), 'release'), at, name)
})

test('[05-4.29] a backend file named as a worker, also with room or a comment inside the call: the build ends with T1005 on the line that asks, and writes no bundle', async () => {
  const lone = '../functions/alone.ts'
  const calls: Record<string, string> = {
    plain: `new Worker(new URL('${lone}', import.meta.url), { type: 'module' })`,
    'room after URL': `new Worker(new URL ('${lone}', import.meta.url), { type: 'module' })`,
    'a comment inside': `new Worker(new URL(/* here */ '${lone}', /* and here */ import.meta.url), { type: 'module' })`,
    'a comment after new': `new Worker(new /* here */ URL('${lone}', import.meta.url))`,
    'a line break inside': `new Worker(new URL(\n  '${lone}',\n  import.meta.url,\n), { type: 'module' })`,
    'a shared worker': `new SharedWorker(new URL ('${lone}', import.meta.url), { type: 'module' })`,
    // Made when a view asks for it, so that the file can be run on the server: the builder of a browser builds it.
    'made by a function': `(): unknown => new Worker(new URL ('${lone}', import.meta.url), { type: 'module' })`,
    'an address alone, with room': `new URL ('${lone}', import.meta.url)`,
    'an address alone, with a comment': `new URL('${lone}', /* here */ import.meta.url)`,
  }
  for (const mode of ['release', 'dev'] as const)
    for (const [name, call] of Object.entries(calls)) {
      const tag = `worker-${mode}-${name.replaceAll(/[ ,]+/g, '-')}`
      const inScreen = await gave(
        projectOf(tag, { 'screens/way.tsx': screenWith(`const held = ${call}`, 'held') }),
        mode,
      )
      // The line that asks is the one that names the file.
      refusedAt(
        inScreen,
        `screens/way.tsx:${name === 'a line break inside' ? 3 : 2}`,
        `${name}, in a screen file, for ${mode}`,
      )
    }
  // The same from a package and from a helper of plain code: the line of the file that asks.
  const call = calls['room after URL']
  const inPackage = await gave(
    projectOf('worker-package', {
      ...packageOf(
        'relay-worker',
        `// A package that starts a worker.\nexport const held = ${call}\n`.replace(lone, '../../functions/alone.ts'),
      ),
      'screens/way.tsx': screenWith("import { held } from 'relay-worker'", 'held'),
    }),
    'release',
  )
  refusedAt(inPackage, 'node_modules/relay-worker/index.js:2', 'in a package')
})

test('[05-4.29] seed.ts, engine.ts, the file of the project and a file under tests/ asked for as text or as an address: the build ends with T1005 on the line that asks, and writes no bundle', async () => {
  const others: Way = {
    'seed.ts': "import { seed } from 'tentjs'\n// MARKER-SEED-OF-THE-PROJECT-0123456789\nexport default seed([])\n",
    'engine.ts': '// MARKER-ENGINE-OF-THE-PROJECT-0123456789\nexport default {}\n',
    'tests/one.test.ts': '// MARKER-TEST-OF-THE-PROJECT-0123456789\nexport const one = 1\n',
    'tests/deep/two.test.ts': '// MARKER-DEEP-TEST-OF-THE-PROJECT-0123456789\nexport const two = 2\n',
  }
  const asks: Record<string, string> = {
    'the seed as text': "import held from '../seed.ts?raw'",
    'the seed as an address': "import held from '../seed.ts?url'",
    'the seed as an address of its own': "const held = new URL('../seed.ts', import.meta.url)",
    'the makers of the adapters as text': "import held from '../engine.ts?raw'",
    'the file of the project as text': "import held from '../tent.ts?raw'",
    'the file of the project as an address of its own': "const held = new URL ('../tent.ts', import.meta.url)",
    'a test file as text': "import held from '../tests/one.test.ts?raw'",
    'a test file of a folder as text': "import held from '../tests/deep/two.test.ts?raw'",
    'every test file by a pattern':
      "const held = import.meta.glob('../tests/**/*.ts', { eager: true, query: '?raw', import: 'default' })",
  }
  for (const mode of ['release', 'dev'] as const)
    for (const [name, line] of Object.entries(asks)) {
      const tag = `others-${mode}-${name.replaceAll(/[ ,]+/g, '-')}`
      const one = await gave(
        projectOf(tag, { ...others, 'screens/way.tsx': screenWith(line, 'JSON.stringify(held)') }),
        mode,
      )
      refusedAt(one, 'screens/way.tsx:2', `${name}, for ${mode}`)
    }
  // What is no file of these is still taken as its text: a text file beside them.
  const free = await gave(
    projectOf('others-free', {
      ...others,
      'tests-notes.txt': 'WORDS-OF-A-TEXT-FILE\n',
      'screens/way.tsx': screenWith("import held from '../tests-notes.txt?raw'", 'held'),
    }),
    'release',
  )
  assert.deepEqual([free.built, free.errors], [true, []])
  assert.ok(free.modules.includes('WORDS-OF-A-TEXT-FILE'))
})

test('[31-1a] a refusal names the line that asks, in a style file that imports by an address and in a package, and never the backend file', async () => {
  const ways: Record<string, { way: Way; at: string }> = {
    'a style file that imports by url()': {
      way: {
        'screens/look.css': '.first { color: red }\n@import url(../functions/vault.ts);\n',
        'screens/way.tsx': screenWith("import './look.css'", '1'),
      },
      at: 'screens/look.css:2',
    },
    'a style file that imports by a text': {
      way: {
        'screens/look.css': '@import "../functions/vault.ts";\n.first { color: red }\n',
        'screens/way.tsx': screenWith("import './look.css'", '1'),
      },
      at: 'screens/look.css:1',
    },
    'an address of its own in a package, with room': {
      way: {
        ...packageOf(
          'relay-at',
          "export const one = 1\nexport const at = new URL ('../../functions/vault.ts', import.meta.url)\n",
        ),
        'screens/way.tsx': screenWith("import { at } from 'relay-at'", 'at'),
      },
      at: 'node_modules/relay-at/index.js:2',
    },
  }
  for (const [name, { way, at }] of Object.entries(ways))
    refusedAt(await gave(projectOf(`line-${name.replaceAll(/[ ,()]+/g, '-')}`, way), 'release'), at, name)
})
