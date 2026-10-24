import { TentError } from '../../core/index.ts'
import { fetchPart } from '../fetchPart.ts'

/** One record of a file: where it stands, as a person finds it there, and its fields by the names of the header. */
export interface FileRecord {
  line: string
  fields: Record<string, unknown>
}

/** The forms of a file that an import reads. */
export type Form = 'csv' | 'tsv' | 'json' | 'jsonl' | 'xlsx'

/** The form of a file, by the ending of its name, and by its kind where the name says none. Throws T0002 for any other. */
export function fileFormOf(name: string, kind?: string): Form {
  const ending = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase()
  const byName: Record<string, Form> = {
    csv: 'csv',
    tsv: 'tsv',
    txt: 'tsv',
    json: 'json',
    jsonl: 'jsonl',
    ndjson: 'jsonl',
    xlsx: 'xlsx',
  }
  const byKind: Record<string, Form> = {
    'text/csv': 'csv',
    'text/tab-separated-values': 'tsv',
    'application/json': 'json',
    'application/x-ndjson': 'jsonl',
    'application/jsonl': 'jsonl',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  const form = (ending ? byName[ending] : undefined) ?? (kind ? byKind[kind.split(';')[0].trim()] : undefined)
  if (form) return form
  throw new TentError('T0002', `An import reads CSV, TSV, JSON, JSON lines and spreadsheets, and ${name} is none.`, {
    fields: { file: 'kind' },
    fix: 'Name the file by its form: `.csv`, `.tsv`, `.json`, `.jsonl` or `.xlsx`.',
  })
}

/**
 * Takes a text of separated values and the sign between fields. Answers its rows, each a list of fields, with the
 * line it begins on: a field in double quotes may hold the sign, a line break, and a quote written twice.
 */
function rowsOf(text: string, sign: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = []
  let [cells, cell, quoted, line, begun] = [[] as string[], '', false, 1, 1]
  let any = false
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"'
        at++
      } else if (char === '"') quoted = false
      else {
        if (char === '\n') line++
        cell += char
      }
      continue
    }
    if (char === '"' && cell === '') {
      quoted = true
      any = true
    } else if (char === sign) {
      cells.push(cell)
      cell = ''
      any = true
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[at + 1] === '\n') at++
      if (any || cell !== '') rows.push({ line: begun, cells: [...cells, cell] })
      ;[cells, cell, any] = [[], '', false]
      line++
      begun = line
    } else {
      cell += char
      any = true
    }
  }
  if (any || cell !== '') rows.push({ line: begun, cells: [...cells, cell] })
  return rows
}

/** The records of rows whose first one is the header that names the fields: an empty field is no value. */
function byHeader(rows: { line: string; cells: unknown[] }[]): FileRecord[] {
  const [header, ...rest] = rows
  if (!header) return []
  const names = header.cells.map((one) => String(one ?? '').trim())
  return rest
    .filter((row) => row.cells.some((one) => one !== null && one !== undefined && String(one).trim() !== ''))
    .map((row) => ({
      line: row.line,
      fields: Object.fromEntries(
        names.flatMap((name, at) => {
          const value = row.cells[at]
          return name === '' || value === null || value === undefined || value === '' ? [] : [[name, value]]
        }),
      ),
    }))
}

/** The records of a text of separated values: a CSV whose header holds `;` and no `,` is separated by `;`, as a spreadsheet of many languages writes one. */
function separated(text: string, form: 'csv' | 'tsv'): FileRecord[] {
  const first = text.slice(0, text.search(/\r?\n|$/))
  const sign = form === 'tsv' ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ','
  return byHeader(rowsOf(text, sign).map((row) => ({ line: String(row.line), cells: row.cells })))
}

/** The error of a file whose text does not read as its form. */
const unread = (what: string, line: string): TentError =>
  new TentError('T0002', `The file does not read as ${what} at line ${line}.`, { fields: { file: 'format' } })

/** A record of JSON: an object, whose fields are its members. */
function recordOf(value: unknown, line: string, what: string): FileRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw unread(what, line)
  return { line, fields: Object.fromEntries(Object.entries(value).filter(([, one]) => one !== null && one !== '')) }
}

/**
 * Takes the bytes of a file and its form. Answers its records in order, each with its line: of a spreadsheet the
 * sheet's name and its row, as `Members:12`, every sheet read by its name with its first row as its header. Throws
 * T0002 for a file that does not read as its form, and T0016 where the reader of spreadsheets cannot be fetched.
 */
export async function recordsOf(bytes: Uint8Array, form: Form): Promise<FileRecord[]> {
  if (form === 'xlsx') {
    const folder = await fetchPart('xlsx')
    const { sheetReaderIn } = await import('../borrowed/xlsx.ts')
    const reader = await sheetReaderIn(folder).catch((error) => {
      throw new TentError('T0016', `The part xlsx does not give what reads a spreadsheet: ${String(error)}`)
    })
    let sheets: Awaited<ReturnType<typeof reader>>
    try {
      sheets = reader(bytes)
    } catch {
      throw unread('a spreadsheet', '1')
    }
    return sheets.flatMap((sheet) =>
      byHeader(sheet.rows.map((cells, at) => ({ line: `${sheet.name}:${sheet.first + at}`, cells }))),
    )
  }
  // A mark of the order of the bytes, as some programs write at the start of a text, is no part of it.
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
  if (form === 'csv' || form === 'tsv') return separated(text, form)
  if (form === 'jsonl')
    return text.split(/\r?\n/).flatMap((one, at) => {
      if (one.trim() === '') return []
      try {
        return [recordOf(JSON.parse(one), String(at + 1), 'JSON lines')]
      } catch (error) {
        throw error instanceof TentError ? error : unread('JSON lines', String(at + 1))
      }
    })
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    throw unread('JSON', '1')
  }
  if (!Array.isArray(read)) throw unread('a JSON list of records', '1')
  return read.map((one, at) => recordOf(one, String(at + 1), 'a JSON list of records'))
}
