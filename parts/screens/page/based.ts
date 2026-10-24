/**
 * What a page is named by: an exported page lies under the base that `tent export` was given, any other at the root.
 * A screen in a frame of a chat app lies under the app's address, and carries the pass of its frame.
 */
interface Based {
  base?: string
  pass?: string
}

/** Where the files of the bundle lie for a page: under `/_t/b/`, and in an exported page under its base. */
export const filesAt = (page: Based): string => `${page.base ?? ''}/_t/b/`

// The addresses where a browser sets no header of its own: a file, and a picture of a file.
const passedAt = /^\/_t\/(files\/[^/?]+|img\/(?!a\/))/

/**
 * An address of the app as a page names it: a path of the app under the base of the page, and any other as it is.
 * A frame has no cookie of the app, so a file and a picture of one carry its pass.
 */
export function named(page: Based, address: string): string {
  if (!address.startsWith('/') || address.startsWith('//')) return address
  const at = `${page.base ?? ''}${address}`
  if (page.pass === undefined || !passedAt.test(address)) return at
  return `${at}${at.includes('?') ? '&' : '?'}pass=${encodeURIComponent(page.pass)}`
}
