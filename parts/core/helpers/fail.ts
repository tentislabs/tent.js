import { TentError } from '../errors.ts'

/**
 * Takes a code of the builder's own, words for the user, and the fields that failed, each with the builder's words
 * for it. It never returns: it throws the `TentError` that ends a query, a change or an action with an error the
 * caller sees. A code or a message that is no text is T0027: an error is made of text. A code of the form of a
 * framework code is T0013, since a caller would be sent what the framework means by it.
 */
export function fail(code: string, message: string, o?: { fields?: Record<string, string> }): never {
  if (typeof code !== 'string' || typeof message !== 'string')
    throw new TentError('T0027', 'fail cannot work with a code or a message that is no text.')
  if (/^T\d{4}$/.test(code))
    throw new TentError('T0013', `fail was handed ${code}, which has the form of a code of the framework.`, {
      fix: "Use a code of your own: a lowercase word with letters, digits and hyphens, as `fail('sold-out', ...)`.",
    })
  throw new TentError(code, message, o?.fields === undefined ? {} : { fields: o.fields })
}
