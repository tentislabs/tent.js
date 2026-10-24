import { fetchedModule } from './fetchedModule.ts'

// The part of the borrowed API that the engine uses, typed here, since its types are not installed.
interface Workbook {
  SheetNames: string[]
  Sheets: Record<string, Record<string, unknown>>
}
type Read = (data: Uint8Array, o: { type: 'array'; cellDates: true; dense: true }) => Workbook
interface Utils {
  decode_range(range: string): { s: { r: number; c: number }; e: { r: number; c: number } }
  sheet_to_json(sheet: unknown, o: { header: 1; raw: true; defval: null; blankrows: true }): unknown[][]
}

/** One sheet of a workbook: its name, the number of its first row as a spreadsheet counts it, and its rows. */
export interface Sheet {
  name: string
  first: number
  rows: unknown[][]
}

/**
 * Loads the reader of spreadsheets from the folder of its part, and answers what reads a workbook: each sheet by
 * its name, in order, with its rows as lists of values, a moment as a `Date`. Throws where the part holds no reader.
 */
export async function sheetReaderIn(part: string): Promise<(bytes: Uint8Array) => Sheet[]> {
  const loaded: unknown = await fetchedModule(part, 'xlsx')
  const read: unknown = Reflect.get(Object(loaded), 'read')
  const utils: unknown = Reflect.get(Object(loaded), 'utils')
  if (typeof read !== 'function' || typeof Reflect.get(Object(utils), 'sheet_to_json') !== 'function')
    throw new Error('The part xlsx gives no reader of spreadsheets.')
  // The one place that names the borrowed functions by the types written above.
  const [readBook, tools] = [read as Read, utils as Utils]
  return (bytes) => {
    const book = readBook(new Uint8Array(bytes), { type: 'array', cellDates: true, dense: true })
    return book.SheetNames.map((name) => {
      const sheet = book.Sheets[name]
      const range = typeof sheet?.['!ref'] === 'string' ? tools.decode_range(sheet['!ref']) : undefined
      const rows = sheet ? tools.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) : []
      return { name, first: (range?.s.r ?? 0) + 1, rows }
    })
  }
}
