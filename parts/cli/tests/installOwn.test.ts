import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { outsideFolderOf, laidInstall, personIn, ran, released, servedFolder } from './released.ts'

test("[41-12] tent update and tent uninstall, typed in a folder that holds a node_modules/tentjs of another version, are the install's own: nothing of that folder runs", async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'install-own')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  // A tentjs of another version planted in the folder the commands are typed in, whose program leaves a mark where it runs.
  const typedIn = join(folder, 'planted')
  const planted = join(typedIn, 'node_modules', 'tentjs')
  const mark = join(folder, 'planted-ran')
  mkdirSync(join(planted, 'bin'), { recursive: true })
  writeFileSync(join(planted, 'package.json'), JSON.stringify({ name: 'tentjs', version: '9.9.9', type: 'module' }))
  writeFileSync(
    join(planted, 'bin', 'tent.js'),
    `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(mark)}, 'ran')\n`,
  )
  writeFileSync(join(typedIn, 'package.json'), JSON.stringify({ dependencies: { tentjs: '9.9.9' } }))
  // The place releases are served from offers no newer version: the install is updated to nothing newer.
  const served = await servedFolder(t, rel.out)
  const env = { ...person.env, TENT_RELEASES: served.address }
  const updated = await ran(launcher, ['update', '--json'], { cwd: typedIn, env })
  assert.equal(updated.status, 0, `${updated.out}${updated.err}`)
  assert.equal(JSON.parse(updated.out).ok, true, updated.out)
  assert.equal(readFileSync(join(person.tent, 'current'), 'utf8').trim(), rel.version)
  assert.equal(existsSync(mark), false, 'tent update ran nothing of the planted folder')
  // A no leaves the install as it was, and the answer is the install's own.
  const kept = await ran(launcher, ['uninstall', '--json'], { cwd: typedIn, env, input: 'no\n' })
  assert.equal(kept.status, 0, `${kept.out}${kept.err}`)
  assert.deepEqual(JSON.parse(kept.out), { ok: true, value: { removed: false }, findings: [] })
  assert.equal(existsSync(join(person.tent, 'current')), true)
  assert.equal(existsSync(mark), false, 'tent uninstall ran nothing of the planted folder')
})
