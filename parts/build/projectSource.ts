// The source of a project as a build read it, in the form the rules of the check read it.
import type { Node } from './tree.ts'
import type { Work } from './work.ts'

/** The source of a project, as the check reads it: for each file where it lies, its text, and the tree that the builder's reader gave. */
export type Source = Record<string, { file: string; text: string; tree?: Node }>

/** Takes the work of a build. Answers the source of the project as that build read it. */
export function sourceOf(work: Work): Source {
  const source: Source = {}
  for (const file of work.files.values())
    source[file.path] = { file: file.file, text: file.text, ...(file.tree ? { tree: file.tree } : {}) }
  return source
}
