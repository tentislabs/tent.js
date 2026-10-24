import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { TentError } from '../../core/index.ts'
import { fingerprintOf, write } from '../../core/internal.ts'
import { layoutOf } from '../../data/index.ts'
import { descriptionOf } from '../format.ts'
import type { Opened } from '../opened.ts'
import { becomeRunning, holdVersion } from '../versions.ts'
import { bytesAt, printsAt } from '../files.ts'
import { releaseOf } from '../gradual/release.ts'

/** One loadable version as a writer tells it: its id, whether it runs, and each of its files with its fingerprint. */
export interface ToldVersion {
  version: string
  running: boolean
  files: Record<string, string>
  // While a release goes: the share of the callers that the new version is given, which a reader gives them too.
  share?: number
}

/** Every version of an app that can be loaded, with the folder it is run from: the running one alone where no other was added. */
const loadable = (o: Opened): { id: string; folder: string }[] =>
  o.versions ? [...o.versions.values()] : [{ id: o.version, folder: o.bundle }]

/** The loadable versions of an app, as a writer tells them: each with its files, and which of them runs. */
export function versionsTold(o: Opened): ToldVersion[] {
  const release = releaseOf(o)
  return loadable(o).map((one) => ({
    version: one.id,
    running: one.id === o.version,
    files: printsAt(one.folder),
    ...(release?.to === one.id ? { share: release.share } : {}),
  }))
}

/** The bytes of the file of a loadable version that has that fingerprint, or nothing where no version names it. */
export function blobOf(o: Opened, asked: string): Uint8Array | undefined {
  for (const one of loadable(o)) {
    const path = Object.entries(printsAt(one.folder)).find(([, held]) => held === asked)?.[0]
    if (path !== undefined) return bytesAt(one.folder, path)
  }
  return undefined
}

/** Whether what a writer told is the list of its versions. */
export const isTold = (list: unknown): list is ToldVersion[] =>
  Array.isArray(list) &&
  list.every(
    (one) =>
      typeof Reflect.get(Object(one), 'version') === 'string' &&
      /^[0-9a-f]{8,64}$/.test(String(Reflect.get(Object(one), 'version'))) &&
      typeof Reflect.get(Object(one), 'files') === 'object' &&
      Reflect.get(Object(one), 'files') !== null,
  )

/** The folder that a machine keeps a version in. */
export const versionFolder = (dataFolder: string, version: string): string => join(dataFolder, 'versions', version)

/** Whether a machine holds a version: its folder holds a description. */
export const holdsVersion = (dataFolder: string, version: string): boolean =>
  existsSync(join(versionFolder(dataFolder, version), 'description.json'))

/**
 * Takes a data folder, one version as a writer told it, and what fetches the bytes of a fingerprint. Fetches the
 * files that the folder of the version lacks, holds every path to stay inside that folder and every file to its
 * fingerprint, and reads the description, which must give that version id. Throws T0011 where it does not.
 */
export async function fetchVersion(
  dataFolder: string,
  told: ToldVersion,
  blob: (fingerprint: string) => Promise<Uint8Array>,
): Promise<void> {
  const folder = resolve(versionFolder(dataFolder, told.version))
  const wrong = (why: string): TentError =>
    new TentError('T0011', `The version ${told.version} that the writer told cannot be kept: ${why}.`, {
      fix: 'Run one engine on every machine, and see that the writer holds the bundle as the build wrote it.',
    })
  // The description is written last: a folder that holds one holds the whole version.
  const paths = Object.keys(told.files).sort(
    (a, b) => Number(a === 'description.json') - Number(b === 'description.json'),
  )
  for (const path of paths) {
    const file = resolve(folder, path)
    if (!file.startsWith(`${folder}${sep}`)) throw wrong(`the path ${JSON.stringify(path)} leaves its folder`)
    if (existsSync(file) && statSync(file).isFile() && fingerprintOf(readFileSync(file)) === told.files[path]) continue
    const bytes = await blob(String(told.files[path]))
    if (fingerprintOf(bytes) !== told.files[path]) throw wrong(`the file ${path} is not what its fingerprint names`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, bytes)
  }
  const text = existsSync(join(folder, 'description.json'))
    ? readFileSync(join(folder, 'description.json'), 'utf8')
    : ''
  if (text === '' || write(descriptionOf(text)).versionId !== told.version)
    throw wrong('its description does not give that version id')
}

/**
 * Takes what the engine holds of an app, and a version that its data folder holds. Makes it loadable, where it is
 * not yet, and then the running one: the version that ran stays loadable, so that a page of it is still served.
 */
export async function runVersion(o: Opened, version: string): Promise<void> {
  const makersOf = (): unknown => Reflect.get(Object(o.description.server), 'makers')
  const madeBy = makersOf()
  await holdVersion(o, version)
  becomeRunning(o, version)
  // Made things belong to the app: a version whose makers are not those it was opened with opens it again, here as
  // on its writer, once this change is applied.
  const folder = o.versions?.get(version)?.folder ?? o.bundle
  if (makersOf() !== madeBy && folder !== undefined)
    setImmediate(
      () =>
        void o.again?.(folder).catch((error: unknown) =>
          o.log.write('lines', {
            at: o.clock.now(),
            level: 'error',
            message: 'The reader could not be opened again on a version with other makers.',
            data: JSON.stringify({ version, error: String(error) }),
          }),
        ),
    )
  // The files of tenants are told the layout of the version that runs from now on, and a reader that kept none
  // opens them with the first version that has a tenant table.
  const layout = layoutOf(o.description)
  if (o.tenantFiles) o.tenantFiles.follow((await import('../files/moving.ts')).followedLayout(o))
  else if (layout.some((one) => one.tenant !== undefined)) await o.toFiles?.()
}
