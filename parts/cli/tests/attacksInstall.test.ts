import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { keepPublishKey } from '../../connect/index.ts'
import { keptAlone } from '../../engine/index.ts'
import { outsideFolderOf, laidInstall, personIn, ran, released, servedFolder, thisSystem } from './released.ts'

// The launcher of this system says why it runs nothing in a sentence of its own, and the player starts nothing.
const marked = (folder: string): string => join(folder, 'ran.txt')

/** The player of an install written to leave a mark when it runs, so that a test sees that it never ran. */
function playerMarked(home: string, version: string, folder: string): void {
  writeFileSync(
    join(home, 'versions', version, 'player', 'tent.mjs'),
    `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marked(folder))}, 'ran')\n`,
  )
}

test('[41-12.8] keys.json of the install, as tent login keeps a key in it, cannot be read by another user of the computer, also where the file it replaces could', (t) => {
  const person = personIn(outsideFolderOf(t, 'attack-keys'), { npm: false })
  mkdirSync(person.tent, { recursive: true })
  const file = join(person.tent, 'keys.json')
  // A file that stood there open to every user, as a person may have copied one in.
  writeFileSync(file, '{"format":"tent.keys/1","servers":{}}', { mode: 0o644 })
  if (process.platform === 'win32')
    spawnSync('icacls', [file, '/grant', '*S-1-1-0:(R)', '/q'], { stdio: 'ignore', windowsHide: true })
  else spawnSync('chmod', ['644', file])
  assert.notEqual(keptAlone(file).why, undefined, 'the planted file is open to the others')
  keepPublishKey(person.tent, 'https://server.test', 'tent_the_key_of_publishing', 'live')
  assert.equal(keptAlone(file).why, undefined)
  assert.match(readFileSync(file, 'utf8'), /tent_the_key_of_publishing/)
})

/** Grants every user of the computer the right to write into a folder. */
function openToAll(folder: string): void {
  if (process.platform === 'win32')
    spawnSync('icacls', [folder, '/grant', '*S-1-1-0:(OI)(CI)M', '/q'], { stdio: 'ignore', windowsHide: true })
  else spawnSync('chmod', ['o+w', folder])
}

test('[41-12.12] a copy of the releases named by TENT_RELEASES that serves a layer we did not sign is T0026, and the install is as it was', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'attack-copy')
  const person = personIn(folder, { npm: false })
  // An install of an older version, which the copy's list offers the newer one to.
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  renameSync(join(person.tent, 'versions', rel.version), join(person.tent, 'versions', '0.9.0'))
  writeFileSync(join(person.tent, 'current'), '0.9.0\n')
  const copy = join(folder, 'copy')
  cpSync(rel.out, copy, { recursive: true })
  // The copy serves a player that is not ours, beside our signed lists.
  const layer = `${rel.version}/player-${thisSystem}.tar.br`
  const bytes = readFileSync(join(copy, layer))
  bytes[bytes.length >> 1] ^= 1
  const served = await servedFolder(t, copy, { changed: { [layer]: bytes } })
  const env = { ...person.env, TENT_RELEASES: served.address }
  const done = await ran(launcher, ['update', '--json'], { cwd: person.home, env })
  assert.notEqual(done.status, 0, `${done.out}${done.err}`)
  assert.equal(JSON.parse(done.out).findings[0].code, 'T0026')
  assert.equal(readFileSync(join(person.tent, 'current'), 'utf8').trim(), '0.9.0')
  assert.deepEqual(readdirSync(join(person.tent, 'versions')), ['0.9.0'])
})

test('[41-12.12] the same copy serving its own install.sh: what the script unpacked is checked against our signature at once, and removed', {
  todo: process.platform === 'linux' ? false : 'install.sh is the installer of Linux: owed to the run on Linux',
}, async (t) => {
  assert.equal(process.platform, 'linux', 'the installer of Linux runs on Linux')
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'attack-script')
  const person = personIn(folder, { npm: false })
  const copy = join(folder, 'copy')
  cpSync(rel.out, copy, { recursive: true })
  // The copy packs each archive of the player anew with a file of its own in it, and writes the fingerprint of each
  // into the script it serves, in place of ours. The release writes the script beside its archives.
  const at = join(copy, rel.version)
  const printOf = (file: string): string =>
    spawnSync('sha256sum', [file], { encoding: 'utf8' }).stdout.split(' ')[0] ?? ''
  const archives = readdirSync(at).filter((one) => new RegExp(`^tent-${rel.version}-.*\\.tar\\.(xz|gz)$`).test(one))
  assert.ok(archives.length > 0, 'the release holds the archives of Linux')
  let script = readFileSync(join(at, 'install.sh'), 'utf8')
  for (const archive of archives) {
    const file = join(at, archive)
    const was = printOf(file)
    const unpacked = join(folder, `unpacked-${archive}`)
    mkdirSync(unpacked)
    spawnSync('tar', ['-xf', file, '-C', unpacked])
    writeFileSync(join(unpacked, 'player', 'planted.txt'), 'not ours')
    spawnSync('tar', [archive.endsWith('xz') ? '-cJf' : '-czf', file, '-C', unpacked, '.'])
    script = script.replaceAll(was, printOf(file))
  }
  writeFileSync(join(at, 'install.sh'), script)
  const served = await servedFolder(t, copy)
  const env = { ...person.env, TENT_RELEASES: served.address }
  const installedNow = await ran('sh', [join(at, 'install.sh'), '--no-path'], { cwd: person.home, env })
  assert.notEqual(installedNow.status, 0, installedNow.out)
  assert.match(`${installedNow.out}${installedNow.err}`, /T0026/)
  assert.equal(existsSync(join(person.tent, 'versions', rel.version)), false)
})

test('[41-12.18] the launcher runs nothing from a folder that others can write: versions/, the version, its runtime and its player', async (t) => {
  const rel = await released('1.0.0')
  for (const inside of ['versions', `versions/${rel.version}`, `versions/${rel.version}/player`]) {
    const folder = outsideFolderOf(t, `attack-open-${inside.split('/').length}`)
    const person = personIn(folder, { npm: false })
    const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
    playerMarked(person.tent, rel.version, folder)
    openToAll(join(person.tent, ...inside.split('/')))
    const done = await ran(launcher, ['--help'], { cwd: person.home, env: person.env })
    assert.equal(done.status, 2, inside)
    assert.match(`${done.out}${done.err}`, /runs nothing from/, inside)
    assert.equal(existsSync(marked(folder)), false, inside)
  }
})

test('[41-12.18] the launcher of macOS and Linux runs nothing from a folder that its group can write, whatever the group', {
  todo: process.platform === 'win32' ? 'the bits of a group are those of macOS and Linux: owed to them' : false,
}, async (t) => {
  assert.notEqual(process.platform, 'win32', 'the launcher of macOS and Linux runs there')
  const rel = await released('1.0.0')
  for (const inside of ['', 'versions', `versions/${rel.version}`, `versions/${rel.version}/runtime`]) {
    const folder = outsideFolderOf(t, `attack-group-${inside.split('/').length}`)
    const person = personIn(folder, { npm: false })
    const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
    playerMarked(person.tent, rel.version, folder)
    // The person's own group: on macOS that is `staff`, which every person of the computer is in.
    spawnSync('chmod', ['g+w', join(person.tent, ...inside.split('/').filter(Boolean))])
    const done = await ran(launcher, ['--help'], { cwd: person.home, env: person.env })
    assert.equal(done.status, 2, inside)
    assert.match(`${done.out}${done.err}`, /runs nothing from/, inside)
    assert.equal(existsSync(marked(folder)), false, inside)
  }
})

test('[41-12.18] the installer writes only into a folder that the current user owns: a folder of the install made a link beforehand is refused', {
  todo:
    process.platform === 'linux'
      ? false
      : 'the installer of Linux is held here; the Windows installer and the macOS package are owed to the release of the installers',
}, async (t) => {
  assert.equal(process.platform, 'linux', 'the installer of Linux runs on Linux')
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'attack-link')
  const person = personIn(folder, { npm: false })
  const elsewhere = join(folder, 'elsewhere')
  mkdirSync(elsewhere)
  spawnSync('ln', ['-s', elsewhere, person.tent])
  const served = await servedFolder(t, rel.out)
  const env = { ...person.env, TENT_RELEASES: served.address }
  const done = await ran('sh', [join(rel.folder, 'install.sh'), '--no-path'], { cwd: person.home, env })
  assert.equal(done.status, 2)
  assert.match(done.err, /is a link/)
  assert.deepEqual(readdirSync(elsewhere), [])
})
