// The named step `layers`: for each system, the three folders of a version as an install holds them - `runtime/`,
// `player/` and `tools/` - laid out and packed, each as `<layer>-<system>.tar.br`, and the layer of what differs by
// system that the npm door is repaired with, `system-<system>.tar.br`.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { copyPackages, npmFolder, packagesOf, playerPackages, toolsPackages } from './modules.mjs'
import { printOf } from './sign.mjs'
import { brotliOf, tarOf } from './tar.mjs'

/** The program file of the runtime of a system, by its path in the folder of a Node.js release. */
export const runtimeFile = (system) => (system.startsWith('win32') ? 'node.exe' : 'bin/node')

/** The folder of the runtime of a system: this computer's own, or the one laid under `--runtimes` for another. */
function runtimeOf(c, system) {
  if (system === c.here) {
    const beside = dirname(process.execPath)
    return system.startsWith('win32') ? beside : dirname(beside)
  }
  const laid = join(c.runtimes ?? '', system)
  if (!c.runtimes || !existsSync(join(laid, runtimeFile(system))))
    throw new Error(
      `The runtime of ${system} is not at hand: lay the Node.js ${process.versions.node} of ${system} unpacked at ${laid}, name its folder with --runtimes, and make the release again`,
    )
  return laid
}

/** Whether a file of a layer is a program, which is packed so that it may be run. */
export const runs = (system) => (path, stat) =>
  system.startsWith('win32')
    ? false
    : path === 'runtime/bin/node' || (process.platform !== 'win32' && (stat.mode & 0o111) !== 0) || /\/lib\/tsc$/.test(path)

/** Writes a file of JSON, laid out as every list of a release is. */
const json = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Lays the folders of a version for one system under the work folder, as `<work>/<system>/versions/`. Answers the
 * folder and the packages of the system that the build tools carry, which the npm door holds apart.
 */
export function laidOut(c, system) {
  const at = join(c.work, system)
  rmSync(at, { recursive: true, force: true })
  const runtime = runtimeOf(c, system)
  mkdirSync(join(at, 'runtime', dirname(runtimeFile(system))), { recursive: true })
  cpSync(join(runtime, runtimeFile(system)), join(at, 'runtime', runtimeFile(system)))
  cpSync(join(runtime, 'LICENSE'), join(at, 'runtime', 'LICENSE'))
  cpSync(join(c.work, 'tree', 'player'), join(at, 'player'), { recursive: true })
  cpSync(join(c.work, 'tree', 'tools'), join(at, 'tools'), { recursive: true })
  for (const layer of ['player', 'tools']) json(join(at, layer, 'package.json'), { type: 'module' })
  cpSync(join(c.root, 'install', 'player', 'tent.mjs'), join(at, 'player', 'tent.mjs'))
  cpSync(join(c.root, 'install', 'unix', 'tent'), join(at, 'player', 'launcher', 'tent'))
  json(join(at, 'player', 'shipped.json'), {
    format: 'tent.shipped/1',
    version: c.version,
    ...(c.from ? { releases: c.from } : {}),
  })
  const player = packagesOf(c.root, playerPackages, system, c.natives)
  copyPackages(player, join(at, 'player'))
  const tools = packagesOf(c.root, toolsPackages, system, c.natives)
  copyPackages(tools, join(at, 'tools'))
  cpSync(npmFolder(), join(at, 'tools', 'node_modules', 'npm'), { recursive: true })
  // The program files of the system, which the build tools stand on.
  const natives = tools.filter((one) => one.native)
  return { at, natives }
}

/** Packs folders of a laid-out version into a layer file of the release, and answers its line: its name, size and fingerprint. */
function packed(c, system, at, name, folders) {
  const file = `${name}-${system}.tar.br`
  const bytes = brotliOf(tarOf(at, folders, { time: Math.floor(c.made / 1000), runs: runs(system) }), c.quality)
  writeFileSync(join(c.out, file), bytes)
  return { file, size: bytes.length, fingerprint: printOf(bytes) }
}

/**
 * The step: for each system of the release its folders are laid out, then packed. The trust of the release lies in
 * the player as `trust.json`, so it is written first. Writes `layers.json` into the work folder, which the later
 * steps read: for each system the three layers and the layer of the npm door.
 */
export function layers(c) {
  const lines = {}
  for (const system of c.systems) {
    const { at, natives } = laidOut(c, system)
    cpSync(join(c.out, 'trust.json'), join(at, 'player', 'trust.json'))
    // What differs by system, for the npm door: the runtime, and the program files that the build tools stand on.
    const apart = join(c.work, `${system}-system`)
    rmSync(apart, { recursive: true, force: true })
    cpSync(join(at, 'runtime'), join(apart, 'runtime'), { recursive: true })
    for (const one of natives) cpSync(join(at, 'tools', one.place), join(apart, 'natives', one.place), { recursive: true })
    lines[system] = {
      runtime: packed(c, system, at, 'runtime', ['runtime']),
      player: packed(c, system, at, 'player', ['player']),
      tools: packed(c, system, at, 'tools', ['tools']),
      system: packed(c, system, apart, 'system', ['runtime', 'natives']),
      natives: natives.map((one) => ({ place: one.place, name: one.name, version: one.version })),
    }
    c.say(`layers: ${system}: ${Object.keys(lines[system]).filter((one) => one !== 'natives').map((one) => `${one} ${(lines[system][one].size / 1048576).toFixed(1)} MB`).join(', ')}`)
  }
  json(join(c.work, 'layers.json'), lines)
}

/** Reads what the step `layers` wrote. Throws where it has not run. */
export function layersOf(c) {
  const file = join(c.work, 'layers.json')
  if (!existsSync(file)) throw new Error('The layers of this version are not made: run the step layers first')
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** The size of a file of the release, in bytes. */
export const sizeIn = (c, file) => statSync(join(c.out, file)).size
