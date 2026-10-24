import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Description, Locked } from '../../core/internal.ts'
import { fingerprintOf, isLockName, isStored, locksOf, pythonOfLock } from '../../core/internal.ts'
import { isPackageEntry, isPackageName } from '../python/entries.ts'
import { readLock } from '../python/lockText.ts'
import { pythonFiles } from '../python/pyFiles.ts'
import type { Step, Work } from '../work.ts'
import { found } from '../work.ts'

const fix = 'Run `tent python lock`, which makes the lock anew from the `packages` of the project.'

/** Where a definition was written, by its name: its file and its line, where the build knows them. */
function written(work: Work, name: string): { file: string; line: number | undefined } {
  const loaded = work.loaded.find((one) => Reflect.get(one.value, 'definition') === name)
  return { file: loaded?.file ?? 'tent.ts', line: loaded?.line }
}

/** Whether an index is named by an `https` address that holds no name and no password. */
function isIndexAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false
  try {
    const url = new URL(address)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/** Holds the entries of `packages`, and `index` and `build` of `python` in `project`, to the forms they take: T1014. */
function heldEntries(work: Work, python: Record<string, unknown>, functions: [string, unknown][]): void {
  for (const [name, record] of functions) {
    const lock: unknown = isStored(record) ? Reflect.get(Object(record.python), 'lock') : undefined
    if (lock !== undefined && !isLockName(lock)) {
      const at = written(work, name)
      found(
        work,
        'T1014',
        at.file,
        at.line,
        `${name}: the \`lock\` ${JSON.stringify(lock).slice(0, 60)} is no name of a lock: a name holds letters, digits and hyphens alone.`,
        'Name the lock as `scoring`, and give it its Python in `python.locks` of `project` where it needs its own.',
        name,
      )
    }
    const packages: unknown = isStored(record) ? Reflect.get(Object(record.python), 'packages') : undefined
    for (const entry of Array.isArray(packages) ? packages : [])
      if (!isPackageEntry(entry)) {
        const at = written(work, name)
        found(
          work,
          'T1014',
          at.file,
          at.line,
          `${name}: the entry ${JSON.stringify(entry)} of \`packages\` is no name of a package with a version or a range: an entry never holds an option, an address or a file.`,
          'Write the name, with a version or a range where one is wanted, as `pandas>=3`. An index of your own goes into `python.index` of `project`.',
          name,
        )
      }
  }
  const project = written(work, work.description?.app.name ?? '')
  const index: unknown = python.index
  for (const entry of Array.isArray(index) ? index : [])
    if (!isIndexAddress(isStored(entry) ? entry.url : entry))
      found(
        work,
        'T1014',
        project.file,
        project.line,
        '`python.index` of `project` names an index that is no `https` address, or whose address holds a name or a password.',
        "Name the index by its `https` address alone, and its name and password as `{ url, user: secret('...'), password: secret('...') }`.",
      )
  for (const named of Object.keys(isStored(python.locks) ? python.locks : {}))
    if (!isLockName(named))
      found(
        work,
        'T1014',
        project.file,
        project.line,
        `\`python.locks\` of \`project\` names the lock ${JSON.stringify(named).slice(0, 60)}, which is no name: a name holds letters, digits and hyphens alone.`,
        'Name each lock as `scoring`.',
      )
  const build: unknown = python.build
  for (const entry of Array.isArray(build) ? build : [])
    if (!isPackageName(entry))
      found(
        work,
        'T1014',
        project.file,
        project.line,
        `\`python.build\` of \`project\` holds ${JSON.stringify(entry)}, which is not one name of a package.`,
        'Name each package that may be built on the computer by its name alone.',
      )
}

/**
 * Holds each lock of the project to what its definitions name today, and answers its bytes where it is there: its
 * lines to their form, its second line to the entries of `packages`, its first to the Python the project names.
 * What does not hold is T7020, at its line.
 */
function heldLock(work: Work, description: Description, lock: Locked): Uint8Array | undefined {
  const { file } = lock
  const lies = join(work.folder, file)
  // Definitions that need no package lock nothing: their environment is the Python alone, with no lock to hold.
  if (!existsSync(lies) && !lock.entries.length) return undefined
  if (!existsSync(lies)) {
    const at = written(work, lock.definitions[0] ?? '')
    found(
      work,
      'T7020',
      at.file,
      at.line,
      `${lock.definitions.join(', ')} ${lock.definitions.length > 1 ? 'are' : 'is'} locked into ${file}, which is not there.`,
      fix,
      lock.definitions[0],
    )
    return undefined
  }
  const bytes = readFileSync(lies)
  const read = readLock(bytes.toString('utf8'))
  for (const one of read.found)
    found(work, 'T7020', file, one.line, `Line ${one.line} of ${file} is no line of a lock: ${one.why}.`, fix)
  const wanted = pythonOfLock(description, lock.lock)
  if (read.version && wanted && read.version !== wanted)
    found(
      work,
      'T7020',
      file,
      1,
      `${file} was made for Python ${read.version}, and the project names Python ${wanted}.`,
      fix,
    )
  if (read.entries && JSON.stringify(read.entries) !== JSON.stringify(lock.entries)) {
    const missing = lock.entries.filter((one) => !read.entries?.includes(one))
    const gone = read.entries.filter((one) => !lock.entries.includes(one))
    const told = [
      ...(missing.length ? [`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not among them`] : []),
      ...(gone.length ? [`it names ${gone.join(', ')}, which no definition names`] : []),
    ]
    found(
      work,
      'T7020',
      file,
      2,
      `${file} was made from other entries of \`packages\` than ${lock.definitions.join(', ')} name${lock.definitions.length > 1 ? '' : 's'} today: ${told.length ? told.join(', and ') : 'they stand in another order'}.`,
      fix,
    )
  }
  return bytes
}

/**
 * Of a project that holds a `python`: holds its entries and its locks, copies every `.py` file of the project and
 * of its roots under `python/` of the bundle at its own path, with the files that `files` names and each lock, and
 * writes `python` of the description with the fingerprint of the lock of the project and of each file.
 */
export const step: Step = {
  order: 7.6,
  run: async (work) => {
    const description = work.description
    if (!description) return
    const functions = Object.entries(description.functions).filter(([, record]) => isStored(record.python))
    if (!functions.length) return
    const python = isStored(description.project.python) ? description.project.python : {}
    heldEntries(work, python, functions)
    const patterns: Record<string, string[]> = {}
    for (const [name, record] of functions) {
      const files: unknown = Reflect.get(Object(record.python), 'files')
      if (Array.isArray(files)) patterns[name] = files.filter((one): one is string => typeof one === 'string')
    }
    const { files, outside } = pythonFiles(work, patterns)
    for (const { definition, path } of outside) {
      const at = written(work, definition)
      found(
        work,
        'T1014',
        at.file,
        at.line,
        `${definition}: \`files\` names ${path}, which lies outside the folder of the project.`,
        'Move the file into the project, or name its folder in `roots` of `project`.',
        definition,
      )
    }
    const kept: Record<string, Uint8Array> = {}
    for (const [path, lies] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) kept[path] = readFileSync(lies)
    let own: Uint8Array | undefined
    for (const lock of locksOf(description)) {
      const bytes = heldLock(work, description, lock)
      if (bytes && lock.lock === '') own = bytes
      else if (bytes) kept[lock.file] = bytes
    }
    const prints: Record<string, string> = {}
    for (const path of Object.keys(kept).sort()) prints[path] = fingerprintOf(kept[path] ?? new Uint8Array())
    description.python = { ...(own ? { lock: fingerprintOf(own) } : {}), files: prints }
    for (const [path, bytes] of Object.entries(kept)) work.bundle.set(`python/${path}`, bytes)
    if (own) work.bundle.set('python/python.lock', own)
  },
}
