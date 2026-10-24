import type { SqliteFile } from '../../data/index.ts'
import { blobOf } from '../blobs.ts'
import { describedBy } from '../compare/compare.ts'
import type { Described } from '../compare/definitions.ts'
import { filesOf } from '../lay.ts'
import type { Point } from '../point.ts'
import type { DefinitionApart } from './definitions.ts'
import { mergeDefinitions } from './definitions.ts'
import { filledIn, placesIn } from './defined.ts'
import type { LinesApart } from './lines.ts'
import { endOf, linesOf, mergeLines } from './lines.ts'

/** Why a thing that both sides changed was left as ours: a definition, the lines of a file, or a whole file. */
type Apart =
  | DefinitionApart
  | { kind: 'lines'; lines: LinesApart[] }
  | { kind: 'bytes' }
  | { kind: 'file'; changed: 'ours' | 'theirs' }

/** One thing that a merge left as ours, in the file that holds it. */
export interface Clashed {
  what: string
  name: string
  file: string
  apart: Apart
}

/** What a merge writes: each file by its path, with its bytes or nothing where it is removed, and theirs kept beside. */
export interface Planned {
  writes: Map<string, Uint8Array | undefined>
  beside: Map<string, Uint8Array>
  clashes: Clashed[]
  described: { base?: Described; ours?: Described; theirs?: Described }
}

/** The bytes of a file as its text as it stands, line ends and all, or nothing for bytes that are no text. */
function rawText(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes || bytes.includes(0)) return undefined
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/**
 * Takes the three points of a merge: the newest that the two share, ours and theirs. Answers what the merge
 * writes. A file that only one side changed is taken whole from it. In a file that both changed, the definitions
 * that the descriptions place in it merge as definitions, and any other file of text merges line by line. A file
 * that is no text, and one that one side removed while the other changed it, clashes, and theirs is kept beside it.
 */
export function planFiles(file: SqliteFile, base: Point, ours: Point, theirs: Point): Planned {
  const [filesB, filesO, filesT] = [filesOf(file, base), filesOf(file, ours), filesOf(file, theirs)]
  const described = {
    base: filledIn(describedBy(file, base)),
    ours: filledIn(describedBy(file, ours)),
    theirs: filledIn(describedBy(file, theirs)),
  }
  const writes = new Map<string, Uint8Array | undefined>()
  const beside = new Map<string, Uint8Array>()
  const clashes: Clashed[] = []
  const bytes = (print: string | undefined): Uint8Array | undefined =>
    print === undefined ? undefined : blobOf(file, print)
  const paths = [...new Set([...Object.keys(filesB), ...Object.keys(filesO), ...Object.keys(filesT)])].sort()
  for (const path of paths) {
    const [b, o, t] = [filesB[path], filesO[path], filesT[path]]
    if (o === t || t === b) continue
    if (o === b) {
      writes.set(path, bytes(t))
      continue
    }
    const theirsBytes = bytes(t)
    if (o === undefined || t === undefined) {
      clashes.push({
        what: 'file',
        name: path,
        file: path,
        apart: { kind: 'file', changed: o === undefined ? 'theirs' : 'ours' },
      })
      if (theirsBytes) beside.set(`${path}.theirs`, theirsBytes)
      continue
    }
    const [textB, textO, textT] = [rawText(bytes(b)), rawText(bytes(o)), rawText(theirsBytes)]
    if (textO === undefined || textT === undefined || (b !== undefined && textB === undefined)) {
      clashes.push({ what: 'file', name: path, file: path, apart: { kind: 'bytes' } })
      if (theirsBytes) beside.set(`${path}.theirs`, theirsBytes)
      continue
    }
    const placed =
      described.ours &&
      described.theirs &&
      (b === undefined || described.base) &&
      (placesIn(described.ours, path).size > 0 || placesIn(described.theirs, path).size > 0)
    if (placed) {
      const merged = mergeDefinitions(path, {
        base: { text: textB, described: described.base },
        ours: { text: textO, described: described.ours },
        theirs: { text: textT, described: described.theirs },
      })
      for (const one of merged.clashes) clashes.push({ ...one, file: path })
      if (merged.between.length)
        clashes.push({ what: 'file', name: path, file: path, apart: { kind: 'lines', lines: merged.between } })
      if (merged.text !== textO) writes.set(path, new TextEncoder().encode(merged.text))
      continue
    }
    const merged = mergeLines(linesOf(textB ?? ''), linesOf(textO), linesOf(textT))
    if (merged.apart.length)
      clashes.push({ what: 'file', name: path, file: path, apart: { kind: 'lines', lines: merged.apart } })
    const text = merged.lines.join(endOf(textO))
    if (text !== textO) writes.set(path, new TextEncoder().encode(text))
  }
  return { writes, beside, clashes, described }
}
