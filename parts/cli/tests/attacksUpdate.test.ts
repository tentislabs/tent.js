import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { readKnown } from '../../engine/index.ts'
import { updateInstall } from '../install/updateInstall.ts'
import type { TestKey } from './releasing.ts'
import {
  releaseFolderOf,
  installedFrom,
  layerOf,
  madeRelease,
  madeReleases,
  playerOf,
  releasesServer,
  signedFile,
  releaseKey,
} from './releasing.ts'

const system = `${process.platform}-${process.arch}`

/** The code of what a promise was refused with, or `answered`. */
const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'answered',
    (error: unknown) => String(Reflect.get(Object(error), 'code') ?? error),
  )

/** What the folder of an install holds: the version it uses, and the versions it holds. */
const stateOf = (home: string): string =>
  `${readFileSync(join(home, 'current'), 'utf8').trim()} ${readdirSync(join(home, 'versions')).sort().join(',')}`

/** Puts a player layer of other files into a release, and signs its `release.json` again over the new fingerprint. */
function playerSwapped(served: string, version: string, files: Record<string, string>, keys: TestKey[]): void {
  const file = `player-${system}.tar.br`
  const bytes = layerOf(files)
  writeFileSync(join(served, version, file), bytes)
  const release = JSON.parse(readFileSync(join(served, version, 'release.json'), 'utf8'))
  release.layers[system].player = {
    file,
    size: bytes.length,
    fingerprint: createHash('sha256').update(bytes).digest('hex'),
  }
  signedFile(join(served, version, 'release.json'), release, keys)
}

test('[41-12.10] a release list with a wrong signature, a layer whose bytes differ, an older list rightly signed, a release.json of another version, and an archive with a path that leaves its folder are T0026 each time, and the install is as it was', async (t) => {
  const folder = releaseFolderOf(t, 'attacks-update')
  const key = releaseKey()
  const stranger = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const releases = await releasesServer(t, served)
  const update = (): Promise<string> =>
    codeOf(updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch }))
  const before = stateOf(home)
  // A list signed by another key.
  madeRelease(served, '1.0.1', { keys: [key] })
  madeReleases(served, ['1.0.1'], [stranger], 2_000_000)
  assert.equal(await update(), 'T0026')
  assert.equal(stateOf(home), before)
  // A layer whose bytes are not those its release states.
  madeReleases(served, ['1.0.1'], [key], 2_000_000)
  const layer = join(served, '1.0.1', `player-${system}.tar.br`)
  const bytes = readFileSync(layer)
  bytes[bytes.length >> 1] ^= 1
  writeFileSync(layer, bytes)
  assert.equal(await update(), 'T0026')
  assert.equal(stateOf(home), before)
  // An archive whose path leaves its folder, though its release is rightly signed over its bytes.
  playerSwapped(served, '1.0.1', { ...playerOf('1.0.1'), '../../escaped.txt': 'out of the folder' }, [key])
  assert.equal(await update(), 'T0026')
  assert.equal(stateOf(home), before)
  assert.equal(existsSync(join(home, 'escaped.txt')), false)
  assert.equal(existsSync(join(home, 'versions', 'escaped.txt')), false)
  // A good release is taken, so that the list it came with is the newest this install saw.
  madeRelease(served, '1.0.1', { keys: [key] })
  assert.equal(await update(), 'answered')
  const taken = stateOf(home)
  // An older list, rightly signed, that offers an older version as the newest.
  madeRelease(served, '1.0.2', { keys: [key] })
  madeReleases(served, ['1.0.2'], [key], 1_000_000)
  assert.equal(await update(), 'T0026')
  assert.equal(stateOf(home), taken)
  // A newer list whose release.json is that of another version than the one asked for.
  madeReleases(served, ['1.0.2', '1.0.1'], [key], 3_000_000)
  madeRelease(served, '1.0.9', { keys: [key] })
  writeFileSync(join(served, '1.0.2', 'release.json'), readFileSync(join(served, '1.0.9', 'release.json')))
  writeFileSync(join(served, '1.0.2', 'release.json.sig'), readFileSync(join(served, '1.0.9', 'release.json.sig')))
  assert.equal(await update(), 'T0026')
  assert.equal(stateOf(home), taken)
})

test('[41-12.11] a list of known problems with a wrong signature, an older one rightly signed, and one that names a fix on another host are thrown away; a list names versions and never an address', async (t) => {
  const folder = releaseFolderOf(t, 'attacks-known')
  const key = releaseKey()
  const stranger = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const releases = await releasesServer(t, served)
  const read = (): Promise<string> =>
    codeOf(readKnown(home, { from: releases.address, keys: [key.public], fetch: releases.fetch }))
  const known = (made: number, versions: object, keys: TestKey[]): void =>
    signedFile(join(served, 'known.json'), { format: 'tent.known/1', made, versions }, keys)
  known(2_000_000, { '1.0.0': { problem: 'A sentence.', fixed: '1.0.1' } }, [key])
  assert.equal(await read(), 'answered')
  const kept = readFileSync(join(home, 'known.json'), 'utf8')
  known(3_000_000, { '1.0.0': { problem: 'Another sentence.', fixed: '1.0.2' } }, [stranger])
  assert.equal(await read(), 'T0026')
  known(1_000_000, { '1.0.0': { problem: 'An old sentence.', fixed: '1.0.1' } }, [key])
  assert.equal(await read(), 'T0026')
  known(4_000_000, { '1.0.0': { problem: 'Fetch the fix there.', fixed: 'https://elsewhere.example.com/1.0.1' } }, [
    key,
  ])
  assert.equal(await read(), 'T0026')
  known(5_000_000, { '1.0.0': { problem: 'A sentence.', fixed: '1.0.1', from: 'https://elsewhere.example.com/' } }, [
    key,
  ])
  assert.equal(await read(), 'answered')
  // What the list held beside the versions is kept nowhere: the install keeps versions and sentences alone.
  assert.equal(readFileSync(join(home, 'known.json'), 'utf8').includes('elsewhere'), false)
  assert.ok(kept.includes('A sentence.'))
})
