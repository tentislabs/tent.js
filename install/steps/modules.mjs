// The packages that a tree of a release carries: each borrowed part of code with every package it stands on, as
// the lock of the repository holds them, with the program files of the system the tree is for.
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The packages that the player and the build tools carry, by their names in `package.json`. */
export const playerPackages = ['ws', 'nodemailer']
export const toolsPackages = [
  'vite',
  'react',
  'react-dom',
  'typescript',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  // The types of the borrowed WebSocket part, which the type check of a project reads through the framework's own code.
  '@types/ws',
]

/** A system as the runtime names it, split into what a package of one system states: its `os` and its `cpu`. */
const partsOf = (system) => {
  const [os, cpu] = system.split('-')
  return { os, cpu }
}

/** Whether a line of the lock is a package of a system, by its `os`, its `cpu` and its `libc`, and whether it fits this one. */
function fits(line, system) {
  const { os, cpu } = partsOf(system)
  if (line.os && !line.os.includes(os)) return false
  if (line.cpu && !line.cpu.includes(cpu)) return false
  // Of Linux, the packages for the usual C library are taken, and not those for the small one.
  if (line.libc && !line.libc.includes('glibc')) return false
  return true
}

/** Whether a line of the lock is for one system alone. */
export const isNative = (line) => Boolean(line.os || line.cpu)

/**
 * Takes the root of the repository, the names of packages, a system, and the folder that holds the packages of
 * other systems, as `<system>/node_modules/<name>`. Answers every package that the names stand on, by its place
 * in the lock (`node_modules/<name>`, or nested), with the folder it is copied from. Throws where a package of
 * another system than this computer's is not in that folder.
 */
export function packagesOf(root, names, system, natives) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages
  const here = `${process.platform}-${process.arch}`
  const found = new Map()
  /** The place of a package in the lock as the runtime finds it from a place: in its own folder first, then above. */
  const placeOf = (name, from) => {
    let at = from
    for (;;) {
      const tried = `${at ? `${at}/` : ''}node_modules/${name}`
      if (lock[tried]) return tried
      if (!at) return undefined
      const up = at.lastIndexOf('/node_modules/')
      at = up < 0 ? '' : at.slice(0, up)
    }
  }
  const add = (name, from, optional) => {
    const place = placeOf(name, from)
    if (!place) {
      if (optional) return
      throw new Error(`The lock holds no ${name}, which ${from || 'the release'} stands on`)
    }
    if (found.has(place)) return
    const line = lock[place]
    if (isNative(line) && !fits(line, system)) return
    const source = isNative(line) && system !== here ? join(natives ?? '', system, place) : join(root, place)
    if (!existsSync(join(source, 'package.json'))) {
      if (optional && !isNative(line)) return
      throw new Error(
        `${place} of ${system} is not at hand: lay it at ${source} (\`npm pack ${name}@${line.version}\` unpacked) and make the release again`,
      )
    }
    found.set(place, { place, name, source, native: isNative(line), version: line.version })
    for (const dep of Object.keys(line.dependencies ?? {})) add(dep, place, false)
    for (const dep of Object.keys(line.optionalDependencies ?? {})) add(dep, place, true)
  }
  for (const name of names) add(name, '', false)
  return [...found.values()].sort((a, b) => (a.place < b.place ? -1 : 1))
}

/** Copies each package into a folder, at its place in the lock, without the packages nested in it, which have places of their own. */
export function copyPackages(packages, into) {
  for (const one of packages)
    cpSync(one.source, join(into, one.place), {
      recursive: true,
      filter: (path) => !path.slice(one.source.length).includes('node_modules'),
    })
}

/** The folder of the npm that the runtime of this computer came with, which the build tools ship unchanged. */
export function npmFolder() {
  const beside = dirname(process.execPath)
  const found = [join(beside, 'node_modules', 'npm'), join(beside, '..', 'lib', 'node_modules', 'npm')].find((one) =>
    existsSync(join(one, 'package.json')),
  )
  if (!found) throw new Error(`No npm lies beside the runtime ${process.execPath}, which the build tools ship`)
  return found
}
