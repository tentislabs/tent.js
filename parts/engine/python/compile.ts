import { dirname, join } from 'node:path'
import type { Mode } from '../../data/index.ts'
import { limitDefaults } from '../../core/internal.ts'
import { usualIndex } from './environment.ts'
import { secretOpener } from './install.ts'
import { runInstaller, startedWith } from './installer.ts'
import { startedProgram } from '../rooms/inProgram/program.ts'
import type { OwnPython, PythonParts } from './tools.ts'
import { installerOf, pinnedPythons, platformOf, pythonOf } from './tools.ts'

/** What the packages of one run are held to: ready-built files alone, for all or for the ones named, and those that must be built. */
interface Binaries {
  only: 'all' | string[]
  not: string[]
}

/** The words that hold a run of the installer to ready-built files, as the binaries ask. */
function binaryWords(binaries: Binaries): string[] {
  const only = binaries.only === 'all' ? [':all:'] : binaries.only
  // A run that names no package at all holds none: the list may not be left empty.
  return [
    ...(only.length ? only : [':none:']).flatMap((one) => ['--only-binary', one]),
    ...binaries.not.flatMap((one) => ['--no-binary', one]),
  ]
}

/**
 * Takes where the parts are taken from, the data folder whose secrets an index names, and what `python` of
 * `project` states. Answers the installer as the build tools are handed it, for `tent python lock`: the lines of
 * Python that the engine pins, with a Python of the builder's own in front where `python.own` names one, the systems
 * a lock is made for, and the run that resolves entries into the lines of a lock, for every system or for one.
 */
export function packageInstaller(
  o: { parts?: PythonParts; data?: { folder: string; mode: Mode }; stated?: Record<string, unknown> } = {},
): {
  versions(): Promise<{ pinned: string[]; systems: string[] }>
  compile(asked: {
    version: string
    entries: string[]
    system?: string
    binaries: Binaries
    alone?: boolean
  }): Promise<{ ok: boolean; text: string; told: string }>
} {
  const stated = o.stated ?? {}
  const parts: PythonParts = { mode: 'live', ...o.parts }
  const own: unknown = stated.own
  const ownVersion: unknown = Reflect.get(Object(own), 'version')
  const { versions, systems } = pinnedPythons()
  const secret = secretOpener(o.data)
  const time = Number(limitDefaults.project.pythonInstall)
  return {
    versions: async () => ({ pinned: typeof ownVersion === 'string' ? [ownVersion, ...versions] : versions, systems }),
    async compile(asked) {
      const ownPython: OwnPython | undefined =
        typeof ownVersion === 'string' && ownVersion === asked.version
          ? {
              version: ownVersion,
              address: String(Reflect.get(Object(own), 'address')),
              fingerprint: String(Reflect.get(Object(own), 'fingerprint')),
            }
          : undefined
      const python = await pythonOf(asked.version, parts, ownPython)
      const installer = await installerOf(parts)
      const platform = asked.system === undefined ? undefined : platformOf(asked.system)
      const words = [
        'pip',
        'compile',
        '-',
        ...(platform === undefined ? ['--universal'] : ['--python-platform', platform]),
        '--generate-hashes',
        '--no-header',
        '--no-annotate',
        '--python-version',
        asked.version,
        ...binaryWords(asked.binaries),
        ...(asked.alone ? ['--no-deps'] : []),
      ]
      const started = startedWith({
        words,
        python: python.program,
        cache: join(dirname(python.place), 'python-cache'),
        usual: usualIndex(parts),
        project: stated,
        secret,
      })
      const ran = await runInstaller(startedProgram, installer, started, {
        input: `${asked.entries.join('\n')}\n`,
        time,
      })
      const told = ran.err
        .split('\n')
        .filter((line) => line.trim() !== '' && !/^Resolved \d+ package/.test(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      return { ok: ran.code === 0, text: ran.out, told }
    },
  }
}
