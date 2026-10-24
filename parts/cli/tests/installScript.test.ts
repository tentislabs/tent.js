import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { outsideFolderOf, personIn, ran, released, servedFolder } from './released.ts'

// The installer of Linux is a script of the shell of Linux: these tests are of that system, and owed elsewhere.
const ofLinux = {
  todo: process.platform === 'linux' ? false : 'install.sh is the installer of Linux: owed to the run on Linux',
}

test(
  '[41-12.18] the installer writes only into a folder that the current user owns: a versions/ that others can write into is refused',
  ofLinux,
  async (t) => {
    assert.equal(process.platform, 'linux', 'the installer of Linux runs on Linux')
    const rel = await released('1.0.0')
    const folder = outsideFolderOf(t, 'script-open')
    const person = personIn(folder, { npm: false })
    mkdirSync(join(person.tent, 'versions'), { recursive: true })
    spawnSync('chmod', ['g+w', join(person.tent, 'versions')])
    const served = await servedFolder(t, rel.out)
    const env = { ...person.env, TENT_RELEASES: served.address }
    const done = await ran('sh', [join(rel.folder, 'install.sh'), '--no-path'], { cwd: person.home, env })
    assert.equal(done.status, 2, `${done.out}${done.err}`)
    assert.match(done.err, /versions is not your own folder, or others can write into it/)
    assert.equal(existsSync(join(person.tent, 'current')), false)
  },
)

test(
  '[41-12.45] an installer over an install leaves the keys it holds: a list of the release that is older brings no key back',
  ofLinux,
  async (t) => {
    assert.equal(process.platform, 'linux', 'the installer of Linux runs on Linux')
    const rel = await released('1.0.0')
    const folder = outsideFolderOf(t, 'script-trust')
    const person = personIn(folder, { npm: false })
    const served = await servedFolder(t, rel.out)
    const env = { ...person.env, TENT_RELEASES: served.address }
    const first = await ran('sh', [join(rel.folder, 'install.sh'), '--no-path'], { cwd: person.home, env })
    assert.equal(first.status, 0, `${first.out}${first.err}`)
    // A later release made the list newer: the install holds that one, with the same keys and a newer `made`.
    const file = join(person.tent, 'trust.json')
    const held = JSON.parse(readFileSync(file, 'utf8'))
    const newer = `${JSON.stringify({ ...held, made: Number(held.made) + 1000 })}\n`
    writeFileSync(file, newer)
    const again = await ran('sh', [join(rel.folder, 'install.sh'), '--no-path'], { cwd: person.home, env })
    assert.equal(again.status, 0, `${again.out}${again.err}`)
    assert.equal(readFileSync(file, 'utf8'), newer)
  },
)

test('[41-1] a release made with no xz installs with gzip, also on a computer that has xz', ofLinux, async (t) => {
  assert.equal(process.platform, 'linux', 'the installer of Linux runs on Linux')
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'script-gzip')
  const person = personIn(folder, { npm: false })
  // The script of a release made on a computer with no xz holds no fingerprint of an archive packed with xz.
  const script = readFileSync(join(rel.folder, 'install.sh'), 'utf8')
    .split('\n')
    .filter((line) => !line.includes(".tar.xz')"))
    .join('\n')
  const gzipOnly = join(folder, 'install.sh')
  writeFileSync(gzipOnly, script)
  const served = await servedFolder(t, rel.out)
  const env = { ...person.env, TENT_RELEASES: served.address }
  const done = await ran('sh', [gzipOnly, '--no-path'], { cwd: person.home, env })
  assert.equal(done.status, 0, `${done.out}${done.err}`)
  assert.equal(readFileSync(join(person.tent, 'current'), 'utf8').trim(), rel.version)
})
