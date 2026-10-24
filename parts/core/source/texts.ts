import { sizeIn, timeIn } from '../time.ts'

/** Whether a text is a name that may follow a dot and stand as a key with no quotes. */
export const isName = (text: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)

const escapes: Record<string, string> = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' }

/** A character that no written text holds as it is, written by its number. */
const numbered = (sign: string): string => `\\u${sign.charCodeAt(0).toString(16).padStart(4, '0')}`

/** Whether a sign is one that no line of a written text may hold as it is: a control sign, or one that ends a line. */
const isControl = (sign: string): boolean => {
  const code = sign.charCodeAt(0)
  return code < 32 || code === 127 || code === 0x2028 || code === 0x2029
}

/** The inside of a written text: a backslash, the end of a line and every sign that no line may hold are escaped, and so is each sign of `more`. */
function inside(text: string, more: RegExp): string {
  const escaped = text.replace(/[\\\n\r\t]/g, (sign) => escapes[sign]).replace(more, (sign) => `\\${sign}`)
  return [...escaped].map((sign) => (isControl(sign) ? numbered(sign) : sign)).join('')
}

/** A text in single quotes. */
export const quoted = (text: string): string => `'${inside(text, /'/g)}'`

/** A piece of a text in backticks: a backtick and `${` are escaped too. */
export const inBackticks = (text: string): string => inside(text, /`|\$(?=\{)/g)

/** A key of a record: a name as it is, and anything else in single quotes. */
export const keyText = (key: string): string => (isName(key) ? key : quoted(key))

/** A length of time in words, in the largest unit that says it exactly. What is no whole number of milliseconds stays a number. */
export function timeWords(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0) return String(ms)
  const { n, unit } = timeIn(ms)
  return quoted(`${n} ${unit}${n === 1 || unit === 'ms' ? '' : 's'}`)
}

/** A size in words, in the largest unit that says it exactly. What is no whole number of kilobytes stays a number of bytes. */
export function sizeWords(bytes: number): string {
  const size = sizeIn(bytes)
  return size ? quoted(`${size.n} ${size.unit}`) : String(bytes)
}
