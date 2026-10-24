import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { bundleViews } from '../borrowed/vite.ts'

const root = join(import.meta.dirname, '..', '..', '..', 'results', 'build', 'worker-hold')

test('[05-4.29@6] the hold in the build of a worker stands by itself: where the reading of the words finds nothing, a held file that is named as a worker is refused, and nothing of it is built', async (t) => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const folder = realpathSync.native(root).replaceAll('\\', '/')
  writeFileSync(join(folder, 'vault.ts'), "export const held = 'MARKER-OF-THE-VAULT'\n")
  writeFileSync(
    join(folder, 'way.ts'),
    "export const started = (): Worker => new Worker(new URL('./vault.ts', import.meta.url), { type: 'module' })\n",
  )
  const refused: string[] = []
  const built = await bundleViews({
    folder,
    inputs: { way: 'entry:way' },
    made: new Map([['entry:way', `export * from ${JSON.stringify(`${folder}/way.ts`)}\n`]]),
    instead: () => undefined,
    read: (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    parted: (asked) => {
      const at = asked.search(/[?#]/)
      return at < 0 ? [asked, ''] : [asked.slice(0, at), asked.slice(at)]
    },
    asksForBytes: (after) => /[?&](raw|url|inline)\b/.test(after),
    place: (path) => path.replaceAll('\\', '/'),
    backend: (file) => file.endsWith('/vault.ts'),
    refused: (file) => void refused.push(file.slice(file.lastIndexOf('/') + 1)),
    // The first hold, the reading of the words, finds nothing here: what is left is the hold of the worker's own build.
    cleaned: () => undefined,
    side: 'browser',
    names: [],
    small: false,
  })
  assert.deepEqual([...new Set(refused)], ['vault.ts'])
  const all = built.made.map((one) => Buffer.from(one.bytes).toString('latin1')).join('\n')
  assert.equal(
    all.includes('MARKER-OF-THE-VAULT'),
    false,
    'a file that the builder made holds the text of the held file',
  )
})
