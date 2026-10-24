const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** One number as a source map writes it: in base 64, five bits at a time, its sign in the lowest bit. */
function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1
  let written = ''
  do {
    let digit = rest & 31
    rest >>>= 5
    if (rest > 0) digit |= 32
    written += digits[digit]
  } while (rest > 0)
  return written
}

/** What kind of sign a character is: room, a sign of a name, or another sign, which is a piece of its own. */
const kindOf = (sign: string | undefined): number =>
  sign === undefined || /\s/.test(sign) ? 0 : /[\w$]/.test(sign) ? 1 : 2

/**
 * Takes the path of a file, its text, and what is written into it: each a place in the text and the words put there,
 * with no line ending among them. Answers the text with them, and the source map of the third version of the form
 * that leads each piece of it back to the file: so the builder, which is handed the text with the words in it,
 * makes maps that name the lines and columns of the file as it is written.
 */
export function insertedMap(
  path: string,
  text: string,
  inserts: { at: number; text: string }[],
): {
  code: string
  map: string
} {
  // Of two written at one place, the later stands first, as each is put in its place before what stands there.
  const sorted = inserts.map((one, k) => ({ ...one, k })).sort((a, b) => a.at - b.at || b.k - a.k)
  let code = ''
  let mappings = ''
  // The last column, line and column of the file that a segment named: each segment names the change since.
  let lastColumn = 0
  let lastLine = 0
  let lastSourceColumn = 0
  let column = 0
  let [line, sourceColumn] = [0, 0]
  let next = 0
  // The column of this line at which the last segment was written: no two segments name one column.
  let marked = -1
  const segment = (): void => {
    if (column === marked) return
    const comma = mappings !== '' && !mappings.endsWith(';') ? ',' : ''
    mappings += `${comma}${vlq(column - lastColumn)}A${vlq(line - lastLine)}${vlq(sourceColumn - lastSourceColumn)}`
    lastColumn = column
    lastLine = line
    lastSourceColumn = sourceColumn
    marked = column
  }
  segment()
  for (let at = 0; at <= text.length; at++) {
    // What is written at this place stands for the character of the file that follows it.
    let moved = false
    while (next < sorted.length && sorted[next].at === at) {
      code += sorted[next].text
      column += sorted[next].text.length
      next += 1
      moved = true
    }
    if (moved) segment()
    if (at === text.length) break
    const sign = text[at]
    // Each piece of a line - a name, a number, a sign - is led back to its own column.
    const kind = kindOf(sign)
    if (kind !== 0 && (kind === 2 || kind !== kindOf(text[at - 1]))) segment()
    code += sign
    if (sign === '\n') {
      mappings += ';'
      lastColumn = 0
      column = 0
      line += 1
      sourceColumn = 0
      marked = -1
      segment()
    } else {
      column += 1
      sourceColumn += 1
    }
  }
  // A source of a map is named from the place of the file it maps: the file itself, by its own name.
  const own = path.slice(path.lastIndexOf('/') + 1)
  const map = { version: 3, file: own, sources: [own], sourcesContent: [text], names: [], mappings }
  return { code, map: JSON.stringify(map) }
}
