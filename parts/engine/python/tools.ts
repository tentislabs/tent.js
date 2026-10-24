import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'
import type { FetchedPart } from '../fetchPart.ts'
import { fetchPart, shippedList } from '../fetchPart.ts'

/** Where the parts of Python are taken from: as `fetchPart` takes them, by the program that started the engine. */
export interface PythonParts {
  folder?: string
  from?: string
  mode?: Mode
  time?: number
}

// The name by which the installer of packages names each system that the runtime names.
const platforms: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
}

/** The installer's name of a system that the runtime names, or nothing for one that no lock is made for. */
export const platformOf = (system: string): string | undefined => platforms[system]

/** The lines of Python that the list of the parts pins, the newest first, and the systems it pins them for. */
export function pinnedPythons(): { versions: string[]; systems: string[] } {
  const lines = shippedList().filter((line) => /^python-\d+\.\d+$/.test(line.name))
  const versions = [...new Set(lines.map((line) => line.name.slice('python-'.length)))]
  const newer = (a: string, b: string): number => {
    const [x = [], y = []] = [a, b].map((one) => one.split('.').map(Number))
    return (y[0] ?? 0) - (x[0] ?? 0) || (y[1] ?? 0) - (x[1] ?? 0)
  }
  versions.sort(newer)
  const systems = [...new Set(lines.map((line) => line.system).filter((one) => one !== undefined))]
  return { versions, systems: systems.filter((one) => platforms[one] !== undefined) }
}

/** The error of a part that stands in its place and holds no program of the kind the engine runs. */
const noProgram = (name: string, what: string): TentError =>
  new TentError('T0016', `The part ${name} could not be fetched: it holds no ${what} for this system.`, {
    fix: 'Remove its folder under `fetched/` of the runner, so that it is fetched anew.',
  })

/** The options of `fetchPart` for one of the parts of Python. */
const fetching = (parts: PythonParts, list?: FetchedPart[]) => ({
  ...(parts.folder === undefined ? {} : { folder: parts.folder }),
  ...(parts.from === undefined ? {} : { from: parts.from }),
  ...(parts.mode === undefined ? {} : { mode: parts.mode }),
  ...(parts.time === undefined ? {} : { time: parts.time }),
  ...(list ? { list } : {}),
})

/**
 * Takes where the parts are taken from. Answers the program of the installer of packages, fetched once. Its archive
 * holds it at its top on Windows, and in a folder of its own on macOS and Linux. Throws T0016.
 */
export async function installerOf(parts: PythonParts): Promise<string> {
  const place = await fetchPart('uv', fetching(parts))
  const name = process.platform === 'win32' ? 'uv.exe' : 'uv'
  if (existsSync(join(place, name))) return join(place, name)
  const folder = readdirSync(place).find((one) => one.startsWith('uv-') && existsSync(join(place, one, name)))
  if (folder === undefined) throw noProgram('uv', 'installer')
  return join(place, folder, name)
}

/** A ready-built Python that the engine does not pin, as `python.own` of `project` names it. */
export interface OwnPython {
  version: string
  address: string
  fingerprint: string
}

/**
 * Takes a line of Python, where the parts are taken from, and a Python of the builder's own, where `python.own`
 * names one for that line. Answers the folder of the part and its program, fetched once. Throws T0016.
 */
export async function pythonOf(
  version: string,
  parts: PythonParts,
  own?: OwnPython,
): Promise<{ place: string; program: string }> {
  const name = own && own.version === version ? 'python-own' : `python-${version}`
  const list: FetchedPart[] | undefined =
    name === 'python-own' && own
      ? [{ name, version: own.version, from: own.address, fingerprint: own.fingerprint }]
      : undefined
  const place = await fetchPart(name, fetching(parts, list))
  const program = join(place, 'python', ...(process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3']))
  if (!existsSync(program)) throw noProgram(name, 'Python')
  return { place, program }
}
