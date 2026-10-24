import type { Stats } from 'node:fs'
import { chmod, link, lstat, mkdir, realpath, rmdir, stat, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, zstdDecompress } from 'node:zlib'
import type { ArchiveEntry } from './tar.ts'
import { tellsCapitalsApart } from './capitals.ts'
import { readTar } from './tar.ts'
import { readZip } from './zip.ts'

const [fromGzip, fromZstd] = [promisify(gunzip), promisify(zstdDecompress)]

/** Whether bytes start with the given ones. */
const startsWith = (bytes: Uint8Array, ...first: number[]): boolean => first.every((byte, at) => bytes[at] === byte)

/** Reads the entries of an archive of any kind that a part comes as, told by its first bytes. */
async function entriesOf(bytes: Uint8Array): Promise<ArchiveEntry[]> {
  if (startsWith(bytes, 0x1f, 0x8b)) return readTar(await fromGzip(bytes))
  if (startsWith(bytes, 0x28, 0xb5, 0x2f, 0xfd)) return readTar(await fromZstd(bytes))
  if (startsWith(bytes, 0x50, 0x4b)) return await readZip(bytes)
  return readTar(bytes)
}

/** The error of an entry for which its part is thrown away: it names the entry and says why. */
const refused = (path: string, why: string): Error => new Error(`The archive holds ${JSON.stringify(path)}, ${why}.`)

/** Whether a path names a place by itself, from the root of a disk, as one of the three systems reads it. */
const isWhole = (path: string): boolean => /^([\\/]|[A-Za-z]:)/.test(path)

/** The pieces of a path, whichever slash it is written with: a part is laid the same on every system. */
const split = (path: string): string[] => path.split(/[\\/]+/).filter((piece) => piece !== '' && piece !== '.')

/**
 * Answers the pieces of a path of an entry, from the folder of the part. Throws for a path that names a place by
 * itself, and for one that climbs with `..`.
 */
function piecesOf(entry: Pick<ArchiveEntry, 'path'>, path: string): string[] {
  if (isWhole(path)) throw refused(entry.path, 'a path from the root of a disk, which leaves the folder of the part')
  const pieces = split(path)
  if (pieces.includes('..')) throw refused(entry.path, 'a path that climbs out of the folder of the part')
  return pieces
}

/** One entry that is to be laid, and where: its pieces from the folder of the part, and those of its file's folder. */
interface Placed {
  entry: ArchiveEntry
  at: string[]
  under: string[] | undefined
}

/**
 * One file of a part: its bytes, and the folder of the part that it is laid in, where it names one. Such a file
 * is laid with the first folder of each of its paths left out, as a package file of the npm registry is.
 */
export interface PartFile {
  bytes: Uint8Array
  into?: string
}

/** The pieces of a path from the folder of the part, where its file is laid in a folder of its own. */
const movedUnder = (under: string[] | undefined, pieces: string[]): string[] =>
  under === undefined ? pieces : [...under, ...pieces.slice(1)]

/**
 * Holds that no two names of a part are one name to a disk that tells no capitals apart, or that reads a letter
 * the same whether its mark is written into it or after it. Such a part would be laid as one thing on such a
 * disk, so it is thrown away from a folder that reads them as one.
 */
function heldApart(placed: Placed[]): void {
  const written = new Map<string, string>()
  for (const one of placed)
    for (let length = 1; length <= one.at.length; length++) {
      const path = one.at.slice(0, length).join('/')
      const key = path.normalize('NFD').toLowerCase()
      const other = written.get(key) ?? path
      if (other !== path)
        throw refused(one.entry.path, `and ${JSON.stringify(other)}: two names that a disk reads as one`)
      written.set(key, path)
    }
}

/** Asks the disk what lies at a path: a link itself, and not what it leads to. Nothing where nothing lies there. */
const lying = (path: string): Promise<Stats | undefined> => lstat(path).catch(() => undefined)

/** Whether a path of the disk is a folder or lies under it. */
const isIn = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}${sep}`)

/**
 * Takes the folder that is filled and the pieces of a folder in it. Makes each folder of the way that is not
 * there, and throws where a piece of the way is a link: an entry lies under the path of no link. Answers the path
 * of the folder.
 */
async function folderAt(folder: string, pieces: string[], path: string): Promise<string> {
  let at = folder
  for (const piece of pieces) {
    at = join(at, piece)
    const found = await lying(at)
    if (found?.isSymbolicLink()) throw refused(path, 'an entry under the path of a link')
    if (!found) await mkdir(at)
  }
  return at
}

/**
 * Asks the disk where the words of a link lead, from the folder that the link lies in: piece by piece, as the
 * disk follows them, through every link that is laid, so that `..` after a link climbs from where that link
 * leads. Answers the place, or nothing where a piece of the way is not there, or cannot be followed, yet. Throws
 * where the way stands outside the folder of the part after any piece, also where it would come back in: the
 * folder has another name once the part stands in its place.
 */
async function followed(top: string, from: string, link: ArchiveEntry): Promise<string | undefined> {
  let here: string | undefined = from
  for (const piece of split(link.to)) {
    here = piece === '..' ? dirname(here) : await realpath(join(here, piece)).catch(() => undefined)
    if (here === undefined) return undefined
    if (!isIn(here, top)) throw refused(link.path, 'a link that leads out of the folder of the part')
  }
  return here
}

/** Lays every hard link of a part: a second name for a file that lies in the folder. Throws where it names none. */
async function laidHard(top: string, placed: Placed[]): Promise<void> {
  for (const { entry, at, under } of placed.filter((one) => one.entry.kind === 'hard')) {
    const names = join(top, ...movedUnder(under, piecesOf(entry, entry.to)))
    if (!(await lying(names))) throw refused(entry.path, 'a hard link that names no file of the part')
    await link(names, join(await folderAt(top, at.slice(0, -1), entry.path), at.at(-1) ?? ''))
  }
}

/**
 * Takes every file of a part, each a tar archive that may be packed with gzip or zstd, or a zip archive, as its
 * bytes or with the folder it is laid in, the folder to fill, which is empty, and the place where that folder
 * will stand once it is filled.
 * Lays the part in two passes over all its files together. First every folder and every plain file is written,
 * into a folder that holds no link yet, and a path that is written twice fails. Then the links are laid: the hard
 * links first, each of which names a file that the first pass wrote, and then each link once the disk can follow
 * its words to an end, which is asked of the disk before it is laid.
 *
 * `apart` says whether the folder tells two names that differ in capitals apart; where it is not given, the folder
 * is asked.
 *
 * Throws, and the part is thrown away, for: a path that leaves the folder; two names that the disk reads as one; a
 * path that is written twice; an entry under the path of a link; a hard link that names no file; a link that
 * leads out of the folder, in one step or through another link; a link that the disk cannot follow to an end; a
 * link that leads to the folder it lies in or to one above it; and bytes that are no archive.
 */
export async function unpack(
  files: readonly (Uint8Array | PartFile)[],
  folder: string,
  place: string,
  apart?: boolean,
): Promise<void> {
  const placed: Placed[] = []
  for (const file of files) {
    const { bytes, into } = file instanceof Uint8Array ? { bytes: file, into: undefined } : file
    const under = into === undefined ? undefined : piecesOf({ path: into }, into)
    for (const entry of await entriesOf(bytes)) {
      const at = movedUnder(under, piecesOf(entry, entry.path))
      // The first folder of a file that is laid in a folder of its own is that folder itself.
      if (at.length > (under?.length ?? 0)) placed.push({ entry, at, under })
    }
  }
  // A part is held against the disk it is laid on: two such names are refused only where the folder reads them as one.
  if (!(apart ?? (await tellsCapitalsApart(folder)))) heldApart(placed)
  // The disk names the folder in its own way, which is the way it names what a link leads to.
  const top = await realpath(folder)

  // The first pass. No link lies in the folder, so no path passes one.
  for (const { entry, at } of placed) {
    if (entry.kind === 'folder') await mkdir(join(top, ...at), { recursive: true })
    if (entry.kind !== 'file') continue
    await mkdir(join(top, ...at.slice(0, -1)), { recursive: true })
    await writeFile(join(top, ...at), await entry.bytes(), { flag: 'wx' })
    // Windows knows no mark of a program on a file.
    if (process.platform !== 'win32' && (entry.mode & 0o111) !== 0) await chmod(join(top, ...at), entry.mode)
  }

  // The second pass. A hard link is laid before any link is, so what it names is a file of the first pass.
  await laidHard(top, placed)
  // A junction that stands for a link names its folder by a whole path: those that were laid, to be named anew.
  const junctions: { at: string; leads: string }[] = []
  let waiting = placed.filter((one) => one.entry.kind === 'link')
  while (waiting.length > 0) {
    const still: Placed[] = []
    for (const one of waiting) {
      const { entry } = one
      // One system reads it as the sign between two pieces, and another as a letter of a name.
      if (entry.to.includes('\\')) throw refused(entry.path, 'a link whose words hold a backslash')
      if (isWhole(entry.to)) throw refused(entry.path, 'a link that leads out of the folder of the part')
      // The folder it lies in, as the disk names it, which is how the disk names what the link leads to.
      const lies = await realpath(await folderAt(top, one.at.slice(0, -1), entry.path))
      const leads = await followed(top, lies, entry)
      // What it leads through may be a link that is not laid yet: it waits for the next round.
      if (leads === undefined) {
        still.push(one)
        continue
      }
      if (isIn(lies, leads)) throw refused(entry.path, 'a link to the folder it lies in or to one above it')
      const at = join(lies, one.at.at(-1) ?? '')
      if (process.platform !== 'win32') {
        await symlink(entry.to, at)
        continue
      }
      const folderLed = (await stat(leads)).isDirectory()
      try {
        await symlink(entry.to.replaceAll('/', '\\'), at, folderLed ? 'dir' : 'file')
      } catch (error) {
        // Windows lets only some users make a link. A second name for the file, or a junction to the folder, is
        // laid in its place, which every user may lay, and which a program opens as it opens the link.
        if (Object(error).code !== 'EPERM') throw error
        if (folderLed) {
          await symlink(leads, at, 'junction')
          junctions.push({ at, leads })
        } else await link(leads, at)
      }
    }
    // A round that laid nothing lays nothing ever: what is left leads to nothing, or in a circle.
    if (still.length === waiting.length)
      throw refused(still[0]?.entry.path ?? '', 'a link that the disk cannot follow to an end')
    waiting = still
  }
  // While the folder is filled a junction names it, so that the disk can follow it. The part will stand elsewhere.
  for (const { at, leads } of junctions) {
    await rmdir(at)
    await symlink(join(place, relative(top, leads)), at, 'junction')
  }
}
