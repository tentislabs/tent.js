/**
 * Answers an address as an error tells it: with no name, no password and nothing after a question mark, so that
 * no key of an address reaches a log.
 */
export const shownOf = (address: URL): string => `${address.protocol}//${address.host}${address.pathname}`

/** The same of an address that the standard reader does not take, from its text. */
export const shownText = (written: string): string =>
  written.replace(/[?#].*$/s, '').replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, '$1')

/** The same of a host: what stands before an `@`, and from a slash or a question mark on, is cut off. */
export const shownHost = (written: string): string =>
  written
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/s, '')
    .replace(/^.*@/, '')

/**
 * Reads an address, against another one where it is written from there. Throws a `TypeError` for what is no
 * address: the error of the standard reader holds the whole text it was handed, and this one holds none of it.
 */
export function addressOf(written: string, from?: URL | string): URL {
  try {
    return new URL(written, from)
  } catch {
    throw new TypeError('What was handed over is no address.')
  }
}
