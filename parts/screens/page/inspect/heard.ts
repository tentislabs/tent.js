import { isPath } from '../../../core/internal.ts'

// What comes from a tool is held to its form before it finds an element: a value of another form finds nothing.

/** A file of a project, by its path from the project's folder, which climbs out of nothing. */
const filePath = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** A place of a tag: the file and the first and last character of it there. */
export function placeHeld(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const [file, from, to] = ['file', 'from', 'to'].map((name) => Reflect.get(value, name))
  if (typeof file !== 'string' || file.length > 500 || !filePath.test(file) || file.split('/').includes('..'))
    return undefined
  return isCount(from) && isCount(to) && from <= to ? { file, from, to } : undefined
}

/** The places of the uses that an element is drawn inside, each a place. */
export function usesHeld(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value) || value.length > 50) return undefined
  const held = value.map((one) => placeHeld(one))
  return held.every((one) => one !== undefined) ? held : undefined
}

// A color of CSS: `#` with 3, 4, 6 or 8 hex digits; one of its functions, holding letters, digits, spaces and the
// signs of a color alone; or a name of a color, which is letters alone.
const hex = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const functions = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([A-Za-z0-9 .,%/+-]*\)$/
const named = /^[a-zA-Z]+$/

/** A color, in the form of a color of CSS. */
export const colorHeld = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= 200 && (hex.test(value) || functions.test(value) || named.test(value))
    ? value
    : undefined

/** A path of the app, which leads to no other site and to no address of the engine. */
export const pathHeld = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= 2000 && isPath(value) && !/^\/_t(\/|$|\?|#)/.test(value)
    ? value
    : undefined
