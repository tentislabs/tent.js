import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Person, Released } from './released.ts'
import {
  npm,
  npmTent,
  outsideFolderOf,
  packedOf,
  personIn,
  ran,
  registryOf,
  released,
  servedFolder,
  thisSystem,
} from './released.ts'

const isWindows = process.platform === 'win32'

const modulesOf = (prefix: string): string =>
  isWindows ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')

let first: Released | undefined
const made = async (): Promise<Released> => {
  first ??= await released('1.0.0')
  return first
}

/** Installs tentjs for a person through npm with no optional parts, so that its launcher must repair it first. */
async function lacking(t: TestContext, rel: Released, person: Person): Promise<string> {
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const prefix = join(person.home, 'npm-global')
  const done = await npm(person, ['install', '-g', 'tentjs@1.0.0', '--prefix', prefix, '--omit=optional'], person.home)
  assert.equal(done.status, 0, done.err)
  // npm lays an optional package of a global install all the same: it is taken away, as such an install leaves it.
  for (const one of [
    join(modulesOf(prefix), 'tentjs', 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
    join(modulesOf(prefix), '@tentislabs', `tentjs-runtime-${thisSystem}`),
  ])
    rmSync(one, { recursive: true, force: true })
  return prefix
}

/** Types `tent new demo` in a folder of its own: where anything ran, the project lies there afterwards. */
async function typedNew(
  prefix: string,
  person: Person,
): Promise<{ status: number | null; said: string; work: string }> {
  const work = join(person.home, 'work')
  mkdirSync(work, { recursive: true })
  const done = await ran(npmTent(prefix), ['new', 'demo'], { cwd: work, env: person.env, shell: isWindows })
  return { status: done.status, said: `${done.out}${done.err}`.trim(), work }
}

test('[41-12.34] the repair handed a layer with other bytes than systems.json says throws it away, says so in one sentence, and runs nothing', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'repair-bytes'), { npm: true })
  const prefix = await lacking(t, rel, person)
  const listed = JSON.parse(readFileSync(join(modulesOf(prefix), 'tentjs', 'systems.json'), 'utf8'))
  const file = String(listed.systems[thisSystem].file)
  const changed = new Uint8Array(readFileSync(join(rel.folder, file)))
  changed[changed.length - 1] ^= 1
  const releases = await servedFolder(t, rel.out, { changed: { [`${rel.version}/${file}`]: changed } })
  person.env.TENT_RELEASES = releases.address
  const { status, said, work } = await typedNew(prefix, person)
  assert.equal(status, 2, said)
  assert.equal(said.split('\n').length, 1, said)
  assert.equal(existsSync(join(person.tent, 'versions', rel.version, 'runtime')), false, 'the layer was kept')
  assert.equal(existsSync(join(work, 'demo')), false, 'the command ran')
})

test('[41-12.34] the repair with no network says so in one sentence, keeps nothing, and runs nothing', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'repair-offline'), { npm: true })
  const prefix = await lacking(t, rel, person)
  const releases = await servedFolder(t, rel.out)
  await releases.close()
  person.env.TENT_RELEASES = releases.address
  const { status, said, work } = await typedNew(prefix, person)
  assert.equal(status, 2, said)
  assert.equal(said.split('\n').length, 1, said)
  assert.equal(existsSync(join(person.tent, 'versions')), false, 'something was kept')
  assert.equal(existsSync(join(work, 'demo')), false, 'the command ran')
})
