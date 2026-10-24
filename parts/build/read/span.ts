import { kid, unwrap } from '../tree.ts'
import type { Declared } from './scan.ts'

/**
 * Takes a definition as its file writes it. Answers its place in the text of the file, counted with one line
 * ending: the first character of `export`, and the closing bracket of the call of its word. Two definitions of one
 * statement start at the same place.
 */
export function spanOf(declared: Declared): { from: number; to: number } {
  const call = unwrap(kid(declared.node, 'init') ?? declared.node)
  return { from: declared.statement.start, to: call.end - 1 }
}
