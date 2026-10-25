import assert from 'node:assert/strict'
import { chmodSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Person, Released } from './released.ts'
import {
  npm,
  npmOpenToGroup,
  outsideFolderOf,
  packedOf,
  personIn,
  ran,
  registryOf,
  released,
  thisSystem,
} from './released.ts'

/** The folder npm installs into for a person, with `-g` and `--prefix`, and where it puts the packages. */
const modulesOf = (prefix: string): string =>
  process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')

/** The folder of the package of this system, which the launcher runs the runtime from. */
const systemFolderOf = (prefix: string): string => {
  const places = [
    join(modulesOf(prefix), 'tentjs', 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
    join(modulesOf(prefix), '@tentislabs', `tentjs-runtime-${thisSystem}`),
  ]
  const found = places.find((one) => existsSync(one))
  assert.ok(found, 'the package of this system lies beside tentjs')
  return found
}

let first: Released | undefined
const made = async (): Promise<Released> => {
  first ??= await released('1.0.0')
  return first
}

/**
 * Installs tentjs from a registry of this computer into a prefix of the person, and answers the prefix: with `open`,
 * as a person whose umask leaves every folder open to its group.
 */
async function installed(t: TestContext, person: Person, rel: Released, open = false): Promise<string> {
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const prefix = join(person.home, 'npm-global')
  const words = ['install', '-g', 'tentjs@1.0.0', '--prefix', prefix]
  const done = await (open ? npmOpenToGroup : npm)(person, words, person.home)
  assert.equal(done.status, 0, done.err)
  return prefix
}

// npm adds its umask to the umask of the process and never loosens it, so the test of the row installs as a person
// whose own umask is 0002: only then does it meet a folder its group may write.
test('[41-12.18] review: an install as a person whose umask is 0002, as the test of the row makes it, lays the folder of the package of this system open to its group', async (t) => {
  // The bits of a group are those of macOS and Linux: on Windows there is none to lay open.
  if (process.platform === 'win32') return
  const rel = await made()
  const person = personIn(outsideFolderOf(t, 'review-umask'), { npm: true })
  const prefix = await installed(t, person, rel, true)
  const mode = statSync(systemFolderOf(prefix)).mode & 0o777
  assert.notEqual(
    mode & 0o020,
    0,
    `the folder the launcher checks is ${mode.toString(8)}, so its group bit is never met`,
  )
})

// The private group is found by the first line of /etc/group with its id; a second name of the same id may hold others.
const twinGroup = `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const real = fs.readFileSync
fs.readFileSync = function (file, ...rest) {
  const text = real.call(this, file, ...rest)
  return file === '/etc/group' && process.env.REVIEW_TWIN ? text + '\\n' + process.env.REVIEW_TWIN + '\\n' : text
}
syncBuiltinESMExports()
`

test('[41-12.18] review: the launcher runs from no folder its group may write where a second line of /etc/group names that group id with another person in it', {
  todo: process.platform === 'linux' ? false : 'the private group of a person is that of Linux: owed to it',
}, async (t) => {
  assert.equal(process.platform, 'linux', 'the rule of a private group holds on Linux')
  const rel = await made()
  const folder = outsideFolderOf(t, 'review-twin')
  const person = personIn(folder, { npm: true })
  const prefix = await installed(t, person, rel)
  const system = systemFolderOf(prefix)
  chmodSync(system, 0o775)
  const gid = statSync(system).gid
  assert.equal(gid, process.getgid?.(), 'the folder is of the group of the person, the one the rule passes')
  const preload = join(folder, 'twin.mjs')
  writeFileSync(preload, twinGroup)
  const launcher = join(modulesOf(prefix), 'tentjs', 'bin', 'tent.js')
  const asked = (twin: string) =>
    ran(process.execPath, [`--import=${preload}`, launcher, '--version'], {
      cwd: person.home,
      env: { ...person.env, ...(twin ? { REVIEW_TWIN: twin } : {}) },
    })
  const alone = await asked('')
  assert.equal(alone.status, 0, `the group of the person alone passes: ${alone.out}${alone.err}`)
  const shared = await asked(`twin:x:${gid}:someone-else`)
  assert.equal(
    shared.status,
    2,
    `a group id that /etc/group also gives someone-else passes: ${shared.out}${shared.err}`,
  )
  assert.match(shared.err, /runs nothing from/)
})
