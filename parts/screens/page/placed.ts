/** Where a tag was written: the file of the project, and the first and last character of the tag there. */
export interface TagPlace {
  file: string
  from: number
  to: number
}

/** A place of a tag with the screen or the component whose statement holds it, where one does. */
type Placed = TagPlace & { view?: string }

/** The place of a tag as React of development is told it, in the text that the builder was handed. */
interface Source {
  fileName?: string
  lineNumber?: number
  columnNumber?: number
}

// The places of the tags of each screen file of a development build, by `line:column`, as the file hands them.
const tables = new Map<string, Record<string, [number, number] | [number, number, string]>>()

// The place of the tag that made each element, by its properties: React keeps them on what it draws of the element.
const placed = new WeakMap<object, Placed>()

/** Takes a file of the project and the places of its tags, as the code that a development build writes into it hands them. */
function tagsOf(file: string, table: Record<string, [number, number] | [number, number, string]>): void {
  tables.set(file, table)
}

/** The place of a tag that React of development is told, where a file of the project handed it. */
function placeOf(source: Source | undefined): Placed | undefined {
  const name = source?.fileName?.replaceAll('\\', '/')
  if (name === undefined || source?.lineNumber === undefined || source.columnNumber === undefined) return undefined
  for (const [file, table] of tables) {
    if (!name.endsWith(`/${file}`) && name !== file) continue
    const at = table[`${source.lineNumber}:${source.columnNumber}`]
    if (!at) return undefined
    return at[2] === undefined ? { file, from: at[0], to: at[1] } : { file, from: at[0], to: at[1], view: at[2] }
  }
  return undefined
}

/** The place of a tag that is handed to React of development, read from what was handed. */
const sourceIn = (given: unknown): Source | undefined => {
  if (typeof given !== 'object' || given === null) return undefined
  const [fileName, lineNumber, columnNumber] = ['fileName', 'lineNumber', 'columnNumber'].map((name) =>
    Reflect.get(given, name),
  )
  return typeof fileName === 'string' && typeof lineNumber === 'number' && typeof columnNumber === 'number'
    ? { fileName, lineNumber, columnNumber }
    : undefined
}

/**
 * Takes the `jsxDEV` of React of development. Answers it as a module that is built against the page code calls it:
 * the element it makes is kept with the place of its tag in the file of the project that wrote it, which is the
 * fifth of what it is handed.
 */
export function placing<Handed extends unknown[], Made>(
  made: (...handed: Handed) => Made,
): (...handed: Handed) => Made {
  // A module of a development build hands the places of its tags by this name, once the page code has loaded.
  Reflect.set(globalThis, '__tentTags', tagsOf)
  return (...handed) => {
    const element = made(...handed)
    const place = placeOf(sourceIn(handed[4]))
    const held: unknown = typeof element === 'object' && element !== null ? Reflect.get(element, 'props') : undefined
    if (place && typeof held === 'object' && held !== null) placed.set(held, place)
    return element
  }
}

/** The place of the tag that made an element, by the properties that React keeps of it. */
export const placeOfProps = (props: object): Placed | undefined => placed.get(props)

/** Takes the properties of an element and those of a copy of it. Keeps the place of its tag with the copy. */
export function placedAs(props: object, copy: object): void {
  const place = placed.get(props)
  if (place) placed.set(copy, place)
}
