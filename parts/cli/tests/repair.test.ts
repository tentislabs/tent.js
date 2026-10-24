import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Person, Released } from './released.ts'
import {
  outsideFolderOf,
  npm,
  npmTent,
  packedOf,
  pageOf,
  personIn,
  ran,
  registryOf,
  released,
  servedFolder,
  startedIn,
  thisSystem,
} from './released.ts'
import { freePort } from './secured.ts'

const modulesOf = (prefix: string): string =>
  process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')

let first: Released | undefined
const made = async (): Promise<Released> => {
  first ??= await released('1.0.0')
  return first
}

const isWindows = process.platform === 'win32'

/** Installs tentjs for a person through npm, with the words it is handed, and answers the folder npm installed into. */
async function installed(t: TestContext, rel: Released, person: Person, words: string[]) {
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const prefix = join(person.home, 'npm-global')
  const done = await npm(person, ['install', '-g', 'tentjs@1.0.0', '--prefix', prefix, ...words], person.home)
  assert.equal(done.status, 0, done.err)
  // npm lays an optional package of a global install all the same: it is taken away, as an install that left out
  // its optional parts leaves the folder.
  if (words.includes('--omit=optional'))
    for (const one of systemPackagesIn(prefix)) rmSync(one, { recursive: true, force: true })
  return prefix
}

/** Every place npm may lay the package of this system in, under a folder of packages. */
const systemPackagesIn = (prefix: string): string[] => [
  join(modulesOf(prefix), 'tentjs', 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
  join(modulesOf(prefix), '@tentislabs', `tentjs-runtime-${thisSystem}`),
]

/** The folder of the package of this system that npm laid, wherever it laid it. */
const systemPackageOf = (prefix: string): string | undefined =>
  [
    join(modulesOf(prefix), 'tentjs', 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
    join(modulesOf(prefix), '@tentislabs', `tentjs-runtime-${thisSystem}`),
  ].find((one) => existsSync(one))

/** `tent` of an npm install, typed by a person. */
const tentOf =
  (prefix: string, person: Person) =>
  (words: string[], cwd: string): ReturnType<typeof ran> =>
    ran(npmTent(prefix), words, { cwd, env: person.env, shell: isWindows })

/** Makes a project with `tent new` and answers the page that `tent dev` shows at its root. */
async function worksIn(t: TestContext, prefix: string, person: Person): Promise<void> {
  const work = join(person.home, 'work')
  mkdirSync(work, { recursive: true })
  const made = await tentOf(prefix, person)(['new', 'demo'], work)
  assert.equal(made.status, 0, `${made.out}${made.err}`)
  // A port handed free, since another program of this computer may hold the usual one at the moment of its start.
  const port = String(await freePort())
  const dev = startedIn(t, npmTent(prefix), ['dev', '--port', port], {
    cwd: join(work, 'demo'),
    env: person.env,
    shell: isWindows,
  })
  const page = await pageOf(dev, join(work, 'demo'))
  assert.equal(page.status, 200)
}

test('[41-2] an install without optional parts is repaired: the layer of this system is fetched, held to systems.json, laid into versions/ of the install, and tent dev works', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'no-optional'), { npm: true })
  const prefix = await installed(t, rel, person, ['--omit=optional'])
  assert.equal(systemPackageOf(prefix), undefined)
  const releases = await servedFolder(t, rel.out)
  person.env.TENT_RELEASES = releases.address
  await worksIn(t, prefix, person)
  // The repair laid what differs by system into the install's own folder, and never into npm's.
  assert.equal(existsSync(join(person.tent, 'versions', rel.version, 'runtime')), true)
  assert.equal(systemPackageOf(prefix), undefined)
})

test('[41-2] a folder copied from another system, where only the package of that system lies, is repaired', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'copied'), { npm: true })
  const prefix = await installed(t, rel, person, [])
  const own = systemPackageOf(prefix)
  assert.ok(own)
  // The package of this system is put in the place of another system's, as a copy from Windows to Linux leaves it.
  const other = thisSystem === 'linux-x64' ? 'win32-x64' : 'linux-x64'
  renameSync(own, own.replace(`runtime-${thisSystem}`, `runtime-${other}`))
  const releases = await servedFolder(t, rel.out)
  person.env.TENT_RELEASES = releases.address
  await worksIn(t, prefix, person)
  assert.equal(existsSync(join(person.tent, 'versions', rel.version, 'runtime')), true)
})

test("[41-2] a lock file made on another system leaves out this system's package, and the project's own tent is repaired", async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'lock-elsewhere'), { npm: true })
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const project = join(person.home, 'project')
  mkdirSync(project)
  writeFileSync(
    join(project, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', {})\n",
  )
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify({ name: 'shop', private: true, type: 'module', dependencies: { tentjs: '1.0.0' } }, null, 2)}\n`,
  )
  const laid = await npm(person, ['install'], project)
  assert.equal(laid.status, 0, laid.err)
  // A lock that another system made lays no package of this system (npm's own issue 4828): the project's folder of
  // packages is left as such a lock leaves it.
  for (const one of [
    join(project, 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
    join(project, 'node_modules', 'tentjs', 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
  ])
    rmSync(one, { recursive: true, force: true })
  const releases = await servedFolder(t, rel.out)
  person.env.TENT_RELEASES = releases.address
  const own = join(project, 'node_modules', '.bin', isWindows ? 'tent.cmd' : 'tent')
  const built = await ran(own, ['build'], { cwd: project, env: person.env, shell: isWindows })
  assert.equal(built.status, 0, `${built.out}${built.err}`)
  assert.equal(existsSync(join(project, '.tent', 'build')), true)
})

test('[41-2] with no network after an install that lacks its part, the launcher ends in one plain sentence and runs nothing', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'no-network'), { npm: true })
  const prefix = await installed(t, rel, person, ['--omit=optional'])
  const releases = await servedFolder(t, rel.out)
  await releases.close()
  person.env.TENT_RELEASES = releases.address
  const done = await tentOf(prefix, person)(['--help'], person.home)
  assert.equal(done.status, 2)
  const said = `${done.out}${done.err}`.trim()
  // One sentence, which says what is missing and how to fetch it.
  assert.equal(said.split('\n').length, 1, said)
  assert.match(said, new RegExp(`runtime-${thisSystem}|${thisSystem}`))
  assert.match(said, /network|reach/i)
  assert.equal(existsSync(join(person.tent, 'versions')), false)
})

test('[41-2] a layer whose bytes are not those of systems.json is thrown away', async (t) => {
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'other-bytes'), { npm: true })
  const prefix = await installed(t, rel, person, ['--omit=optional'])
  const listed = JSON.parse(readFileSync(join(modulesOf(prefix), 'tentjs', 'systems.json'), 'utf8'))
  const file = String(listed.systems[thisSystem].file)
  const real = readFileSync(join(rel.folder, file))
  const changed = new Uint8Array(real)
  changed[changed.length >> 1] ^= 1
  const releases = await servedFolder(t, rel.out, { changed: { [`${rel.version}/${file}`]: changed } })
  person.env.TENT_RELEASES = releases.address
  const done = await tentOf(prefix, person)(['--help'], person.home)
  assert.equal(done.status, 2)
  assert.match(`${done.out}${done.err}`, /systems\.json|fingerprint/)
  // Nothing of it was kept, and nothing ran.
  assert.equal(existsSync(join(person.tent, 'versions', rel.version, 'runtime')), false)
})
