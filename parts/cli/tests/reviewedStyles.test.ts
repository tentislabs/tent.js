import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

// A plugin of PostCSS that writes a rule for each class of the project's screens, as Tailwind CSS by PostCSS does:
// what it makes of a style file hangs on the other files of the project, and not on the style file alone.
const config = `import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const classes = {
  postcssPlugin: 'reviewed-classes',
  Once(root, { result }) {
    const file = join(import.meta.dirname, 'screens.tsx')
    result.messages.push({ type: 'dependency', plugin: 'reviewed-classes', file, parent: result.opts.from })
    for (const name of new Set(readFileSync(file, 'utf8').match(/rv-[a-z]+/g) ?? []))
      root.append(\`.\${name} { color: red }\`)
  },
}

export default { plugins: [classes] }
`

/** Waits until something holds, and answers whether it did within the time. */
async function within(ms: number, holds: () => boolean | Promise<boolean>): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await holds()) return true
    await new Promise((done) => setTimeout(done, 100))
  }
  return false
}

/** Every style file that the first HTML of an address names, read whole, one after the other. */
async function stylesOf(port: number, path: string): Promise<string> {
  const html = await (await fetch(`http://localhost:${port}${path}`, { headers: { accept: 'text/html' } })).text()
  const files = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((one) => one[1])
  let all = ''
  for (const file of files) all += await (await fetch(`http://localhost:${port}${file}`)).text()
  return all
}

test('[43-3] in development a style file that the project makes by a plugin of PostCSS from the classes of its files holds a class added in a save, as a release does', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'reviewed-postcss', 'devs')
  writeFileSync(join(folder, 'postcss.config.mjs'), config)
  writeFileSync(join(folder, 'look.css'), 'h1 { margin: 0 }\n')
  const file = join(folder, 'screens.tsx')
  writeFileSync(
    file,
    `import './look.css'\n${readFileSync(file, 'utf8').replace('<h1>The first heading</h1>', '<h1>The first heading rv-first</h1>')}`,
  )
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const first = await stylesOf(dev.port, '/outside')
  assert.match(first, /\.rv-first/, 'the plugin of PostCSS runs on the style file')
  const was = dev.version()
  writeFileSync(file, readFileSync(file, 'utf8').replace('heading rv-first', 'heading rv-first rv-second'))
  assert.ok(await within(20_000, () => dev.version() !== was), 'the save is built')
  assert.match(await stylesOf(dev.port, '/outside'), /\.rv-second/, 'the class added in the save has its rule')
})
