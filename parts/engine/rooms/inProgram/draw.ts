import { copyFileSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Mode } from '../../../data/index.ts'
import type { DrawInput, Drawn } from '../../../screens/draw.ts'
import { ownersBy } from '../../failed/owners.ts'
import { fileAt, folderAt, holdsFile } from '../../files.ts'
import { viewsLoader } from '../inside/views.ts'
import type { Draw } from '../room.ts'
import { loadIn } from './loader.ts'

/** What the server file of the page code gives: what draws a page, and what tells it where the modules of a bundle lie. */
export interface PageCode {
  draw(o: DrawInput): Promise<Drawn>
  // In development: the places of the tags that drew a view that failed, by what it threw.
  ownersOf?(thrown: unknown): Promise<string>
  findPageCode(folder: string): void
}

// The server file of the page code, by its name: the bundles of one release hold the same file, and share it.
const pageModules = new Map<string, Promise<PageCode>>()

// The engine's own folder of the server files of the page code, in the system's temporary place and of this program
// alone. A file is loaded from there, so a version that is dropped takes the file from no other version.
let ownFolder: string | undefined

/** Whether a program of this computer runs under a number: one that may not be signalled by this one runs too. */
function runs(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Reflect.get(Object(error), 'code') === 'EPERM'
  }
}

/**
 * The folder that the server files of the page code are loaded from, made at its first use under the number of this
 * program. A program that was ended with no time to remove its own leaves it: each such folder is removed first.
 */
function pageCodeFolder(): string {
  if (ownFolder !== undefined) return ownFolder
  for (const name of readdirSync(tmpdir())) {
    const pid = Number(/^tent-page-code-(\d+)-/.exec(name)?.[1])
    if (!Number.isInteger(pid) || pid === process.pid || runs(pid)) continue
    try {
      rmSync(join(tmpdir(), name), { recursive: true, force: true, maxRetries: 2 })
    } catch {
      // A folder of another user, or one that its program still lets go of, is left for a later program.
    }
  }
  const made = mkdtempSync(join(tmpdir(), `tent-page-code-${process.pid}-`))
  ownFolder = made
  process.once('exit', () => rmSync(made, { recursive: true, force: true }))
  return made
}

/**
 * Takes the place of a version and the path of the server file of its page code. Lays the file into the engine's own
 * folder under its name, which carries its fingerprint, with its source map where the version holds one, unless it
 * lies there already. Answers the address it is loaded from. Throws where the version holds no such file.
 */
function laidOwn(place: string, file: string): string {
  const own = join(pageCodeFolder(), basename(file))
  if (!existsSync(own)) {
    if (holdsFile(place, `${file}.map`)) copyFileSync(fileAt(place, `${file}.map`), `${own}.map`)
    // Laid whole before it is named, so that no load reads half of it.
    copyFileSync(fileAt(place, file), `${own}.laying`)
    renameSync(`${own}.laying`, own)
  }
  return pathToFileURL(own).href
}

/**
 * Loads the server file of the page code of a version, once for all the versions that hold the same file, from the
 * engine's own folder, and tells it that the modules of this version find React and `tentjs/ui` in it. A load that
 * failed is not kept: the next version that asks loads the file from its own.
 */
export async function pageCodeAt(place: string, file: string): Promise<PageCode> {
  let held = pageModules.get(file)
  if (!held) {
    const loading: Promise<PageCode> = (async () => import(laidOwn(place, file)))()
    held = loading
    pageModules.set(file, loading)
    loading.catch(() => {
      if (pageModules.get(file) === loading) pageModules.delete(file)
    })
  }
  const page = await held
  page.findPageCode(folderAt(place, 'server'))
  return page
}

/**
 * Takes the place of a version, the server file of its page code, the mark its modules are loaded under, and the
 * mode of the app. Answers its draw: the page code is loaded with the first page, and a module of a code view when
 * a page first draws its view, so a version's first page waits for its own views. In development a draw that fails
 * is drawn once more, to tell the tags that drew it, and the error carries them.
 */
export function drawOf(place: string, page: string, loading: string, mode: Mode): Draw {
  const viewsOf = viewsLoader((file) => loadIn(place, file, loading, false))
  let code: Promise<PageCode> | undefined
  return async (input) => {
    const loading = code ?? pageCodeAt(place, page)
    code = loading
    // A page code that could not be loaded is asked for again at the next page.
    const pageCode = await loading.catch((error: unknown) => {
      if (code === loading) code = undefined
      throw error
    })
    const names = [input.page.screen, input.part?.component, input.preview?.component].filter(
      (one): one is string => typeof one === 'string',
    )
    try {
      return await pageCode.draw({ ...input, views: await viewsOf(input.description, names) })
    } catch (thrown) {
      if (mode === 'development' && pageCode.ownersOf && typeof thrown === 'object' && thrown !== null)
        ownersBy.set(thrown, await pageCode.ownersOf(thrown).catch(() => ''))
      throw thrown
    }
  }
}
