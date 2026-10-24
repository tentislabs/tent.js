import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../../core/index.ts'
import type { Description, Locked } from '../../core/internal.ts'
import { finding, isStored, locksOf, normalName, pythonOfLock } from '../../core/internal.ts'

/** What the packages of one run are held to: ready-built files alone, for all or for the ones named, and those that must be built. */
interface Binaries {
  only: 'all' | string[]
  not: string[]
}

/** The installer of packages, as the build tools are handed it: what it resolves, and the Pythons and systems there are. */
export interface PythonInstaller {
  // The lines of Python that the engine pins, the newest first, and the systems a lock is made for, as the runtime names them.
  versions(): Promise<{ pinned: readonly string[]; systems: readonly string[] }>
  // Resolves entries for a Python, for every system or for one, into the lines of a lock; `told` is what the installer said.
  compile(o: {
    version: string
    entries: string[]
    system?: string
    binaries: Binaries
    alone?: boolean
  }): Promise<{ ok: boolean; text: string; told: string }>
}

const fix = 'Make the entries of `packages` agree, or give one of the definitions a `lock` of its own.'

/** The names of the packages of the lines of a lock: each line that names a package with its exact version. */
const packagesOf = (text: string): { name: string; line: string }[] =>
  text
    .split('\n')
    .map((line) => ({ line, name: line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==/)?.[1] }))
    .filter((one): one is { name: string; line: string } => one.name !== undefined)

/** The error of a lock that the installer could not make: two definitions that need one package named, or its words. */
function notLocked(lock: Locked, told: string): Finding {
  const { file } = lock
  const by = new Map<string, string[]>()
  for (const [definition, entries] of Object.entries(lock.of))
    for (const entry of entries) by.set(normalName(entry), [...(by.get(normalName(entry)) ?? []), definition])
  const shared = [...by].find(
    ([name, definitions]) => new Set(definitions).size > 1 && told.toLowerCase().includes(name),
  )
  if (shared) {
    const [name, definitions] = shared
    return finding(
      'T7020',
      `${[...new Set(definitions)].join(' and ')} need versions of ${name} that cannot stand in one lock, ${file}: ${told}`,
      { fix, where: { file, line: 1 } },
    )
  }
  return finding('T7020', `${file} could not be made: ${told}`, {
    fix: 'Mend what the installer names: a package that is not there, or one that may only be built, which `python.build` of `project` names.',
    where: { file, line: 1 },
  })
}

/**
 * Resolves one lock: for every system at once, and then for each system alone, each package that has no ready-built
 * file for it is a warning that names the system. A package that `build` names may be built where it has none.
 * Answers the text of the lock, or the error of why it could not be made.
 */
async function resolved(
  installer: PythonInstaller,
  lock: Locked,
  version: string,
  build: string[],
  systems: readonly string[],
): Promise<{ text: string; warnings: Finding[] } | Finding> {
  const { file } = lock
  const all = await installer.compile({ version, entries: lock.entries, binaries: { only: 'all', not: build } })
  if (!all.ok) return notLocked(lock, all.told)
  let body = all.text
  if (build.length) {
    // A package that may be built takes its ready-built files where it has them, and its source where it has none.
    const only = packagesOf(all.text)
      .map((one) => one.name)
      .filter((name) => !build.some((built) => normalName(built) === normalName(name)))
    const again = await installer.compile({ version, entries: lock.entries, binaries: { only, not: [] } })
    if (!again.ok) return notLocked(lock, again.told)
    body = again.text
  }
  const warnings: Finding[] = []
  const held = packagesOf(body).filter((one) => !build.some((built) => normalName(built) === normalName(one.name)))
  for (const system of systems) {
    const here = await installer.compile({ version, entries: lock.entries, system, binaries: { only: 'all', not: [] } })
    if (here.ok) continue
    for (const one of held) {
      const pinned = one.line.replace(/\s*\\$/, '').replace(/\s*;.*$/, '')
      const alone = await installer.compile({
        version,
        entries: [pinned],
        system,
        binaries: { only: 'all', not: [] },
        alone: true,
      })
      if (!alone.ok)
        warnings.push(
          finding(
            'T7020',
            `${pinned} has no ready-built file for ${system}: ${file} cannot be installed there.`,
            {
              fix: 'Where it may be built on such a computer, name it in `python.build` of `project`.',
              where: { file, line: 1 },
            },
            'warning',
          ),
        )
    }
  }
  return {
    text: `# python ${version}\n# packages ${JSON.stringify(lock.entries)}\n${body.replace(/\s*$/, '\n')}`,
    warnings,
  }
}

/**
 * Takes the folder of a project, its description, and the installer. Resolves the `packages` of every `python` of
 * the project, for every system the installer names, into each of its locks: `python.lock` and one for each
 * `lock` that a definition names, written into the root of the project. Answers the Python they were made for, the
 * files that were written, and what was found: T7020 for a Python that the engine does not pin and for a lock that
 * could not be made, with nothing written then, and a warning for each package with no ready-built file for a system.
 */
export async function lockPython(
  folder: string,
  description: Description,
  installer: PythonInstaller,
): Promise<{ python: string; written: string[]; findings: Finding[] }> {
  const python = isStored(description.project.python) ? description.project.python : {}
  const { pinned, systems } = await installer.versions()
  const newest = pinned[0] ?? ''
  const project = typeof python.version === 'string' ? python.version : newest
  const build = Array.isArray(python.build) ? python.build.filter((one): one is string => typeof one === 'string') : []
  const findings: Finding[] = []
  const texts: [string, string][] = []
  for (const lock of locksOf(description)) {
    const version = pythonOfLock(description, lock.lock) ?? newest
    if (!pinned.includes(version)) {
      findings.push(
        finding(
          'T7020',
          `${lock.file} is to be made for Python ${version}, which the engine does not pin: it pins ${pinned.join(' and ')}.`,
          {
            fix: `Name one of them in \`python.version\` of \`project\`, as '${newest}'.`,
            where: { file: 'tent.ts', line: 1 },
          },
        ),
      )
      continue
    }
    const made = await resolved(installer, lock, version, build, systems)
    if ('code' in made) findings.push(made)
    else {
      findings.push(...made.warnings)
      texts.push([lock.file, made.text])
    }
  }
  if (findings.some((one) => one.level === 'error')) return { python: project, written: [], findings }
  for (const [file, text] of texts) writeFileSync(join(folder, file), text)
  return { python: project, written: texts.map(([file]) => file), findings }
}
