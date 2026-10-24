import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { errorsOf } from './projects.ts'

// A font of a package and one of the project's assets, each named by a style file of a screen that a chat app
// shows. The bytes of each are one character many times over, which no style text holds.
const packageFont = new Uint8Array(5000).fill(3)
const ownFont = new Uint8Array(6000).fill(7)

const files: Record<string, string | Uint8Array> = {
  'tent.ts': "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n",
  'screens/shop.tsx': `import 'tiny-font'
import './shop.css'
import { screen } from 'tentjs/ui'

export const shopScreen = screen('shopScreen', {
  path: '/shop',
  access: 'anyone',
  about: 'What the shop holds',
  offer: ['mcp'],
  view: () => <h1>The shop</h1>,
})
`,
  'screens/shop.css': '@font-face { font-family: "Own"; src: url(../assets/own.woff2) format("woff2"); }\n',
  'node_modules/tiny-font/package.json': JSON.stringify({
    name: 'tiny-font',
    version: '1.0.0',
    main: 'index.css',
  }),
  'node_modules/tiny-font/index.css':
    '@font-face { font-family: "Tiny"; src: url(./files/tiny-latin-wght-normal.woff2) format("woff2"); }\n',
  'node_modules/tiny-font/files/tiny-latin-wght-normal.woff2': packageFont,
  'assets/own.woff2': ownFont,
}

test('[25-9] the one file of a screen in a chat holds its style files as styles, and never the bytes of a font that a style file names', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `reviewFix2Front-${Math.random().toString(36).slice(2)}`)
  t.after(() =>
    rmSync(folder, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    }),
  )
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, 'shop', path)), { recursive: true })
    writeFileSync(join(folder, 'shop', path), bytes)
  }
  const made = await buildProject(join(folder, 'shop'), {
    for: 'release',
    out: join(folder, 'bundle'),
  })
  assert.deepEqual(errorsOf(made.findings), [])
  const chat: unknown = Object(Object(Object(made.description).mcp).screens).shopScreen
  const file: unknown = Object(chat).en
  assert.equal(typeof file, 'string', 'the screen has its one file for a chat')
  const text = readFileSync(join(made.bundleFolder, String(file)), 'utf8')
  assert.match(text, /font-family:\s*"?Tiny/, 'the style file of the package is a style of the file')
  for (const [name, bytes] of [
    ['package', packageFont],
    ['own', ownFont],
  ] as const)
    assert.ok(
      !text.includes(String.fromCharCode(bytes[0]).repeat(100)),
      `the bytes of the ${name} font are no style of the file`,
    )
})
