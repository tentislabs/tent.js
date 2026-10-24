import { randomBytes } from 'node:crypto'
import { isStored } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import { openText, sealText } from '../values/sealing.ts'

/** The key of the engine's own texts of one app, and the texts that were spent, each with the moment it may go. */
interface Held {
  key: Buffer
  spent: Map<string, number>
  // The texts that are held to the first person who used them, with that person and the moment the text may go.
  taken: Map<string, { who: string; until: number }>
}

// Kept in memory alone: a restart ends every text, as it ends what one stood for.
const held = new WeakMap<Opened, Held>()

function heldOf(o: Opened): Held {
  let made = held.get(o)
  if (!made) {
    made = { key: randomBytes(32), spent: new Map(), taken: new Map() }
    held.set(o, made)
  }
  return made
}

/**
 * Takes an app, what a text is for, and what it holds. Answers a text that only this engine can make and read, which
 * holds the moment it was made: what it holds is encrypted, so the person who carries it reads nothing of it.
 */
export function madeText(o: Opened, kind: string, value: Record<string, unknown>): string {
  return sealText(heldOf(o).key, JSON.stringify({ ...value, at: o.clock.now() }), `tent.${kind}/1`)
}

/** What a text of the engine holds, where it opens for what it is for and is no older than `life`; nothing otherwise. */
export function readText(o: Opened, kind: string, text: string, life: number): Record<string, unknown> | undefined {
  const opened = openText(heldOf(o).key, text, `tent.${kind}/1`)
  if (opened === undefined) return undefined
  let read: unknown
  try {
    read = JSON.parse(opened)
  } catch {
    return undefined
  }
  if (!isStored(read) || typeof read.at !== 'number' || o.clock.now() - read.at > life) return undefined
  return read
}

/** Spends a text that works once: answers true the first time, and false for one that was spent within its life. */
export function spendOnce(o: Opened, text: string, life: number): boolean {
  const { spent: all } = heldOf(o)
  const now = o.clock.now()
  for (const [one, until] of all) if (until <= now) all.delete(one)
  if (all.has(text)) return false
  all.set(text, now + life)
  return true
}

/**
 * Holds a text to the first person who uses it within its life: answers true for that person, each time, and false
 * for any other, so a text that was carried to someone else opens nothing for them.
 */
export function heldTo(o: Opened, text: string, who: string, life: number): boolean {
  const { taken } = heldOf(o)
  const now = o.clock.now()
  for (const [one, kept] of taken) if (kept.until <= now) taken.delete(one)
  const first = taken.get(text)
  if (first) return first.who === who
  taken.set(text, { who, until: now + life })
  return true
}
