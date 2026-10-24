// The named step `npm`: the npm door. `tentjs`, which holds the player and the build tools as code with every
// borrowed part that is code packed inside it; one package for each system, `@tentislabs/tentjs-runtime-<system>`, which
// holds what differs by system; and `create-tent`. Each is packed with the npm of the runtime, a package of a
// system with the modes its layer gives, whatever system packs it; and each is published by the owner alone.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { layersOf, runs } from './layers.mjs'
import { copyPackages, npmFolder, packagesOf, playerPackages, toolsPackages } from './modules.mjs'
import { entryPlaces } from './parts.mjs'
import { headersOf, modeIn } from './tar.mjs'

/** Every system a release is made for, as the runtime names it. */
export const allSystems = ['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']

// The address of the docs site, which is also the home page of every package.
const site = 'https://tentjs.com'

/** What the page of each package on npm shows of who makes Tent.js and where it lives, beside its own words. */
const about = {
  author: 'Tentis Labs',
  license: 'MIT',
  homepage: site,
  repository: { type: 'git', url: 'git+https://github.com/tentislabs/tent.js.git' },
  bugs: { url: 'https://github.com/tentislabs/tent.js/issues' },
}

const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

/** Packs a folder with npm, into a folder, and answers the name of the file it wrote. */
function packed(folder, into) {
  const ran = spawnSync(process.execPath, [join(npmFolder(), 'bin', 'npm-cli.js'), 'pack', '--json', '--pack-destination', into], {
    cwd: folder,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (ran.status !== 0) throw new Error(`npm pack failed in ${folder}:\n${ran.stderr}`)
  return JSON.parse(ran.stdout)[0].filename
}

/**
 * Takes the folder of the package of a system, the folder to pack it into, and the system. Packs it as `packed`
 * does, and gives each program in it the mode that its layer gives it: npm takes the mode of a file from the computer
 * that packs it, and Windows gives no file the right to run. Answers the name of the file it wrote.
 */
export function packedAs(folder, into, system) {
  const file = packed(folder, into)
  const program = runs(system)
  const tar = gunzipSync(readFileSync(join(into, file)))
  for (const one of headersOf(tar)) {
    const path = one.path.replace(/^package\//, '')
    if (one.kind === '0' && program(path, statSync(join(folder, path)))) modeIn(one.head, 0o755)
  }
  writeFileSync(join(into, file), gzipSync(tar, { level: 9 }))
  return file
}

/** The packages of one layer by their top names, and the versions that `dependencies` states them with. */
const named = (packages) =>
  Object.fromEntries(packages.filter((one) => !one.place.includes('/node_modules/', 13)).map((one) => [one.name, one.version]))

/**
 * The step. The code of the three folders is the same for every system: it is taken from the first system of the
 * release, and the program files of each system are packed in the package of that system.
 */
export function npm(c) {
  const layers = layersOf(c)
  const into = join(c.out, 'npm')
  rmSync(into, { recursive: true, force: true })
  mkdirSync(into, { recursive: true })
  const made = []
  const first = c.systems[0]
  // tentjs: the trees of the player and the build tools, and every package they carry in one folder of packages.
  const main = join(c.work, 'npm', 'tentjs')
  rmSync(main, { recursive: true, force: true })
  const laid = join(c.work, first)
  cpSync(join(c.work, 'tree', 'player'), join(main, 'player'), { recursive: true })
  cpSync(join(c.work, 'tree', 'tools'), join(main, 'tools'), { recursive: true })
  for (const file of ['tent.mjs', 'shipped.json', 'trust.json', 'package.json'])
    cpSync(join(laid, 'player', file), join(main, 'player', file))
  cpSync(join(c.root, 'install', 'npm', 'bin'), join(main, 'bin'), { recursive: true })
  cpSync(join(c.out, 'systems.json'), join(main, 'systems.json'))
  for (const file of ['README.md', 'LICENSE', 'THIRD-PARTY.md']) cpSync(join(c.root, file), join(main, file))
  const code = [...packagesOf(c.root, playerPackages, first, c.natives), ...packagesOf(c.root, toolsPackages, first, c.natives)].filter(
    (one) => !one.native,
  )
  copyPackages(code, main)
  cpSync(npmFolder(), join(main, 'node_modules', 'npm'), { recursive: true })
  const shippedNpm = JSON.parse(readFileSync(join(npmFolder(), 'package.json'), 'utf8'))
  const bundled = { ...named(code), npm: shippedNpm.version }
  // The tent of this package and create-tent run on every Node.js that npm, which starts them, runs on.
  const engines = { node: shippedNpm.engines.node }
  // A program of a project imports the framework by the names of the docs, as it imports any package.
  const exported = Object.entries(entryPlaces(c.root)).map(([name, place]) => [
    name === 'tentjs' ? '.' : `./${name.slice('tentjs/'.length)}`,
    { types: `./${place.types}`, default: `./${place.code}` },
  ])
  const manifest = {
    name: 'tentjs',
    version: c.version,
    description: 'The full-stack React framework built for AI.',
    keywords: ['framework', 'full-stack', 'react', 'typescript', 'ai', 'agents', 'database', 'workflows', 'api', 'mcp'],
    ...about,
    type: 'module',
    exports: Object.fromEntries(exported),
    bin: { tent: 'bin/tent.js' },
    files: ['bin', 'player', 'tools', 'systems.json', 'THIRD-PARTY.md'],
    engines,
    dependencies: bundled,
    bundleDependencies: Object.keys(bundled).sort(),
    optionalDependencies: Object.fromEntries(allSystems.map((one) => [`@tentislabs/tentjs-runtime-${one}`, c.version])),
  }
  json(join(main, 'package.json'), manifest)
  made.push({ file: packed(main, into), manifest })
  // One package for each system: the runtime, and the program files that the build tools stand on.
  for (const system of c.systems) {
    const [os, cpu] = system.split('-')
    const folder = join(c.work, 'npm', `runtime-${system}`)
    rmSync(folder, { recursive: true, force: true })
    cpSync(join(c.work, system, 'runtime'), join(folder, 'runtime'), { recursive: true })
    cpSync(join(c.root, 'LICENSE'), join(folder, 'LICENSE'))
    const natives = layers[system].natives
    for (const one of natives) cpSync(join(c.work, system, 'tools', one.place), join(folder, one.place), { recursive: true })
    const deps = Object.fromEntries(natives.map((one) => [one.name, one.version]))
    const one = {
      name: `@tentislabs/tentjs-runtime-${system}`,
      version: c.version,
      description: `What Tent.js needs on ${system}: the runtime, and the program files of the build tools.`,
      keywords: ['tentjs', 'runtime', system],
      ...about,
      os: [os],
      cpu: [cpu],
      files: ['runtime'],
      dependencies: deps,
      bundleDependencies: Object.keys(deps).sort(),
    }
    json(join(folder, 'package.json'), one)
    made.push({ file: packedAs(folder, into, system), manifest: one })
  }
  // create-tent holds one line, and no code of the framework.
  const create = join(c.work, 'npm', 'create-tent')
  rmSync(create, { recursive: true, force: true })
  mkdirSync(create, { recursive: true })
  for (const file of ['index.js', 'README.md']) cpSync(join(c.root, 'install', 'create-tent', file), join(create, file))
  cpSync(join(c.root, 'LICENSE'), join(create, 'LICENSE'))
  const creating = {
    name: 'create-tent',
    version: c.version,
    description: 'npm create tent <name>: a new project of Tent.js, the full-stack React framework built for AI.',
    keywords: ['tentjs', 'create', 'new project', 'react', 'framework'],
    ...about,
    type: 'module',
    bin: { 'create-tent': 'index.js' },
    files: ['index.js'],
    engines,
  }
  json(join(create, 'package.json'), creating)
  made.push({ file: packed(create, into), manifest: creating })
  json(join(into, 'packed.json'), made)
  c.say(`npm: ${made.map((one) => one.file).join(', ')}`)
}
