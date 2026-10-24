import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { updateInstall } from '../install/updateInstall.ts'
import {
  releaseFolderOf,
  installedFrom,
  layerOf,
  madeRelease,
  madeReleases,
  releasesServer,
  signedFile,
  releaseKey,
} from './releasing.ts'

// The attacks of the reviewer on an update: what a copy of the releases, or a line between, can do to an install.

const system = `${process.platform}-${process.arch}`

/** What the folder of an install holds: the version it uses, and the versions it holds. */
const stateOf = (home: string): string =>
  `${readFileSync(join(home, 'current'), 'utf8').trim()} ${readdirSync(join(home, 'versions')).sort().join(',')}`

test('[41-12.25] a layer that is larger than release.json says, and one that arrives one byte a second, is cut, and the install is as it was', async (t) => {
  const folder = releaseFolderOf(t, 'review-cut')
  const key = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  madeRelease(served, '1.0.1', { keys: [key], tools: false })
  madeReleases(served, ['1.0.1', '1.0.0'], [key])
  // The player layer is larger than its line says: the line is signed rightly, over a size that is too small.
  const file = `player-${system}.tar.br`
  const large = Buffer.concat([layerOf({ 'player/tent.mjs': 'x'.repeat(200_000) })])
  writeFileSync(join(served, '1.0.1', file), large)
  const release = JSON.parse(readFileSync(join(served, '1.0.1', 'release.json'), 'utf8'))
  release.layers[system].player = {
    file,
    size: 100,
    fingerprint: createHash('sha256').update(large.subarray(0, 100)).digest('hex'),
  }
  signedFile(join(served, '1.0.1', 'release.json'), release, [key])
  const before = stateOf(home)
  const releases = await releasesServer(t, served)
  await assert.rejects(updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch }))
  assert.equal(stateOf(home), before)
  // A layer that arrives one byte a second is cut at the time of a layer.
  madeRelease(served, '1.0.2', { keys: [key], tools: false })
  madeReleases(served, ['1.0.2', '1.0.1', '1.0.0'], [key])
  const slow = await releasesServer(t, served, { slow: (path) => path.startsWith('1.0.2/runtime-') })
  const began = Date.now()
  await assert.rejects(updateInstall(home, { from: slow.address, keys: [key.public], fetch: slow.fetch, time: 3000 }))
  assert.ok(Date.now() - began < 20_000, 'cut at its time')
  assert.equal(stateOf(home), before)
})

test('[41-12.38] a trust.json in a release that no present key signed is not taken', async (t) => {
  const folder = releaseFolderOf(t, 'review-trust-stranger')
  const key = releaseKey()
  const stranger = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  madeRelease(served, '1.0.1', { keys: [key], tools: false })
  madeReleases(served, ['1.0.1', '1.0.0'], [key])
  // The release is ours; its trust.json names a key of a stranger, and is signed by that key and no other.
  signedFile(
    join(served, '1.0.1', 'trust.json'),
    { format: 'tent.trust/1', made: Date.now(), keys: [stranger.public] },
    [stranger],
  )
  const releases = await releasesServer(t, served)
  await updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch })
  assert.deepEqual(JSON.parse(readFileSync(join(home, 'trust.json'), 'utf8')).keys, [key.public])
})

test('[41-12.45] an older, rightly signed trust.json, served again, is not taken', async (t) => {
  const folder = releaseFolderOf(t, 'review-trust-older')
  const key = releaseKey()
  const next = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const keysOf = (): string[] => JSON.parse(readFileSync(join(home, 'trust.json'), 'utf8')).keys
  // A newer list puts the old key out.
  madeRelease(served, '1.0.1', { keys: [key], tools: false, trust: { keys: [next.public], made: 200 } })
  madeReleases(served, ['1.0.1', '1.0.0'], [key])
  const releases = await releasesServer(t, served)
  await updateInstall(home, { from: releases.address, keys: keysOf(), fetch: releases.fetch })
  assert.deepEqual(keysOf(), [next.public])
  // The list before it, which named the old key, is served again in a newer release, signed rightly by both keys.
  madeRelease(served, '1.0.2', { keys: [next, key], tools: false, trust: { keys: [key.public], made: 100 } })
  madeReleases(served, ['1.0.2', '1.0.1', '1.0.0'], [next])
  await updateInstall(home, { from: releases.address, keys: keysOf(), fetch: releases.fetch })
  assert.deepEqual(keysOf(), [next.public])
})
