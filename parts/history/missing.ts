import { TentError } from '../core/index.ts'

/** The failure for a point or a blob that is not there, or whose content does not fit its id: T9107, which names it. */
export const missing = (what: 'point' | 'blob', id: string, words: string): TentError =>
  new TentError('T9107', words, {
    fields: { [what]: id },
    fix: 'Name a point that `tent history` lists. A point that was dropped holds no files any more.',
  })
