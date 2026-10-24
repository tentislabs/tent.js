import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fingerprintOf } from '../../core/internal.ts'
import { linked } from '../assetLink.ts'
import { keeping, ofSession } from '../lookups.ts'
import { placeOf } from '../place.ts'
import { sourceFile } from '../source.ts'
import type { SourceFile, Step, Work } from '../work.ts'
import { found } from '../work.ts'

// What the build does not read in the root of a project: the starter data and the makers of the adapters have a step of
// their own, a clash is no file of the project yet, and the type list is written by the build itself.
const leftInRoot = new Set(['seed.ts', 'engine.ts', 'tent.clash.ts', 'tent.d.ts', 'tests', 'assets'])

// What a build of a session read of each file, by its path, before any step added to it, with what the disk said of
// the file then. The moments of a file move in steps of the clock of its file system, so two saves within one step
// can leave one entry: an entry is trusted only where the file's moment lies a whole step before it was taken.
const readBefore = keeping<{ lies: string; entry: string; read: SourceFile; trusted: boolean }>()

// The paths that the build that runs read with an entry it may not trust yet, settled once it has run.
let untrusted: string[] = []

/** What the disk says of a file now, with whether it may stand for the bytes, or nothing where no file is there. */
function entryOf(lies: string): { entry: string; trusted: boolean } | undefined {
  // Taken before the disk is asked: a later save carries a moment no earlier than one step of the clock before it.
  const now = BigInt(Date.now()) * 1_000_000n
  const said = statSync(lies, { throwIfNoEntry: false, bigint: true })
  if (!said) return undefined
  const moment = said.mtimeNs > said.ctimeNs ? said.mtimeNs : said.ctimeNs
  // A file system that keeps whole seconds keeps two at the most (FAT); the others move with a tick of the system's
  // clock, 15.6 ms on Windows at the most and 10 ms on Linux.
  const step = moment % 1_000_000_000n === 0n ? 2_000_000_000n : 20_000_000n
  return {
    entry: `${placeOf(lies)} ${said.ino} ${said.size} ${said.mtimeNs} ${said.ctimeNs}`,
    trusted: moment + step < now,
  }
}

/** The file at a path as the build reads it: anew, or in a session as the build before read it, where its entry is the same and trusted. */
function readOf(path: string, lies: string): SourceFile {
  const said = ofSession() ? entryOf(lies) : undefined
  const before = said === undefined ? undefined : readBefore.get(path)
  const read = before?.trusted && before.entry === said?.entry ? before.read : sourceFile(path, lies)
  if (said !== undefined) {
    readBefore.set(path, { lies, entry: said.entry, read, trusted: said.trusted })
    if (!said.trusted) untrusted.push(path)
  }
  return { ...read, arrows: new Map() }
}

/**
 * Settles what the build that ran read with an entry it could not trust yet, as git refreshes its racy entries:
 * where the step of the clock has passed since, and the file still lies with that entry and the bytes that were
 * read, the entry is trusted from then on. Every other is read anew by the next build.
 */
export function readsSettled(): void {
  for (const path of untrusted) {
    const before = readBefore.get(path)
    const said = before && entryOf(before.lies)
    if (!before || !said?.trusted || said.entry !== before.entry) continue
    if (fingerprintOf(readFileSync(before.lies)) === before.read.print)
      readBefore.set(path, { ...before, trusted: true })
  }
  untrusted = []
}

function walk(work: Work, folder: string, path: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const below = path ? `${path}/${entry.name}` : entry.name
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || (!path && leftInRoot.has(entry.name))) continue
    if (entry.isDirectory()) walk(work, join(folder, entry.name), below)
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      const file = readOf(below, join(folder, entry.name))
      work.files.set(below, file)
      if (file.unread !== undefined)
        found(
          work,
          'T1014',
          file,
          file.unread.line,
          `The file cannot be read: ${file.unread.words}`,
          'Mend the text of the file.',
        )
    }
  }
}

function assets(work: Work, folder: string, path: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const below = path ? `${path}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      // A link is an asset only where it leads to a file inside `assets/`: what else it leads to is never read.
      const led = linked(join(work.folder, 'assets'), join(folder, entry.name))
      if ('file' in led) work.assetFiles.set(below, led.file)
      else
        found(
          work,
          'T9002',
          `assets/${below}`,
          1,
          `The entry assets/${below} is a link that ${led.why}. A link is an asset only where it leads to a file inside the folder of the assets.`,
          'Put the file itself into `assets/`, or take the link away.',
        )
    } else if (entry.isDirectory()) assets(work, join(folder, entry.name), below)
    else work.assetFiles.set(below, join(folder, entry.name))
  }
}

/**
 * Reads every `.ts` and `.tsx` file of the project, of a build of a session those whose entry on the disk changed
 * since the build before read them or could not be trusted then, and names every file under `assets/`.
 */
export const step: Step = {
  order: 1,
  run: async (work) => {
    untrusted = []
    walk(work, work.folder, '')
    if (existsSync(join(work.folder, 'assets'))) assets(work, join(work.folder, 'assets'), '')
  },
}
