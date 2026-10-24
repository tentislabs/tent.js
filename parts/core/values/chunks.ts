import { TentError } from '../errors.ts'
import type { Tick } from '../word.ts'
import { recorded, sized } from '../word.ts'

/** What `chunks` may be told. */
interface ChunksOptions {
  size?: number
  overlap?: number
  cut?: 'paragraph' | 'sentence' | 'length'
  language?: string
}

/** One chunk of a text: its words, the place of its first character in the whole text, and its page where the text has pages. */
interface Chunk {
  text: string
  at: number
  page?: number
}

/** A part of the text, from its first character up to and not with `to`. */
type Part = { from: number; to: number }

// A page mark is the form feed character.
const pageMark = '\f'
const white = /\s/
const cuts = ['paragraph', 'sentence', 'length']

/** Whether the runtime has sentence rules for a language. A name that is no name of a language at all throws there. */
function knows(language: unknown): boolean {
  try {
    return typeof language === 'string' && Intl.Segmenter.supportedLocalesOf(language).length > 0
  } catch {
    return false
  }
}

/** Throws T0002 for an option that is not allowed, with the name of the option as the field. */
function refuse(option: string, why: string): never {
  throw new TentError('T0002', `chunks: the option ${option} ${why}.`, { fields: { [option]: 'type' } })
}

/** Answers a part without the white space at its two ends, or nothing where it holds nothing else. */
function trimmed(text: string, { from, to }: Part): Part | undefined {
  let first = from
  let last = to
  while (first < last && white.test(text[first])) first++
  while (last > first && white.test(text[last - 1])) last--
  return first < last ? { from: first, to: last } : undefined
}

/** The runs of text between empty lines. An empty line holds nothing but spaces and tabs. */
function paragraphs(text: string, page: Part): Part[] {
  const parts: Part[] = []
  let run: Part | undefined
  let at = page.from
  while (at < page.to) {
    const feed = text.indexOf('\n', at)
    const end = feed === -1 || feed >= page.to ? page.to : feed
    const empty = /^[ \t]*\r?$/.test(text.slice(at, end))
    if (empty) {
      if (run) parts.push(run)
      run = undefined
    } else run = { from: run ? run.from : at, to: end }
    at = end + 1
  }
  if (run) parts.push(run)
  return parts.flatMap((part) => trimmed(text, part) ?? [])
}

/** The sentences of a part, by the runtime's own sentence rules for a language. */
function sentences(text: string, part: Part, language: string): Part[] {
  const parts: Part[] = []
  for (const { segment, index } of new Intl.Segmenter(language, { granularity: 'sentence' }).segment(
    text.slice(part.from, part.to),
  )) {
    const one = trimmed(text, { from: part.from + index, to: part.from + index + segment.length })
    if (one) parts.push(one)
  }
  return parts
}

/** Every character of a part, where the two halves of a character that is counted as two stay together. */
function characters(text: string, part: Part): Part[] {
  const parts: Part[] = []
  for (let at = part.from; at < part.to; ) {
    const length = (text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1
    parts.push({ from: at, to: Math.min(at + length, part.to) })
    at += length
  }
  return parts
}

/** Splits a run that is longer than `size`: at the last white space before `size`, and with none at `size`. */
function byLength(text: string, part: Part, size: number): Part[] {
  const parts: Part[] = []
  let from = part.from
  while (part.to - from > size) {
    let to = from + size
    for (let at = to; at > from; at--) {
      if (white.test(text[at])) {
        to = at
        break
      }
    }
    // A cut between the two halves of one character moves in front of the character.
    if (to === from + size && to - from > 1 && (text.codePointAt(to - 1) ?? 0) > 0xffff) to--
    const one = trimmed(text, { from, to })
    if (one) parts.push(one)
    from = to
    while (from < part.to && white.test(text[from])) from++
  }
  if (from < part.to) parts.push({ from, to: part.to })
  return parts
}

/** The units of a page, none of them longer than `size`. */
function unitsOf(text: string, page: Part, o: Required<ChunksOptions>): Part[] {
  if (o.cut === 'length') return characters(text, page)
  const whole = trimmed(text, page)
  if (!whole) return []
  const first = o.cut === 'paragraph' ? paragraphs(text, page) : sentences(text, whole, o.language)
  const fits = (part: Part) => part.to - part.from <= o.size
  return first
    .flatMap((part) => (fits(part) || o.cut === 'sentence' ? [part] : sentences(text, part, o.language)))
    .flatMap((part) => (fits(part) ? [part] : byLength(text, part, o.size)))
}

/** The chunks of one page: each runs from the start of one unit to the end of a later one, as many as fit. */
function chunksOf(units: Part[], size: number, overlap: number): Part[] {
  const parts: Part[] = []
  let first = 0
  while (first < units.length) {
    let last = first
    while (last + 1 < units.length && units[last + 1].to - units[first].from <= size) last++
    parts.push({ from: units[first].from, to: units[last].to })
    if (last + 1 >= units.length) break
    // The next chunk repeats the end of this one from the earliest unit that begins within the overlap, where that
    // unit and the unit after the chunk fit together.
    let next = last + 1
    for (let unit = first + 1; unit <= last; unit++) {
      if (units[unit].from < units[last].to - overlap) continue
      if (units[last + 1].to - units[unit].from <= size) next = unit
      break
    }
    first = next
  }
  return parts
}

/**
 * Takes a text, and how it is cut: `size`, the most a chunk may hold (1200); `overlap`, how much of the end of one
 * chunk is repeated at the start of the next (150), which is less than half of `size`; `cut`, where a chunk may end
 * (`'paragraph'`); and `language`, whose sentence rules are used (`'en'`). Answers the chunks, each `{ text, at }`
 * and a part of the text exactly as it stood, with `page` where the text holds a page mark. The same text and
 * options give the same chunks on every system. Handed a reference it answers its record. Throws T0002 for an
 * option that is not allowed, and T0027 for more chunks than `valueSize`.
 */
export function chunks(text: string, o?: ChunksOptions): Chunk[]
export function chunks(...values: unknown[]): unknown {
  return chunksWith(undefined, ...values)
}

/** `chunks` with the `tick` it asks once for each chunk that it makes. */
export function chunksWith(tick: Tick, ...values: unknown[]): unknown {
  return recorded('chunks', values) ?? Reflect.apply(cut, undefined, [tick, ...values])
}

/** Cuts a text into its chunks. */
function cut(tick: Tick, text: string, o: ChunksOptions = {}): Chunk[] {
  if (typeof o !== 'object' || o === null)
    throw new TentError('T0002', 'chunks: its options are no record.', { fields: { options: 'type' } })
  const options = { size: 1200, overlap: 150, cut: 'paragraph' as const, language: 'en', ...o }
  for (const name of Object.keys(o))
    if (!(name in { size: 0, overlap: 0, cut: 0, language: 0 })) refuse(name, 'is none of chunks')
  if (typeof text !== 'string') refuse('text', 'is no text')
  if (!Number.isInteger(options.size) || options.size < 1) refuse('size', 'is no whole number from 1 up')
  if (!Number.isInteger(options.overlap) || options.overlap < 0 || options.overlap * 2 >= options.size)
    refuse('overlap', 'is no whole number under half of the size')
  if (!cuts.includes(options.cut)) refuse('cut', "is none of 'paragraph', 'sentence' and 'length'")
  if (!knows(options.language)) refuse('language', 'is no language that the runtime has sentence rules for')

  const paged = text.includes(pageMark)
  const made: Chunk[] = []
  let from = 0
  let page = 1
  while (from <= text.length) {
    const mark = text.indexOf(pageMark, from)
    const to = mark === -1 ? text.length : mark
    for (const part of chunksOf(unitsOf(text, { from, to }, options), options.size, options.overlap)) {
      tick?.()
      sized('chunks', made.length + 1)
      const chunk: Chunk = { text: text.slice(part.from, part.to), at: part.from }
      made.push(paged ? { ...chunk, page } : chunk)
    }
    from = to + 1
    page++
  }
  return made
}
