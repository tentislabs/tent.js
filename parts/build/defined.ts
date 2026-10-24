// What the files of a project define, as the steps that load them hand it on: whether a value is a definition, each
// definition as `describe` is handed it, and the definitions that a file makes where no export takes them.
import type { Loaded } from '../core/internal.ts'
import type { Why } from './read/arrows.ts'
import { whyText } from './read/arrows.ts'
import { spanOf } from './read/span.ts'
import type { Declared } from './read/scan.ts'
import { lineOf } from './tree.ts'
import type { SourceFile, Work } from './work.ts'
import { found } from './work.ts'

/** Whether a value is what a word that makes a definition returned: of the kind named, where one is. */
export const isDefinition = (made: unknown, kind?: string): made is object =>
  (typeof made === 'object' || typeof made === 'function') &&
  made !== null &&
  typeof Reflect.get(made, 'definition') === 'string' &&
  (kind === undefined ? typeof Reflect.get(made, 'kind') === 'string' : Reflect.get(made, 'kind') === kind)

/**
 * Takes a file, a definition it declares, what its word returned, and what was read of its arrows: the bodies of a
 * backend definition or the views of a screen and a component. Answers the definition as `describe` is handed it.
 */
export function loadedOf(
  file: SourceFile,
  declared: Declared,
  made: object,
  read: { bodies?: Record<string, object>; views?: Record<string, object>; why?: Why } | undefined,
): Loaded {
  return {
    value: made,
    file: file.path,
    line: lineOf(file.text, declared.statement.start),
    ...spanOf(declared),
    exportName: declared.exportName,
    ...(read?.bodies && Object.keys(read.bodies).length ? { bodies: read.bodies } : {}),
    ...(read?.views && Object.keys(read.views).length ? { views: read.views } : {}),
    ...(read?.why ? { why: whyText(read.why) } : {}),
  }
}

/** Reports each definition that a file makes where no top-level `export const` takes it: T1001. */
export function looseFound(work: Work, file: SourceFile): void {
  for (const one of file.seen?.loose ?? [])
    found(
      work,
      'T1001',
      file,
      one.node,
      `A \`${one.word}\` is made where no top-level \`export const\` takes it.`,
      `Write it as \`export const name = ${one.word}('name', { ... })\`, at the top of the file.`,
    )
}
