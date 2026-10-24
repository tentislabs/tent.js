import { insertedMap } from './insertMap.ts'
import { walk } from './tree.ts'
import type { SourceFile } from './work.ts'

/** One thing that is written into the text of a screen file: where, and what. */
type Insert = { at: number; text: string }

/**
 * Takes a screen file of a development build and what is written into its text before it. Answers the statement
 * that is written at its end: it hands the page code the first and last character of every tag of the file, as
 * `places` counts them, with the screen or the component whose statement holds it, by the line and the column at
 * which the builder's own step tells React of development the tag stands, in the text as it is handed over. So the
 * inspect mode and the overlay name the tag of the file that drew an element, also a tag of a package's component,
 * and no element and no property is added to the page. A tag in a stretch of `gone`, which the text no longer
 * holds, is not told.
 */
export function tagTable(file: SourceFile, inserts: Insert[], gone: { start: number; end: number }[] = []): Insert[] {
  if (!file.tree) return []
  const table: Record<string, [number, number] | [number, number, string]> = {}
  const shifts = inserts.map((one) => ({ at: one.at, by: one.text.length }))
  // Where a place of the file stands in the text as it is handed over: each insert at or before it moves it on.
  const handed = (at: number): number => at + shifts.filter((one) => one.at <= at).reduce((all, one) => all + one.by, 0)
  const written = insertedMap(file.path, file.text, inserts).code
  const starts = [0]
  for (let k = 0; k < written.length; k++) if (written[k] === '\n') starts.push(k + 1)
  walk(file.tree, (node) => {
    if (node.type !== 'JSXElement' || gone.some((one) => one.start <= node.start && node.end <= one.end)) return
    const at = handed(node.start)
    let line = starts.length - 1
    while (starts[line] > at) line -= 1
    const view = file.seen?.declared.find(
      (one) =>
        (one.word === 'screen' || one.word === 'component') &&
        one.statement.start <= node.start &&
        node.start < one.statement.end,
    )?.name
    table[`${line + 1}:${at - starts[line] + 1}`] =
      view === undefined ? [node.start, node.end - 1] : [node.start, node.end - 1, view]
  })
  if (!Object.keys(table).length) return []
  const statement = `;Reflect.get(globalThis, '__tentTags')?.(${JSON.stringify(file.path)}, ${JSON.stringify(table)});`
  return [{ at: file.text.length, text: statement }]
}
