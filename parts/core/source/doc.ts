/** What stands between two brackets: its entries, which stand on one line where they fit, and else one to a line. */
export interface Group {
  open: string
  items: Doc[]
  close: string
  // What stands after each entry: a comma where none is given.
  sep?: string
  // A space stands inside the brackets where the entries stand on one line, as in a record: on both sides, or
  // after the opening one alone, as in a tag.
  pad?: boolean | 'open'
  // The entries stand one to a line also where they would fit on one.
  broken?: boolean
}

/** A piece of text that is laid out: text as it is, pieces one after another, or a group between two brackets. */
export type Doc = string | Doc[] | Group

// The longest line that is written, where a line can be broken.
const width = 120

/** A group between two brackets, its entries with a comma after each. */
export const group = (open: string, items: Doc[], close: string, more: Partial<Group> = {}): Group => ({
  open,
  items,
  close,
  ...more,
})

/** A record written in place: its entries between curly brackets. */
export const recordDoc = (items: Doc[], broken = false): Doc =>
  items.length ? group('{', items, '}', { pad: true, broken }) : '{}'

/** A list written in place. */
export const listDoc = (items: Doc[]): Doc => group('[', items, ']')

/** A call: what is called, and its values between round brackets. */
export const called = (name: Doc, values: Doc[]): Doc => [name, group('(', values, ')')]

/** The lines of a block, one to a line with nothing after each, between two brackets. */
export const block = (open: string, lines: Doc[], close: string): Doc =>
  lines.length ? group(open, lines, close, { sep: '', broken: true }) : `${open}${close}`

/** The first sign of a piece, as far as it is text: what tells whether it must stand in brackets at its place. */
export function firstSign(doc: Doc): string {
  if (typeof doc === 'string') return doc.charAt(0)
  if (Array.isArray(doc)) return doc.length ? firstSign(doc[0]) : ''
  return doc.open.charAt(0)
}

/** A piece on one line, or nothing where it cannot stand on one: a group that is broken, or text of several lines. */
function flat(doc: Doc): string | undefined {
  if (typeof doc === 'string') return doc.includes('\n') ? undefined : doc
  if (Array.isArray(doc)) {
    let text = ''
    for (const one of doc) {
      const part = flat(one)
      if (part === undefined) return undefined
      text += part
    }
    return text
  }
  if (doc.broken && doc.items.length) return undefined
  const items: string[] = []
  for (const one of doc.items) {
    const part = flat(one)
    if (part === undefined) return undefined
    items.push(part)
  }
  const space = doc.pad && items.length ? ' ' : ''
  return `${doc.open}${space}${items.join(`${doc.sep ?? ','} `)}${doc.pad === 'open' ? '' : space}${doc.close}`
}

/** A piece as the texts and the groups it is made of, one after another. */
function partsOf(doc: Doc): (string | Group)[] {
  return Array.isArray(doc) ? doc.flatMap(partsOf) : [doc]
}

/** Where a line stands after a text was written from a column. */
const columnAfter = (column: number, text: string): number =>
  text.includes('\n') ? text.length - text.lastIndexOf('\n') - 1 : column + text.length

/**
 * Lays a piece out as text. `indent` is what each new line starts with, `column` where the piece starts on its
 * line, and `after` how many characters follow it on its last line. A group stands on one line where that line
 * stays within 120 characters, and is broken after its opening bracket otherwise, with its entries two spaces
 * further in.
 */
export function layOut(doc: Doc, indent = '', column = indent.length, after = 0): string {
  if (typeof doc === 'string') return doc.replaceAll('\n', `\n${indent}`)
  if (Array.isArray(doc)) {
    const all = partsOf(doc)
    let text = ''
    let at = column
    for (const [k, one] of all.entries()) {
      // What follows a piece on its line reaches to the opening bracket of the next group, where a line can be broken.
      let rest = 0
      let open = false
      for (const next of all.slice(k + 1)) {
        open = typeof next !== 'string'
        rest += typeof next === 'string' ? next.length : next.open.length
        if (open) break
      }
      const part = layOut(one, indent, at, open ? rest : rest + after)
      text += part
      at = columnAfter(at, part)
    }
    return text
  }
  const whole = flat(doc)
  if (whole !== undefined && column + whole.length + after <= width) return whole
  const inner = `${indent}  `
  const sep = doc.sep ?? ','
  const lines = doc.items.map((one) => `${inner}${layOut(one, inner, inner.length, sep.length)}${sep}`)
  return `${doc.open}\n${lines.join('\n')}\n${indent}${doc.close}`
}
