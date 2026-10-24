import type { Finding, More } from './errors.ts'
import { nameOf } from './errors.ts'

/**
 * Takes a code, a message, what else the finding carries, and its level, which is an error where none is given.
 * Answers the finding as a plain record, with the short word of the code and the command that explains it.
 */
export function finding(code: string, message: string, more: More = {}, level: Finding['level'] = 'error'): Finding {
  return { code, name: nameOf(code), message, ...more, level, docs: `tent docs ${code}` }
}
