import { number, project, table, text, vector, where } from '../../core/index.ts'
import type { Store } from '../index.ts'
import { at, described, writing } from './shop.ts'
import { system } from './work.ts'

/** How many numbers a vector of the test data holds, as the trial of the vectors measured them. */
export const size = 1536

/**
 * The generator of the trial of the vectors, with its seed: numbers from 0 up to 1 that are the same on every run
 * and every system, and vectors that gather around 200 subjects, as real texts do.
 */
export function generator(seed = 1): () => Float32Array {
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const centres = Array.from({ length: 200 }, () => Float32Array.from({ length: size }, () => random() - 0.5))
  // The trial draws eight places for its peaked data here: they are drawn, so that what follows is the trial's.
  for (let i = 0; i < 8; i++) random()
  return () => {
    const centre = centres[Math.floor(random() * centres.length)]
    const made = new Float32Array(size)
    for (let i = 0; i < size; i++) made[i] = centre[i] + (random() - 0.5) * 0.6
    return made
  }
}

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const

/** Articles with a vector column that every signed-in caller reads, and the same articles under a rule that is a filter. */
export const library = described([
  project('library', {}),
  table('articles', {
    columns: { kind: text(), title: text(), rank: number(), meaning: vector({ size }) },
    access,
  }),
  table('guarded', {
    columns: { kind: text(), title: text(), rank: number(), meaning: vector({ size }) },
    access: { ...access, read: where({ kind: 'a' }) },
  }),
  table('plain', { columns: { kind: text(), title: text(), rank: number() }, access }),
])

/** One article as a test keeps it: its id, its kind, and its vector, or nothing for a row that has none. */
export interface Kept {
  id: string
  kind: string
  vector?: Float32Array
}

/** Adds articles to a table in one write, each tenth of them with no vector where `bare` says so. Answers what was added, in the order it was added. */
export function addArticles(
  store: Store,
  name: string,
  make: () => Float32Array,
  count: number,
  from = 0,
  bare = false,
): Kept[] {
  return writing(
    store,
    library,
    system,
  )((db) =>
    Array.from({ length: count }, (_, i): Kept => {
      const kind = (from + i) % 2 ? 'a' : 'b'
      const vector = bare && i % 10 === 9 ? undefined : make()
      const row = at(db, name).add({
        kind,
        title: `Article ${from + i}`,
        rank: from + i,
        ...(vector ? { meaning: Array.from(vector) } : {}),
      })
      return { id: String(row.id), kind, ...(vector ? { vector } : {}) }
    }),
  )
}

/** The lengths and the sums of a search over every vector, as the document states them: in 64-bit, in the order of the numbers. */
function distance(vector: Float32Array, to: number[], measure: 'cosine' | 'straight'): number {
  if (measure === 'straight') {
    let sum = 0
    for (let i = 0; i < vector.length; i++) {
      const apart = vector[i] - to[i]
      sum += apart * apart
    }
    return Math.sqrt(sum)
  }
  let [dot, length, toLength] = [0, 0, 0]
  for (let i = 0; i < vector.length; i++) {
    dot += vector[i] * to[i]
    length += vector[i] * vector[i]
    toLength += to[i] * to[i]
  }
  return 1 - dot / (Math.sqrt(length) * Math.sqrt(toLength))
}

/**
 * A search over every vector that a test keeps: the nearest `limit` rows that pass, nearest first, rows at the same
 * distance in the order they were added. A row with no vector is left out, and one with no direction for a cosine.
 */
export function truth(
  kept: Kept[],
  to: number[],
  o: { measure?: 'cosine' | 'straight'; limit: number; within?: number; only?: (row: Kept) => boolean },
): { id: string; distance: number }[] {
  const measure = o.measure ?? 'cosine'
  return kept
    .flatMap((row) =>
      row.vector && (o.only?.(row) ?? true) ? [{ id: row.id, distance: distance(row.vector, to, measure) }] : [],
    )
    .filter((row) => !Number.isNaN(row.distance) && (o.within === undefined || row.distance <= o.within))
    .sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1))
    .slice(0, o.limit)
}
