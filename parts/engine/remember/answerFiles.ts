import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { fileRow } from '../stored/files.ts'
import { table } from '../tables/files.ts'
import type { AnswerFile } from './kept.ts'
import { isStored } from '../../core/internal.ts'

const system = { kind: 'system' } as const

/** Each value of a value that its type says is a file, by the place it stands at, and a value with each of them changed. */
function mapFiles(type: unknown, value: unknown, change: (id: string) => string): unknown {
  if (!isStored(type) || value === undefined || value === null) return value
  if (type.kind === 'file') return typeof value === 'string' ? change(value) : value
  if (type.kind === 'list' && Array.isArray(value)) return value.map((one) => mapFiles(type.of, one, change))
  if (type.kind === 'object' && isStored(value) && isStored(type.shape)) {
    const shape = type.shape
    return Object.fromEntries(Object.entries(value).map(([name, one]) => [name, mapFiles(shape[name], one, change)]))
  }
  return value
}

/** The files that a value names where its type says a file stands, each with the fingerprint of its bytes. */
export function filesNamed(o: Opened, type: unknown, value: unknown): { id: string; fingerprint: string }[] {
  const found: { id: string; fingerprint: string }[] = []
  mapFiles(type, value, (id) => {
    const file = fileRow(o, id)
    if (file) found.push({ id, fingerprint: file.fingerprint })
    return id
  })
  return found
}

/** A value whose files are named by their fingerprints in place of their ids: what a key rests on is the bytes. */
export const byFingerprints = (o: Opened, type: unknown, value: unknown): unknown =>
  mapFiles(type, value, (id) => fileRow(o, id)?.fingerprint ?? id)

/**
 * Takes an app, the type of an answer, a remembered answer, the files it keeps and the caller it is given to.
 * Answers it with each file it names as a loose file of that caller's own over the bytes the answer keeps, so that
 * what was made for one caller is never handed to another as theirs.
 */
export function givenFiles(o: Opened, type: unknown, answer: unknown, kept: AnswerFile[], caller: Caller): unknown {
  const made = new Map<string, string>()
  return mapFiles(type, answer, (id) => {
    const held = made.get(id)
    if (held) return held
    const keeping = kept.find((one) => one.id === id)
    const file = keeping ? fileRow(o, keeping.kept) : undefined
    if (!file) return id
    const now = new Date(o.clock.now())
    const { value: row } = o.store.write((tx) =>
      tx.add(
        table.name,
        {
          fingerprint: file.fingerprint,
          size: file.size,
          kind: file.kind,
          name: file.name,
          ...(file.width === undefined ? {} : { width: file.width }),
          ...(file.height === undefined ? {} : { height: file.height }),
          by: callerText(caller),
          looseAt: now,
        },
        system,
      ),
    )
    const copy = String(Reflect.get(Object(row), 'id'))
    made.set(id, copy)
    return copy
  })
}
