import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { linked } from '../assetLink.ts'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

test('[05-4.6] an entry of assets that is a link is an asset only where it leads to a file inside assets/', () => {
  // The real place of each path, as the system would say it: a test needs no link for this.
  const places: Record<string, string | undefined> = {
    '/shop/assets/inside.txt': '/shop/assets/kept/words.txt',
    '/shop/assets/shared.txt': '/shop/shared/words.txt',
    '/shop/assets/backend.txt': '/shop/functions/orders.ts',
    '/shop/assets/built.txt': '/shop/.tent/build/description.json',
    '/shop/assets/near.txt': '/shop/assets-other/words.txt',
    '/shop/assets': '/shop/assets',
    '/shop/assets/outside.txt': '/etc/passwd',
    '/shop/assets/beside.txt': '/shop-other/words.txt',
    '/shop/assets/folder': '/shop/assets/kept',
    '/shop/assets/nothing.txt': undefined,
    '/shop': '/shop',
  }
  const files = [
    '/shop/assets/kept/words.txt',
    '/shop/shared/words.txt',
    '/shop/functions/orders.ts',
    '/shop/.tent/build/description.json',
    '/shop/assets-other/words.txt',
    '/etc/passwd',
    '/shop-other/words.txt',
  ]
  const system = {
    real: (path: string): string => {
      const place = places[path]
      if (place === undefined) throw new Error('ENOENT')
      return place
    },
    isFile: (path: string): boolean => files.includes(path),
  }
  assert.deepEqual(linked('/shop/assets', '/shop/assets/inside.txt', system), { file: '/shop/assets/kept/words.txt' })
  for (const [name, why] of [
    ['outside.txt', /out of assets/],
    ['beside.txt', /out of assets/],
    // A file of the project that is no asset is out of it too: a helper, a backend file, a file that a build made.
    ['shared.txt', /out of assets/],
    ['backend.txt', /out of assets/],
    ['built.txt', /out of assets/],
    // And so is a folder beside it whose name starts as its own.
    ['near.txt', /out of assets/],
    ['folder', /a folder/],
    ['nothing.txt', /nothing/],
  ] as const) {
    const said = linked('/shop/assets', `/shop/assets/${name}`, system)
    assert.ok('why' in said, name)
    assert.match(said.why, why, name)
  }
})

test('[05-4.6] a link in assets that leads to a folder, to nothing or out of assets/ is T9002, as a finding, and nothing of what it leads to is in the bundle', async () => {
  const folder = copyOf('screens', 'asset-links')
  const outside = join(folder, '..', 'outside')
  mkdirSync(join(outside, 'kept'), { recursive: true })
  writeFileSync(join(outside, 'kept', 'secret.txt'), 'TEXT-OF-A-FILE-OUTSIDE-THE-PROJECT')
  mkdirSync(join(folder, 'assets'), { recursive: true })
  writeFileSync(join(folder, 'assets', 'own.txt'), 'own')
  // A link to a folder can be made on every system. One to a file cannot on each: where it can, it is held too.
  symlinkSync(join(outside, 'kept'), join(folder, 'assets', 'kept'), 'junction')
  const wanted = ['assets/kept']
  try {
    symlinkSync(join(outside, 'kept', 'secret.txt'), join(folder, 'assets', 'leak.txt'), 'file')
    wanted.push('assets/leak.txt')
    symlinkSync(join(folder, 'gone.txt'), join(folder, 'assets', 'gone.txt'), 'file')
    wanted.push('assets/gone.txt')
    // A backend file of the project itself is no asset by a link.
    symlinkSync(join(folder, 'tent.ts'), join(folder, 'assets', 'project.txt'), 'file')
    wanted.push('assets/project.txt')
  } catch {
    // This system lets this user make no link to a file: the first test holds what such a link would give.
  }
  const made = await buildProject(folder, { for: 'release' })
  const found = made.findings.filter((one) => one.code === 'T9002')
  assert.deepEqual(found.map((one) => one.where?.file).sort(), wanted.sort())
  for (const one of found) assert.ok(one.fix && one.level === 'error')
  assert.equal(made.bundleFolder, '')
  // Without the links the project builds, and the bundle holds its own asset and nothing of the folder outside.
  const clean = copyOf('screens', 'asset-links-clean')
  mkdirSync(join(clean, 'assets'), { recursive: true })
  writeFileSync(join(clean, 'assets', 'own.txt'), 'own')
  const built = await buildProject(clean, { for: 'release' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const names = readdirSync(join(built.bundleFolder, 'assets'))
  assert.equal(names.length, 1)
  assert.equal(readFileSync(join(built.bundleFolder, 'assets', names[0]), 'utf8'), 'own')
})
