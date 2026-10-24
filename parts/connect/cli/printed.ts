/**
 * Takes a text that is to be printed to a terminal. Answers it with every control character but a line feed and a
 * tab written as its code, `\u001b` for an escape, so that no answer drives the terminal. Throws nothing.
 */
export function safe(text: string): string {
  return [...text]
    .map((one) => {
      const code = one.charCodeAt(0)
      const control = (code < 32 && code !== 10 && code !== 9) || (code >= 127 && code <= 159)
      return control ? `\\u${code.toString(16).padStart(4, '0')}` : one
    })
    .join('')
}

/**
 * A value as one line of JSON, with DEL and the controls of U+0080 to U+009F written as their codes as well, which
 * JSON leaves as they are: U+009B moves the cursor of a terminal of 8 bits.
 */
export const jsonLine = (value: unknown): string =>
  JSON.stringify(value).replace(/[\u007f-\u009f]/g, (one) => `\\u${one.charCodeAt(0).toString(16).padStart(4, '0')}`)

/** What a command prints of a value: a text as it is, a number as it is, and anything else as JSON with line breaks. */
export function printedOf(value: unknown): string {
  if (typeof value === 'string') return safe(value)
  if (typeof value === 'number') return String(value)
  if (value === undefined) return ''
  return safe(JSON.stringify(value, null, 2))
}

/** A wire error as the error output shows it: its code, name and message, a line for each field, and the fix. */
export function errorText(error: Record<string, unknown>): string {
  const fields: unknown = error.fields
  const lines = [`error ${String(error.code)} ${String(error.name)}: ${String(error.message)}`]
  if (typeof fields === 'object' && fields !== null)
    for (const [name, check] of Object.entries(fields)) lines.push(`  ${name}: ${String(check)}`)
  if (typeof error.fix === 'string') lines.push(`fix: ${error.fix}`)
  return `${safe(lines.join('\n'))}\n`
}

/** The edits between two words, for the nearest of the words a command knows. */
function distance(one: string, other: string): number {
  const row = Array.from({ length: other.length + 1 }, (_, k) => k)
  for (let i = 1; i <= one.length; i++) {
    let before = row[0]
    row[0] = i
    for (let j = 1; j <= other.length; j++) {
      const held = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, before + (one[i - 1] === other[j - 1] ? 0 : 1))
      before = held
    }
  }
  return row[other.length]
}

/** The known word nearest to one that was typed, where one is near enough to be meant. */
export function nearest(typed: string, known: string[]): string | undefined {
  let best: { word: string; edits: number } | undefined
  for (const word of known) {
    const edits = distance(typed, word)
    if (!best || edits < best.edits) best = { word, edits }
  }
  return best && best.edits <= Math.max(2, Math.floor(typed.length / 3)) ? best.word : undefined
}
