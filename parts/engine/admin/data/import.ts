import { readFileSync } from 'node:fs'
import { TentError } from '../../../core/index.ts'
import type { Admin } from '../../admin.ts'
import { badWord, wordOf } from '../../admin.ts'
import { importPrint, importRecords } from '../../import/run.ts'
import { fileFormOf, recordsOf } from '../../import/records.ts'
import { changeNamed } from '../../import/named.ts'
import { readingOf } from '../../import/reading.ts'
import { callerWritten } from '../../program.ts'

// How far each import of a file that runs has come, by the app and the file: what `--progress` asks.
const going = new WeakMap<object, Map<string, { done: number; of: number }>>()

/** The names a file maps to fields of the input, from `--map 'Full name=name'`, each given once or more. */
function mapOf(given: unknown): Record<string, string> {
  const words = given === undefined ? [] : Array.isArray(given) ? given : [given]
  const map: Record<string, string> = {}
  for (const word of words) {
    const at = typeof word === 'string' ? word.lastIndexOf('=') : -1
    if (typeof word !== 'string' || at < 1 || at === word.length - 1)
      throw badWord('map', "a field of the file and one of the input, as 'Full name=name'")
    map[word.slice(0, at)] = word.slice(at + 1)
  }
  return map
}

/**
 * `tent data import <file> --with <change>`: turns each record of the file into the input of the change, called as
 * the caller that `--as` names, or the system. `--map` names a field of the input for a field of the file, and
 * `--language` the language its values are written in. `--dry` checks every record and writes nothing. The
 * refused records are listed in `<file>.refused.csv`. With `progress`, answers how far the import of that file
 * has come.
 */
export const admin: Admin = {
  name: 'data import',
  async run(o, args) {
    const file = wordOf(args, 'file', 'the file to import')
    const mine = going.get(o.handles) ?? new Map<string, { done: number; of: number }>()
    going.set(o.handles, mine)
    if (Reflect.get(args, 'progress') === true) return mine.get(file) ?? {}
    const change = changeNamed(o, Reflect.get(args, 'with'))
    const language: unknown = Reflect.get(args, 'language')
    const as: unknown = Reflect.get(args, 'as')
    const dry = Reflect.get(args, 'dry') === true
    const caller = callerWritten(o, typeof as === 'string' ? as : 'system')
    if (!dry) o.machine.writes('an import')
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(readFileSync(file))
    } catch {
      throw new TentError('T0001', `No file can be read at ${file}.`, { fix: 'Name a file that is there.' })
    }
    const reading = readingOf(o, mapOf(Reflect.get(args, 'map')), typeof language === 'string' ? language : undefined)
    const records = await recordsOf(bytes, fileFormOf(file))
    try {
      const said = await importRecords(o, {
        records,
        change,
        caller,
        reading,
        dry,
        fingerprint: importPrint(bytes, change, reading),
        refusedAt: `${file}.refused.csv`,
        told: (done, of) => void mine.set(file, { done, of }),
      })
      return { ...said, refusedFile: `${file}.refused.csv` }
    } finally {
      mine.delete(file)
    }
  },
}
