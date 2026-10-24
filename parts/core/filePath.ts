/**
 * Takes a path of a file inside a folder, with `/` between its names. Answers why it may not be laid on a disk of
 * one of the three systems inside that folder, or nothing where it may: it is empty, names a place by itself, climbs
 * out with `..`, holds a backslash, a colon, a control character or a sign that Windows takes for another thing, or
 * has a name that ends with a dot or a space, which Windows reads without it.
 */
export function filePathFault(path: string): string | undefined {
  if (path === '' || path.includes('\0')) return 'it has no name'
  if (path.includes('\\')) return 'it holds a backslash'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'it names a place by itself'
  if (path.includes(':')) return 'it holds a colon'
  for (const name of path.split('/')) {
    if (name === '' || name === '.' || name === '..') return 'it climbs out of its folder'
    if (/[. ]$/.test(name)) return 'a name of it ends with a dot or a space'
    // Windows refuses these signs in a name, with every character below 32: https://learn.microsoft.com/windows/win32/fileio/naming-a-file
    if (/[<>"|?*]/.test(name) || [...name].some((one) => one.charCodeAt(0) < 32))
      return 'it holds a sign that a disk of Windows takes for another thing'
  }
  return undefined
}
