import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { updateInstall } from '../install/updateInstall.ts'
import {
  releaseFolderOf,
  installedFrom,
  madeRelease,
  madeReleases,
  releasesServer,
  runtimePath,
  releaseKey,
} from './releasing.ts'

const system = `${process.platform}-${process.arch}`

/** The code of what a promise was refused with. */
const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'answered',
    (error: unknown) => String(Reflect.get(Object(error), 'code') ?? error),
  )

/** What the folder of an install holds at its top, and the versions it holds. */
const stateOf = (home: string) => ({
  current: readFileSync(join(home, 'current'), 'utf8').trim(),
  previous: existsSync(join(home, 'previous')) ? readFileSync(join(home, 'previous'), 'utf8').trim() : undefined,
  versions: readdirSync(join(home, 'versions')).sort(),
})

test('[41-4] updateInstall to a test version and back leaves a working install both ways', async (t) => {
  const folder = releaseFolderOf(t, 'both-ways')
  const key = releaseKey()
  const served = join(folder, 'served')
  const runtime = readFileSync(process.execPath)
  for (const version of ['1.0.0', '1.0.1']) madeRelease(served, version, { keys: [key], runtime, tools: false })
  madeReleases(served, ['1.0.1', '1.0.0'], [key])
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key], process.execPath)
  const releases = await releasesServer(t, served)
  /** What the version that `current` names says, when its runtime runs its player. */
  const working = (): string => {
    const version = join(home, 'versions', readFileSync(join(home, 'current'), 'utf8').trim())
    const ran = spawnSync(join(version, runtimePath), [join(version, 'player', 'tent.mjs')], { encoding: 'utf8' })
    return String(JSON.parse(ran.stdout).version)
  }
  assert.equal(working(), '1.0.0')
  const keys = [key.public]
  assert.deepEqual(await updateInstall(home, { from: releases.address, keys, fetch: releases.fetch }), {
    version: '1.0.1',
    was: '1.0.0',
  })
  assert.equal(working(), '1.0.1')
  assert.deepEqual(stateOf(home), { current: '1.0.1', previous: '1.0.0', versions: ['1.0.0', '1.0.1'] })
  assert.deepEqual(await updateInstall(home, { back: true, from: releases.address, keys, fetch: releases.fetch }), {
    version: '1.0.0',
    was: '1.0.1',
  })
  assert.equal(working(), '1.0.0')
  assert.deepEqual(stateOf(home), { current: '1.0.0', previous: '1.0.1', versions: ['1.0.0', '1.0.1'] })
  // A version lower than current is taken only where it was typed, and the newest is never passed over.
  assert.deepEqual(await updateInstall(home, { from: releases.address, keys, fetch: releases.fetch }), {
    version: '1.0.1',
    was: '1.0.0',
  })
  assert.deepEqual(
    await updateInstall(home, { version: '1.0.0', from: releases.address, keys, fetch: releases.fetch }),
    { version: '1.0.0', was: '1.0.1' },
  )
  assert.equal(working(), '1.0.0')
})

test("[41-4] a release whose signature, or one file's fingerprint, does not fit is T0026 and changes nothing", async (t) => {
  const folder = releaseFolderOf(t, 'not-fitting')
  const key = releaseKey()
  const stranger = releaseKey()
  const served = join(folder, 'served')
  madeRelease(served, '1.0.1', { keys: [key] })
  // A list signed by a key that the install does not trust.
  madeReleases(served, ['1.0.1'], [stranger])
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const releases = await releasesServer(t, served)
  const update = () => updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch })
  assert.equal(await codeOf(update()), 'T0026')
  assert.deepEqual(stateOf(home), { current: '1.0.0', previous: undefined, versions: ['1.0.0'] })
  // A list that is signed, over a release one of whose files has other bytes than its list states.
  madeReleases(served, ['1.0.1'], [key])
  const layer = join(served, '1.0.1', `player-${system}.tar.br`)
  const bytes = readFileSync(layer)
  bytes[bytes.length >> 1] ^= 1
  writeFileSync(layer, bytes)
  assert.equal(await codeOf(update()), 'T0026')
  assert.deepEqual(stateOf(home), { current: '1.0.0', previous: undefined, versions: ['1.0.0'] })
  // A release.json that has no signature at all.
  madeRelease(served, '1.0.1', { keys: [] })
  assert.equal(await codeOf(update()), 'T0026')
  assert.deepEqual(stateOf(home), { current: '1.0.0', previous: undefined, versions: ['1.0.0'] })
})

test('[41-4] an older releases.json that is rightly signed, and a release.json of another version than asked, are T0026 and change nothing', async (t) => {
  const folder = releaseFolderOf(t, 'older')
  const key = releaseKey()
  const served = join(folder, 'served')
  madeRelease(served, '1.0.1', { keys: [key] })
  madeReleases(served, ['1.0.1'], [key], 2_000_000)
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const releases = await releasesServer(t, served)
  const keys = [key.public]
  await updateInstall(home, { from: releases.address, keys, fetch: releases.fetch })
  assert.equal(stateOf(home).current, '1.0.1')
  // An older list, rightly signed, that offers an older version as the newest.
  madeRelease(served, '1.0.2', { keys: [key] })
  madeReleases(served, ['1.0.2'], [key], 1_000_000)
  assert.equal(await codeOf(updateInstall(home, { from: releases.address, keys, fetch: releases.fetch })), 'T0026')
  assert.equal(stateOf(home).current, '1.0.1')
  // A newer list, whose release.json names another version than the one asked for.
  madeReleases(served, ['1.0.2', '1.0.1'], [key], 3_000_000)
  madeRelease(served, '1.0.9', { keys: [key] })
  const other = readFileSync(join(served, '1.0.9', 'release.json'))
  writeFileSync(join(served, '1.0.2', 'release.json'), other)
  writeFileSync(join(served, '1.0.2', 'release.json.sig'), readFileSync(join(served, '1.0.9', 'release.json.sig')))
  assert.equal(await codeOf(updateInstall(home, { from: releases.address, keys, fetch: releases.fetch })), 'T0026')
  assert.deepEqual(stateOf(home), { current: '1.0.1', previous: '1.0.0', versions: ['1.0.0', '1.0.1'] })
})

test('[41-4] a kill in the middle of an update leaves the old version in use, and a second update at once waits and then finds nothing to do', async (t) => {
  const folder = releaseFolderOf(t, 'killed')
  const key = releaseKey()
  const served = join(folder, 'served')
  madeRelease(served, '1.0.1', { keys: [key], runtime: readFileSync(process.execPath) })
  madeReleases(served, ['1.0.1'], [key])
  const releases = await releasesServer(t, served)
  const keys = JSON.stringify([key.public])
  for (const seed of [41, 4, 1004]) {
    const home = join(folder, `home-${seed}`)
    installedFrom(home, '1.0.0', [key])
    const killed = await runKilled(join(import.meta.dirname, 'killed', 'update.ts'), {
      times: 1,
      within: 1500,
      seed,
      args: [home, releases.address, keys],
    })
    const [again] = killed.ended
    assert.equal(again.code, 0, again.out)
    // The version found in use after the kill lay whole, whichever it was.
    assert.match(again.out, /^found 1\.0\.[01] whole$/m)
    assert.match(again.out, /^updated 1\.0\.1$/m)
    assert.equal(stateOf(home).current, '1.0.1')
  }
  const home = join(folder, 'home-twice')
  installedFrom(home, '1.0.0', [key])
  const before = releases.asked.length
  const both = await Promise.all([
    updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch }),
    updateInstall(home, { from: releases.address, keys: [key.public], fetch: releases.fetch }),
  ])
  assert.deepEqual(both.map((one) => one.version).sort(), ['1.0.1', '1.0.1'])
  assert.deepEqual(both.map((one) => one.was).sort(), ['1.0.0', '1.0.1'])
  // The layers were fetched once: the second update found the version in place already.
  const layers = releases.asked.slice(before).filter((one) => one.endsWith('.tar.br'))
  assert.equal(layers.length, new Set(layers).size)
})

test('[41-4] a version that a program runs from is left, and removed by the next update', async (t) => {
  const folder = releaseFolderOf(t, 'running')
  const key = releaseKey()
  const served = join(folder, 'served')
  for (const version of ['1.0.1', '1.0.2']) madeRelease(served, version, { keys: [key] })
  madeReleases(served, ['1.0.1'], [key], 1)
  const home = join(folder, 'home')
  installedFrom(home, '0.9.0', [key])
  installedFrom(home, '1.0.0', [key])
  writeFileSync(join(home, 'previous'), '0.9.0\n')
  // A program of its own runs from 0.9.0, as the launcher marks it in `running/`.
  const program = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
  t.after(() => program.kill())
  mkdirSync(join(home, 'versions', '0.9.0', 'running'), { recursive: true })
  writeFileSync(join(home, 'versions', '0.9.0', 'running', String(program.pid)), '')
  const releases = await releasesServer(t, served)
  const keys = [key.public]
  await updateInstall(home, { from: releases.address, keys, fetch: releases.fetch })
  assert.deepEqual(stateOf(home).versions, ['0.9.0', '1.0.0', '1.0.1'])
  program.kill()
  await new Promise((done) => program.once('exit', done))
  madeReleases(served, ['1.0.2', '1.0.1'], [key], 2)
  await updateInstall(home, { from: releases.address, keys, fetch: releases.fetch })
  assert.deepEqual(stateOf(home), { current: '1.0.2', previous: '1.0.1', versions: ['1.0.1', '1.0.2'] })
  // With keep, nothing older is removed.
  madeRelease(served, '1.0.3', { keys: [key] })
  madeReleases(served, ['1.0.3', '1.0.2', '1.0.1'], [key], 3)
  await updateInstall(home, { keep: true, from: releases.address, keys, fetch: releases.fetch })
  assert.deepEqual(stateOf(home).versions, ['1.0.1', '1.0.2', '1.0.3'])
})

test('[41-4] a newer trust.json signed by a present key is taken; one signed by another key, and an older one, is not', async (t) => {
  const folder = releaseFolderOf(t, 'trust')
  const key = releaseKey()
  const next = releaseKey()
  const stranger = releaseKey()
  const served = join(folder, 'served')
  const home = join(folder, 'home')
  installedFrom(home, '1.0.0', [key])
  const releases = await releasesServer(t, served)
  const trustOf = (): string[] => JSON.parse(readFileSync(join(home, 'trust.json'), 'utf8')).keys
  // Signed by another key: not taken.
  madeRelease(served, '1.0.1', { keys: [key] })
  writeFileSync(
    join(served, '1.0.1', 'trust.json'),
    JSON.stringify({ format: 'tent.trust/1', made: 50, keys: [stranger.public] }),
  )
  madeReleases(served, ['1.0.1'], [key], 1)
  await updateInstall(home, { from: releases.address, keys: trustOf(), fetch: releases.fetch })
  assert.deepEqual(trustOf(), [key.public])
  // Signed by the present key, newer: taken, with the key that is put out gone.
  madeRelease(served, '1.0.2', { keys: [key], trust: { keys: [next.public], made: 100 } })
  madeReleases(served, ['1.0.2'], [key], 2)
  await updateInstall(home, { from: releases.address, keys: trustOf(), fetch: releases.fetch })
  assert.deepEqual(trustOf(), [next.public])
  // An older one, rightly signed by the key of the older list, served again: not taken.
  madeRelease(served, '1.0.3', { keys: [next], trust: { keys: [key.public], made: 1 } })
  madeReleases(served, ['1.0.3'], [next], 3)
  await updateInstall(home, { from: releases.address, keys: trustOf(), fetch: releases.fetch })
  assert.deepEqual(trustOf(), [next.public])
})
