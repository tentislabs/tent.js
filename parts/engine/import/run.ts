import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { FileName, Tx, Writing } from '../../data/index.ts'
import type { CallContext, Written } from '../context.ts'
import { called } from '../door/call.ts'
import { limitOf, storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { asCall } from '../program.ts'
import { byWhom } from '../byWhom.ts'
import type { FileRecord } from './records.ts'
import type { ValuesReading } from './values.ts'
import { recordInput } from './values.ts'

const system = { kind: 'system' } as const

/** What an import is: its records, the change each goes to, who calls it, how values are read, and whether it writes. */
export interface ImportJob {
  records: FileRecord[]
  change: string
  caller: Caller
  reading: ValuesReading
  dry: boolean
  // What the place of the import is kept under: the same file, change and reading go on from it.
  fingerprint: string
  // The file the refused records are listed in, one line for each, beside the input.
  refusedAt: string
  // Told after each page, for a line that says how far it came.
  told?: (done: number, of: number) => void
}

/** What an import answers. */
export interface Imported {
  records: number
  imported: number
  refused: number
  dry?: true
}

/** Where an import stands: the record it goes on from, and the counts so far. */
interface Place {
  at: number
  imported: number
  refused: number
}

const isPlace = (value: unknown): value is Place =>
  typeof Reflect.get(Object(value), 'at') === 'number' &&
  typeof Reflect.get(Object(value), 'imported') === 'number' &&
  typeof Reflect.get(Object(value), 'refused') === 'number'

/** Answers the fingerprint that the place of an import is kept under: of its bytes, its change and its reading. */
export const importPrint = (bytes: Uint8Array, change: string, reading: ValuesReading): string =>
  createHash('sha256')
    .update(bytes)
    .update(`\n${change}\n${JSON.stringify(reading.map)}\n${reading.language}`)
    .digest('hex')
    .slice(0, 32)

const placeKey = (print: string): string => `import.${print}`

/** A field of the file of refusals, written so that a comma, a quote or a line break in it ends nothing. */
const field = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/** One refused record: its line, the field that does not fit, and why. */
interface Refusal {
  line: string
  field: string
  why: string
}

/** What a refusal of the engine says of a record: the first field that it names, and its words. */
function refusalOf(error: unknown, line: string): Refusal {
  if (!(error instanceof TentError)) throw error
  const fields = Object.keys(error.fields ?? {})
  return { line, field: fields[0] ?? '', why: error.message }
}

/** Reads the place of an import, or nothing for one that has not begun. */
function placeOf(o: Opened, print: string): Place | undefined {
  const held = o.store.read({ from: '_t_meta', one: 'get', id: placeKey(print) }, system).value
  const value: unknown = Reflect.get(Object(held), 'value')
  return isPlace(value) ? value : undefined
}

/** Writes the place of an import inside a write, or takes it away once the import has ended. */
function setPlace(tx: Tx, print: string, place: Place | undefined): void {
  const key = placeKey(print)
  const there = tx.read({ from: '_t_meta', one: 'get', id: key }, system) !== undefined
  if (place === undefined) {
    if (there) tx.remove('_t_meta', key, system)
  } else if (there) tx.change('_t_meta', key, { value: place }, system)
  else tx.add('_t_meta', { key, value: place }, system)
}

/** The key of `_t_meta` under which a data file keeps the last record of an import that was written into it. */
const lastKey = (print: string): string => `imported.${print}`

/**
 * Notes, inside the write of a record, that the record at `at` was written into the file of that write. Answers
 * whether a record at it or after it was written there before: the records go in their order, so it is this one,
 * written before a stop, and the write is to be undone.
 */
function writtenBefore(tx: Tx, print: string, at: number): boolean {
  const held: unknown = tx.read({ from: '_t_meta', one: 'get', id: lastKey(print) }, system)
  const last: unknown = Reflect.get(Object(held), 'value')
  if (typeof last === 'number' && last >= at) return true
  if (held === undefined) tx.add('_t_meta', { key: lastKey(print), value: at }, system)
  else tx.change('_t_meta', lastKey(print), { value: at }, system)
  return false
}

/** The first field of a line of the file of refusals, as `field` wrote it. */
function firstField(line: string): string {
  if (!line.startsWith('"')) return line.split(',')[0]
  let text = ''
  for (let at = 1; at < line.length; at++) {
    if (line[at] !== '"') text += line[at]
    else if (line[at + 1] === '"') {
      text += '"'
      at++
    } else break
  }
  return text
}

/**
 * The file of refusals of an import that goes on: the lines of the records before its place stand, and those
 * after it were written by a page whose write was lost, and are written again.
 */
function keepRefused(file: string, records: FileRecord[], at: number): void {
  if (!existsSync(file)) return
  const before = new Set(records.slice(0, at).map((one) => one.line))
  const [header, ...lines] = readFileSync(file, 'utf8').split('\n')
  const kept = lines.filter((one) => one !== '' && before.has(firstField(one)))
  writeFileSync(file, [header, ...kept, ''].join('\n'))
}

/** Tells whoever listens each row and each change of a write that was committed. */
function told(o: Opened, written: Written): void {
  for (const one of written.after ?? []) one()
  for (const row of written.rows) o.raise('row.changed', { app: o.app, ...row })
  for (const one of written.done) o.raise('change.done', { app: o.app, ...one })
}

// What a write of a dry import throws to be undone, once its change was carried out.
const undone = Symbol('undone')
// What the write of a record throws to be undone where the record was written before a stop.
const again = Symbol('again')

/**
 * Takes an app and an import. Hands each record to the change, as its input, as the caller of the import, so
 * every row passes the change's types, rules and triggers. A page of records (`limits.workPage`) is one write,
 * which keeps the place of the import: an import that stops goes on from its last page. A page in which a record
 * is refused is written again a record at a time, each with the place after it, so each refusal stands alone.
 * Each refused record is listed in the file of refusals, in the order of the file, with its line and its field and
 * why. A dry import carries every record out in one write, which is undone at its end, and keeps no place. Of an app that keeps a
 * data file for each tenant, each record is a write of its own, which notes in the file it wrote that it was: see
 * `ownWrite`. The place is kept after each page. Answers the counts.
 */
export async function importRecords(o: Opened, job: ImportJob): Promise<Imported> {
  const page = Math.max(1, storedLimit(o.description, 'workPage'))
  const fields: Record<string, unknown> = Object(Reflect.get(Object(o.description.functions[job.change]), 'input'))
  const begun = job.dry ? undefined : placeOf(o, job.fingerprint)
  const place: Place = begun ?? { at: 0, imported: 0, refused: 0 }
  mkdirSync(dirname(job.refusedAt), { recursive: true })
  if (begun) keepRefused(job.refusedAt, job.records, begun.at)
  else writeFileSync(job.refusedAt, 'line,field,why\n')
  const refuse = (refused: Refusal[]): void => {
    if (refused.length)
      appendFileSync(
        job.refusedAt,
        refused.map((one) => `${[one.line, one.field, one.why].map(field).join(',')}\n`).join(''),
      )
  }
  const write = <T>(work: (cx: CallContext, tx: Tx) => T): T => {
    const written: Written = { rows: [], done: [] }
    const ends = performance.now() + limitOf(o.description, 'changeTime')
    o.machine.writes(job.change)
    const by = byWhom(job.caller)
    const { value } = o.store.write((tx) => work({ ...asCall(o, job.caller, 'write', ends), tx, written }, tx), { by })
    told(o, written)
    return value
  }
  const call = (cx: CallContext, input: Record<string, unknown>): unknown =>
    called(o, job.change, input, { caller: job.caller, parent: cx, own: true })
  /**
   * Writes one record of an app that keeps a data file for each tenant, in a write of its own, which notes in the
   * file it wrote that the record was written: a record written before a stop is never written twice.
   */
  const ownWrite = async (input: Record<string, unknown>, at: number): Promise<void> => {
    const files = o.files
    if (!files) return
    const ends = performance.now() + limitOf(o.description, 'changeTime')
    const by = byWhom(job.caller)
    let written: Written = { rows: [], done: [] }
    const once = (): void => {
      written = { rows: [], done: [] }
      o.machine.writes(job.change)
      files.write(
        (w) => {
          let file: FileName | undefined
          const watched: Writing = {
            files: w.files,
            tx(named) {
              if (named) file = named
              return w.tx(named)
            },
          }
          call({ ...asCall(o, job.caller, 'write', ends), writing: watched, written }, input)
          if (writtenBefore(w.tx(file), job.fingerprint, at)) throw again
        },
        { by },
      )
    }
    try {
      await (o.tenantFiles ? o.tenantFiles.carried(ends, once) : once())
    } catch (error) {
      if (error === again) return
      throw error
    }
    told(o, written)
  }
  const own = o.files !== undefined || o.tenantFiles !== undefined
  const last = job.records.length
  if (job.dry && !own) {
    // Every record is carried out as the import would carry it, so a record that clashes with one before it is
    // found, and the write is undone at its end.
    try {
      write((cx) => {
        for (const record of job.records) {
          const one = recordInput(record, fields, job.reading)
          try {
            if ('why' in one) throw new TentError('T0002', one.why, { fields: { [one.field]: 'type' } })
            call(cx, one.input)
            place.imported++
          } catch (error) {
            refuse([refusalOf(error, record.line)])
            place.refused++
          }
          job.told?.(place.imported + place.refused, last)
        }
        throw undone
      })
    } catch (error) {
      if (error !== undone) throw error
    }
    return { records: last, imported: place.imported, refused: place.refused, dry: true }
  }
  for (; place.at < last; job.told?.(place.at, last)) {
    // Between two pages the program answers what else waits, an asking of how far the import has come among it.
    await new Promise((turned) => setImmediate(turned))
    const next = Math.min(last, place.at + page)
    const read = job.records
      .slice(place.at, next)
      .map((record, at) => ({ line: record.line, at: place.at + at, read: recordInput(record, fields, job.reading) }))
    const unread = read.flatMap(({ line, read: one }) =>
      'why' in one ? [{ line, field: one.field, why: one.why }] : [],
    )
    const ready = read.flatMap(({ read: one }) => ('input' in one ? [one.input] : []))
    if (!job.dry && !own) {
      // A page goes in whole, with its place, or not at all. Its refusals are listed first: a write that is lost
      // leaves them past its place, where the next start takes them away.
      refuse(unread)
      const whole = { at: next, imported: place.imported + ready.length, refused: place.refused + unread.length }
      try {
        write((cx, tx) => {
          for (const input of ready) call(cx, input)
          setPlace(tx, job.fingerprint, next < last ? whole : undefined)
        })
        Object.assign(place, whole)
        continue
      } catch (error) {
        if (!(error instanceof TentError)) throw error
        keepRefused(job.refusedAt, job.records, place.at)
      }
    }
    // A record at a time: each is written by itself, with the place after it. A refusal writes nothing: a start
    // after a stop finds it past the place, and lists it again.
    for (const { line, at, read: one } of read) {
      if ('why' in one) {
        refuse([{ line, field: one.field, why: one.why }])
        place.refused++
        continue
      }
      try {
        if (job.dry)
          write((cx) => {
            call(cx, one.input)
            throw undone
          })
        else if (own) await ownWrite(one.input, at)
        else
          write((cx, tx) => {
            call(cx, one.input)
            const kept = { ...place, at: at + 1, imported: place.imported + 1 }
            setPlace(tx, job.fingerprint, kept.at < last ? kept : undefined)
          })
        place.imported++
      } catch (error) {
        if (error === undone) {
          place.imported++
          continue
        }
        refuse([refusalOf(error, line)])
        place.refused++
      }
    }
    place.at = next
    if (!job.dry) write((_cx, tx) => setPlace(tx, job.fingerprint, next < last ? { ...place } : undefined))
  }
  return {
    records: last,
    imported: place.imported,
    refused: place.refused,
    ...(job.dry ? { dry: true as const } : {}),
  }
}
