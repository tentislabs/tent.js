import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { FetchedPart } from '../index.ts'
import { fetchPart } from '../index.ts'
import { refusal, workFolder } from './apps.ts'
import { everythingIn, partServer, placeOf, tgzOf } from './archives.ts'

/** The fingerprint of bytes as the npm registry gives it: SHA-512 in base64, with the name of the hash in front. */
const integrityOf = (bytes: Uint8Array): string => `sha512-${createHash('sha512').update(bytes).digest('base64')}`

/** A package file as the npm registry serves one: every path under `package/`. */
const packageOf = (files: Record<string, string>): Uint8Array<ArrayBuffer> =>
  tgzOf([
    { path: 'package', folder: true },
    ...Object.entries(files).map(([path, text]) => ({ path: `package/${path}`, text })),
  ])

test('[22-6@7a] a part of several package files of the npm registry lays each in the folder that its line names, and holds each to the fingerprint that the registry gives', async (t) => {
  const own = packageOf({ 'package.json': '{"name":"resizer"}', 'lib/index.js': 'the resizer' })
  const library = packageOf({ 'package.json': '{"name":"@img/library"}', 'lib/library.txt': 'the library' })
  const server = await partServer(t, { '/resizer-1.0.0.tgz': own, '/library-2.0.0.tgz': library })
  const folder = workFolder(t)
  const line = (from: string, bytes: Uint8Array, into: string): FetchedPart => ({
    name: 'resizer',
    version: '1.0.0',
    from: `${server.origin}${from}`,
    fingerprint: integrityOf(bytes),
    into,
  })
  const list = [
    line('/resizer-1.0.0.tgz', own, 'node_modules/resizer'),
    line('/library-2.0.0.tgz', library, 'node_modules/@img/library'),
  ]
  const place = await fetchPart('resizer', { list, folder, mode: 'development' })
  assert.equal(place, placeOf(folder, 'resizer', '1.0.0'))
  // Each package file is laid in its folder, with its own first folder left out: two of them hold one name.
  assert.equal(readFileSync(join(place, 'node_modules', 'resizer', 'lib', 'index.js'), 'utf8'), 'the resizer')
  assert.equal(
    readFileSync(join(place, 'node_modules', '@img', 'library', 'lib', 'library.txt'), 'utf8'),
    'the library',
  )
  assert.deepEqual(everythingIn(place), [
    'node_modules',
    'node_modules/@img',
    'node_modules/@img/library',
    'node_modules/@img/library/lib',
    'node_modules/@img/library/lib/library.txt',
    'node_modules/@img/library/package.json',
    'node_modules/resizer',
    'node_modules/resizer/lib',
    'node_modules/resizer/lib/index.js',
    'node_modules/resizer/package.json',
  ])

  // A file whose bytes do not have the fingerprint of the registry is thrown away with its part.
  const other = workFolder(t)
  const wrong = [list[0], { ...list[1], fingerprint: integrityOf(own) }]
  const refused = await refusal(fetchPart('resizer', { list: wrong, folder: other, mode: 'development' }))
  assert.equal(refused.code, 'T0016', refused.message)
  assert.deepEqual(everythingIn(join(other, 'fetched')), ['.tmp'])
  // A folder that climbs out of the part is refused as a path in an archive is.
  const out = [list[0], { ...list[1], into: '../outside' }]
  assert.equal(
    (await refusal(fetchPart('resizer', { list: out, folder: workFolder(t), mode: 'development' }))).code,
    'T0016',
  )
})
