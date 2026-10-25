import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { measure } from '../../../rig/budgets.ts'
import type { Person, Released } from './released.ts'
import {
  laidInstall,
  launcherIn,
  npm,
  npmOpenToGroup,
  npmTent,
  outsideFolderOf,
  packedOf,
  pageOf,
  personIn,
  ran,
  registryOf,
  released,
  servedFolder,
  startedIn,
  thisSystem,
  until,
} from './released.ts'

/** The folder npm installs into for a person, with `-g` and `--prefix`, and where it puts the packages. */
const modulesOf = (prefix: string): string =>
  process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')

/** Runs `tent` of an npm install with words, as a person types it, in a folder. */
const tentOf =
  (prefix: string, person: Person) =>
  (words: string[], cwd: string, input?: string): ReturnType<typeof ran> =>
    ran(npmTent(prefix), words, {
      cwd,
      env: person.env,
      shell: process.platform === 'win32',
      ...(input ? { input } : {}),
    })

let first: Released | undefined
const made = async (): Promise<Released> => {
  first ??= await released('1.0.0')
  return first
}

test("[41-1] the npm door installs tentjs with the package of this system, and tent new and tent dev show a working page, with nothing written outside the person's own folders", async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'npm-door')
  const person = personIn(folder, { npm: true })
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const prefix = join(person.home, 'npm-global')
  const installed = await npm(person, ['install', '-g', 'tentjs@1.0.0', '--prefix', prefix], person.home)
  assert.equal(installed.status, 0, installed.err)
  // The package holds the code, and the package of this system holds what differs by system: npm resolved nothing of ours.
  const holds = join(modulesOf(prefix), 'tentjs')
  assert.equal(existsSync(join(holds, 'player', 'tent.mjs')), true)
  assert.equal(existsSync(join(holds, 'tools')), true)
  assert.equal(existsSync(join(holds, 'systems.json')), true)
  const own = [
    join(holds, 'node_modules', '@tentislabs', `tentjs-runtime-${thisSystem}`),
    join(modulesOf(prefix), '@tentislabs', `tentjs-runtime-${thisSystem}`),
  ]
  assert.equal(
    own.some((one) => existsSync(one)),
    true,
    'the package of this system lies beside tentjs',
  )
  const tent = tentOf(prefix, person)
  const work = join(person.home, 'work')
  mkdirSync(work)
  const fresh = await tent(['new', 'demo', '--json'], work)
  assert.equal(fresh.status, 0, `${fresh.out}${fresh.err}`)
  // The project names the version that made it, and that version is installed into it by the npm at hand.
  const about = JSON.parse(readFileSync(join(work, 'demo', 'package.json'), 'utf8'))
  assert.equal(about.dependencies.tentjs, '1.0.0')
  assert.equal(existsSync(join(work, 'demo', 'node_modules', 'tentjs', 'package.json')), true)
  // The check of the new project, with a test of its own as most projects hold, finds nothing: its type check reads
  // the framework's own code through `tentjs/test`, borrowed parts among it.
  mkdirSync(join(work, 'demo', 'tests'), { recursive: true })
  writeFileSync(
    join(work, 'demo', 'tests', 'home.test.ts'),
    "import test from 'node:test'\nimport { testApp } from 'tentjs/test'\n\ntest('the app opens', async (t) => {\n  const app = await testApp()\n  t.after(() => app.close())\n})\n",
  )
  const checked = await tent(['check', '--json'], join(work, 'demo'))
  assert.equal(checked.status, 0, `${checked.out}${checked.err}`)
  assert.deepEqual(JSON.parse(checked.out).findings, [], checked.out)
  const dev = startedIn(t, npmTent(prefix), ['dev'], {
    cwd: join(work, 'demo'),
    env: person.env,
    shell: process.platform === 'win32',
  })
  const page = await pageOf(dev, join(work, 'demo'))
  assert.equal(page.status, 200)
  assert.match(page.text, /<html/)
  assert.match(page.text, /<title>Demo<\/title>/)
  // Under the npm door the install's own folder holds no release: the package of this system was there.
  assert.equal(existsSync(join(person.tent, 'versions')), false)
  // Everything that was written lies in the person's own folders.
  const outside = readdirSync(folder).filter((one) => one !== 'person')
  assert.deepEqual(outside, [])
})

test('[41-12.18] under the npm door with a umask of 0002, the launcher runs from folders its group may write where that group is the person alone, as on Linux, and from none where others share it, as staff on macOS', {
  todo: process.platform === 'win32' ? 'the bits of a group are those of macOS and Linux: owed to them' : false,
}, async (t) => {
  assert.notEqual(process.platform, 'win32', 'the launcher of macOS and Linux runs there')
  const rel = await made()
  const folder = outsideFolderOf(t, 'npm-umask')
  const person = personIn(folder, { npm: true })
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  // npm lays every folder open to its group, as Ubuntu's default umask has it.
  const prefix = join(person.home, 'npm-global')
  const installed = await npmOpenToGroup(person, ['install', '-g', 'tentjs@1.0.0', '--prefix', prefix], person.home)
  assert.equal(installed.status, 0, installed.err)
  const asked = await tentOf(prefix, person)(['--version'], person.home)
  if (process.platform === 'linux') {
    assert.equal(asked.status, 0, `${asked.out}${asked.err}`)
    assert.equal(asked.out.trim(), rel.version)
  } else {
    assert.equal(asked.status, 2, `${asked.out}${asked.err}`)
    assert.match(asked.err, /runs nothing from/)
  }
})

test('[41-1] the direct door: the installer of this system puts the release into TENT_HOME, writes current and bin/, and puts bin/ on the path', {
  todo:
    process.platform === 'win32'
      ? 'The Windows installer is made with the WiX tools, which this computer has not: owed to the release of the installers'
      : process.platform === 'darwin'
        ? 'The macOS package is proven on a Mac: owed to the release of the installers'
        : false,
}, async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'direct-door')
  const person = personIn(folder, { npm: false })
  if (process.platform === 'win32') {
    const msi = join(rel.folder, `tent-${rel.version}-${thisSystem}.msi`)
    assert.equal(existsSync(msi), true, 'the release made the Windows installer')
    const log = join(folder, 'msi.log')
    const done = await ran('msiexec', ['/i', msi, '/qn', `TENTHOME=${person.tent}`, '/l*v', log], {
      cwd: folder,
      env: person.env,
    })
    assert.equal(done.status, 0, done.err)
    t.after(async () => void (await ran('msiexec', ['/x', msi, '/qn'], { cwd: folder, env: person.env })))
  } else if (process.platform === 'darwin') {
    const pkg = join(rel.folder, `tent-${rel.version}-${thisSystem}.pkg`)
    const done = await ran('installer', ['-pkg', pkg, '-target', 'CurrentUserHomeDirectory'], {
      cwd: folder,
      env: person.env,
    })
    assert.equal(done.status, 0, done.err)
  } else {
    const releases = await servedFolder(t, rel.out)
    const done = await ran('sh', [join(rel.folder, 'install.sh')], {
      cwd: folder,
      env: { ...person.env, TENT_RELEASES: releases.address },
    })
    assert.equal(done.status, 0, `${done.out}${done.err}`)
  }
  assert.equal(readFileSync(join(person.tent, 'current'), 'utf8').trim(), rel.version)
  assert.equal(existsSync(join(person.tent, 'versions', rel.version, 'player', 'tent.mjs')), true)
  assert.equal(existsSync(launcherIn(person.tent)), true)
  const help = await ran(launcherIn(person.tent), ['--help'], { cwd: person.home, env: person.env })
  assert.equal(help.status, 0, help.err)
  if (process.platform !== 'win32') {
    // A marked line in each start file of the shells it finds puts bin/ on the path.
    const started = ['.bashrc', '.profile', '.zshrc', '.zprofile', '.bash_profile']
      .map((one) => join(person.home, one))
      .filter((one) => existsSync(one))
    assert.ok(started.length > 0)
    for (const one of started) assert.match(readFileSync(one, 'utf8'), /# tent\.js[\s\S]*tent-home[\\/]bin/)
  }
})

test('[41-1] a command of the build tools in an install of the player alone ends with 2 and names tent update --build-tools', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'player-only')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const project = join(person.home, 'project')
  mkdirSync(project)
  writeFileSync(
    join(project, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', {})\n",
  )
  for (const words of [
    ['build'],
    ['check'],
    ['dev'],
    ['new', 'other'],
    ['python', 'lock'],
    ['api', 'read', 'x.json'],
  ]) {
    const done = await ran(launcher, words, { cwd: project, env: person.env })
    assert.equal(done.status, 2, `tent ${words.join(' ')}: ${done.out}${done.err}`)
    assert.match(`${done.out}${done.err}`, /tent update --build-tools/)
  }
  // A command of the player works there.
  const help = await ran(launcher, ['--help'], { cwd: project, env: person.env })
  assert.equal(help.status, 0, `${help.out}${help.err}`)
})

test('[41-1] a project that names another version than current is built by its own version, and one that names a version it does not hold is told to run npm install', async (t) => {
  const rel = await made()
  const newer = await released('1.0.1')
  const folder = outsideFolderOf(t, 'own-version')
  const person = personIn(folder, { npm: true })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player', 'tools'])
  const registry = await registryOf(t, [...packedOf(rel), ...packedOf(newer)])
  person.env.npm_config_registry = registry.address
  const project = join(person.home, 'project')
  mkdirSync(project)
  writeFileSync(
    join(project, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', {})\n",
  )
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify({ name: 'shop', private: true, type: 'module', dependencies: { tentjs: '1.0.1' } }, null, 2)}\n`,
  )
  // Before the project holds its version, the launcher does not build it by another.
  const unheld = await ran(launcher, ['build'], { cwd: project, env: person.env })
  assert.equal(unheld.status, 2, `${unheld.out}${unheld.err}`)
  assert.match(`${unheld.out}${unheld.err}`, /npm install/)
  const installed = await npm(person, ['install'], project)
  assert.equal(installed.status, 0, installed.err)
  const built = await ran(launcher, ['build'], { cwd: project, env: person.env })
  assert.equal(built.status, 0, `${built.out}${built.err}`)
  assert.match(built.err, /tentjs 1\.0\.1/)
  assert.equal(existsSync(join(project, '.tent', 'build')), true)
  // A command that works on no project is the install's own.
  const help = await ran(launcher, ['--help'], { cwd: project, env: person.env })
  assert.doesNotMatch(help.err, /tentjs 1\.0\.1/)
})

test('[41-1] a program of a project that holds tentjs finds every entry of the framework in it, as the docs name them, and runs an engine of its own', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'program-entries')
  const person = personIn(folder, { npm: true })
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const project = join(person.home, 'project')
  mkdirSync(project)
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify({ name: 'shop', private: true, type: 'module', dependencies: { tentjs: '1.0.0' } }, null, 2)}\n`,
  )
  const installed = await npm(person, ['install'], project)
  assert.equal(installed.status, 0, installed.err)
  const names = Object.keys(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'entries.json'), 'utf8')))
  writeFileSync(
    join(project, 'program.mjs'),
    `import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { guardedFetch } from 'tentjs/connect'
import { createEngine } from 'tentjs/engine'

for (const name of ${JSON.stringify(names)}) if (!existsSync(fileURLToPath(import.meta.resolve(name)))) throw new Error(name)
const engine = createEngine({ port: 0 })
await engine.close()
console.log([guardedFetch, createEngine].map((one) => typeof one).join(' '))
`,
  )
  const program = await ran(process.execPath, ['program.mjs'], { cwd: project, env: person.env })
  assert.equal(program.status, 0, `${program.out}${program.err}`)
  assert.equal(program.out.trim(), 'function function')
})

/** The lines of the path of the current user of Windows, as the system keeps them, or of the start files elsewhere. */
function pathOfUser(): string {
  const read = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', 'Path'], { encoding: 'utf8' })
  return read.status === 0 ? read.stdout : ''
}

/** Puts a folder on the path of the current user of Windows, as the installer does, and takes the path back after the test. */
function onPathOfUser(t: TestContext, bin: string): void {
  const before = /Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/.exec(pathOfUser())?.[1]?.trim()
  const set = (value: string | undefined): void => {
    const words =
      value === undefined
        ? ['delete', 'HKCU\\Environment', '/v', 'Path', '/f']
        : ['add', 'HKCU\\Environment', '/v', 'Path', '/t', 'REG_EXPAND_SZ', '/d', value, '/f']
    spawnSync('reg', words, { encoding: 'utf8' })
  }
  set(before ? `${before};${bin}` : bin)
  t.after(() => {
    if (pathOfUser().includes(bin)) set(before)
  })
}

test('[41-1] tent uninstall asks first, and leaves no file and no path line behind', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'uninstall')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const bin = join(person.tent, 'bin')
  if (process.platform === 'win32') onPathOfUser(t, bin)
  else
    for (const one of ['.bashrc', '.profile'])
      writeFileSync(join(person.home, one), `export X=1\n# tent.js\nexport PATH="${bin}:$PATH"\n`)
  // A no leaves everything as it was.
  const no = await ran(launcher, ['uninstall'], { cwd: person.home, env: person.env, input: 'no\n' })
  assert.match(`${no.out}${no.err}`, /Remove it\?/)
  assert.equal(existsSync(join(person.tent, 'current')), true)
  const yes = await ran(launcher, ['uninstall'], { cwd: person.home, env: person.env, input: 'yes\n' })
  assert.equal(yes.status, 0, `${yes.out}${yes.err}`)
  // A program file that runs while it is taken away goes once its program has ended.
  await until(() => !existsSync(person.tent), 'the folder of the install to go', 60_000)
  if (process.platform === 'win32') assert.equal(pathOfUser().includes(bin), false)
  else
    for (const one of ['.bashrc', '.profile']) {
      const text = readFileSync(join(person.home, one), 'utf8')
      assert.equal(text, 'export X=1\n')
    }
})

test('[15-6@10b] tent uninstall --json answers its shape, and with nobody to answer ends with 2 and removes nothing', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'uninstall-json')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const nobody = await ran(launcher, ['uninstall', '--json'], { cwd: person.home, env: person.env })
  assert.equal(nobody.status, 2)
  const printed = JSON.parse(nobody.out)
  assert.equal(printed.ok, false)
  assert.equal(Array.isArray(printed.findings), true)
  assert.equal(existsSync(join(person.tent, 'current')), true)
  const yes = await ran(launcher, ['uninstall', '--json'], { cwd: person.home, env: person.env, input: 'yes\n' })
  assert.equal(yes.status, 0, yes.err)
  assert.deepEqual(JSON.parse(yes.out), { ok: true, value: { removed: person.tent }, findings: [] })
})

test('[41-1] npm create tent <name> makes the project with tent new of the newest tentjs', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'create-tent')
  const person = personIn(folder, { npm: true })
  const registry = await registryOf(t, packedOf(rel))
  person.env.npm_config_registry = registry.address
  const created = await npm(person, ['create', 'tent', 'demo', '--yes'], person.home)
  assert.equal(created.status, 0, `${created.out}${created.err}`)
  assert.equal(existsSync(join(person.home, 'demo', 'tent.ts')), true)
  assert.equal(JSON.parse(readFileSync(join(person.home, 'demo', 'package.json'), 'utf8')).dependencies.tentjs, '1.0.0')
  // The package holds one line, and no code of the framework.
  const createTent = packedOf(rel).find((one) => one.manifest.name === 'create-tent')
  assert.ok(createTent)
  assert.ok(statSync(createTent.file).size < 4096)
})

/** The files that a package of npm holds, each by its path with its mode, read from its packed file, a tar packed with gzip. */
function modesIn(file: string): Map<string, number> {
  const tar = gunzipSync(readFileSync(file))
  const modes = new Map<string, number>()
  let long: string | undefined
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0; ) {
    const field = (from: number, length: number): string =>
      tar
        .subarray(at + from, at + from + length)
        .toString('utf8')
        .replace(/\0.*$/s, '')
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    const kind = field(156, 1)
    if (kind === 'x') {
      // A path too long for its header is named by the record before it.
      long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(tar.subarray(at + 512, at + 512 + size).toString('utf8'))?.[1]
    } else {
      const prefix = field(345, 155)
      modes.set(
        long ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100)),
        Number.parseInt(field(100, 8).trim(), 8),
      )
      long = undefined
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return modes
}

/** The paths of the files that a package of npm holds, read from its packed file. */
const filesIn = (file: string): string[] => [...modesIn(file).keys()]

test('[41-1] a package of a system is packed with the modes its layer gives: the runtime and the program of the type checker of macOS and Linux may run once installed, whatever system packed them', async (t) => {
  const folder = outsideFolderOf(t, 'npm-modes')
  const made = join(folder, 'package')
  const checker = join(made, 'node_modules', '@typescript', 'typescript-linux-x64')
  mkdirSync(join(made, 'runtime', 'bin'), { recursive: true })
  mkdirSync(join(checker, 'lib'), { recursive: true })
  // Written as a program writes a file: with no right to run, as on Windows every file is.
  writeFileSync(join(made, 'runtime', 'bin', 'node'), 'the runtime')
  writeFileSync(join(made, 'runtime', 'LICENSE'), 'its licence')
  writeFileSync(join(checker, 'lib', 'tsc'), 'the type checker')
  writeFileSync(
    join(checker, 'package.json'),
    JSON.stringify({ name: '@typescript/typescript-linux-x64', version: '7.0.2' }),
  )
  writeFileSync(
    join(made, 'package.json'),
    JSON.stringify({
      name: 'modes',
      version: '1.0.0',
      files: ['runtime'],
      dependencies: { '@typescript/typescript-linux-x64': '7.0.2' },
      bundleDependencies: ['@typescript/typescript-linux-x64'],
    }),
  )
  const into = join(folder, 'packed')
  mkdirSync(into)
  // The step of the release packs it, as it packs the package of a system.
  const step = pathToFileURL(join(process.cwd(), 'install', 'steps', 'npm.mjs')).href
  const packing = `import { packedAs } from ${JSON.stringify(step)}\nconsole.log(packedAs(${JSON.stringify(made)}, ${JSON.stringify(into)}, 'linux-x64'))`
  const done = spawnSync(process.execPath, ['--input-type=module', '-e', packing], { encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
  const modes = modesIn(join(into, done.stdout.trim()))
  assert.equal(modes.get('package/runtime/bin/node'), 0o755)
  assert.equal(modes.get('package/node_modules/@typescript/typescript-linux-x64/lib/tsc'), 0o755)
  assert.equal(modes.get('package/runtime/LICENSE'), 0o644)
})

test('[41-1] each package of the npm door carries its readme, its licence and the fields of its page on npm', async () => {
  const rel = await made()
  const packed = packedOf(rel)
  // The npm that the runtime comes with lies beside it on Windows, and in lib/ of its folder elsewhere.
  const npmFile = [
    join(dirname(process.execPath), 'node_modules'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules'),
  ]
    .map((folder) => join(folder, 'npm', 'package.json'))
    .find((file) => existsSync(file))
  assert.ok(npmFile, 'npm lies beside the runtime')
  const npmEngines = JSON.parse(readFileSync(npmFile, 'utf8'))
  const expected: Record<string, string[]> = {
    tentjs: ['README.md', 'LICENSE', 'THIRD-PARTY.md'],
    [`@tentislabs/tentjs-runtime-${thisSystem}`]: ['LICENSE', 'runtime/LICENSE'],
    'create-tent': ['README.md', 'LICENSE'],
  }
  for (const [name, files] of Object.entries(expected)) {
    const one = packed.find((each) => each.manifest.name === name)
    assert.ok(one, `the release packs ${name}`)
    const held = filesIn(one.file)
    for (const file of files) assert.ok(held.includes(`package/${file}`), `${name} holds ${file}`)
    const m = one.manifest
    assert.equal(typeof m.description, 'string', `${name} has a description`)
    assert.deepEqual(m.repository, { type: 'git', url: 'git+https://github.com/tentislabs/tent.js.git' }, name)
    assert.deepEqual(m.bugs, { url: 'https://github.com/tentislabs/tent.js/issues' }, name)
    assert.equal(typeof m.homepage, 'string', `${name} has a homepage`)
    assert.equal(m.author, 'Tentis Labs', name)
    assert.equal(m.license, 'MIT', name)
    assert.ok(Array.isArray(m.keywords) && m.keywords.length > 0, `${name} has keywords`)
  }
  const tentjs = packed.find((each) => each.manifest.name === 'tentjs')
  assert.equal(tentjs?.manifest.description, 'The full-stack React framework built for AI.')
  // The tent of the npm door, and npm create tent, run on every Node.js that the npm they stand on runs on.
  for (const name of ['tentjs', 'create-tent'])
    assert.deepEqual(packed.find((each) => each.manifest.name === name)?.manifest.engines, {
      node: npmEngines.engines.node,
    })
})

test('[41-1] THIRD-PARTY.md says truly where each part ships: each package that tentjs carries stands in a row that ships it with the build tools or the engine, and the runtime and each package of the package of a system in a row that names that package', async () => {
  const rel = await made()
  const text = readFileSync(join(process.cwd(), 'THIRD-PARTY.md'), 'utf8')
  // The rows of the borrowed parts: the first table, before the parts fetched on first use.
  const rows = text
    .slice(0, text.indexOf('\n## '))
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Part '))
    .map((line) => line.split(' | '))
  const part = (row: string[]): string => row[0]
  const whatFor = (row: string[]): string => row[2]
  const brings = (row: string[]): string => row[6] ?? ''
  /** The rows that hold a package: its own, by its name in the first cell, or each that brings it. */
  const rowsOf = (name: string): string[][] =>
    rows.filter(
      (row) => part(row).includes(`(\`${name}\`)`) || part(row) === `| ${name}` || brings(row).includes(`\`${name}\` `),
    )
  const packed = packedOf(rel)
  const tentjs = packed.find((each) => each.manifest.name === 'tentjs')
  const system = packed.find((each) => each.manifest.name === `@tentislabs/tentjs-runtime-${thisSystem}`)
  assert.ok(tentjs && system)
  const carried = (one: { manifest: Record<string, unknown> }): string[] =>
    Array.isArray(one.manifest.bundleDependencies) ? one.manifest.bundleDependencies.map(String) : []
  for (const name of carried(tentjs)) {
    const held = rowsOf(name)
    assert.ok(held.length > 0, `THIRD-PARTY.md holds ${name}`)
    assert.ok(
      held.some((row) => /Shipped (unchanged, )?with the (build tools|engine)/.test(whatFor(row))),
      `a row of ${name} says it ships with the build tools or the engine: ${held.map(part).join(', ')}`,
    )
  }
  for (const name of ['Node.js', ...carried(system)]) {
    const held = name === 'Node.js' ? rows.filter((row) => part(row) === '| Node.js') : rowsOf(name)
    assert.ok(
      held.some((row) => /in the package of (each|that) system/.test(whatFor(row))),
      `a row of ${name} says it ships in the package of each system`,
    )
  }
})

test('[41-1] the player, and the player with the build tools, are within their download bars', async () => {
  const rel = await made()
  const sized = (layers: string[]): number => {
    // The bar is held on the installer's own file where this computer makes it, and else on the layers it carries.
    const own = process.platform === 'linux' ? join(rel.folder, `tent-${rel.version}-${thisSystem}.tar.xz`) : undefined
    if (own && layers.length === 2 && existsSync(own)) return statSync(own).size
    return layers.map((one) => statSync(join(rel.folder, `${one}-${thisSystem}.tar.br`)).size).reduce((a, b) => a + b)
  }
  const player = await measure('download.player', () => sized(['runtime', 'player']), { unit: 'bytes' }).catch(
    (missed: unknown) => missed,
  )
  const tools = await measure('download.tools', () => sized(['runtime', 'player', 'tools']), { unit: 'bytes' }).catch(
    (missed: unknown) => missed,
  )
  for (const one of [player, tools]) if (one instanceof Error) throw one
  assert.ok(Number(player) < Number(tools))
})
