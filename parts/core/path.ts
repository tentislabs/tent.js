/** Whether a text, read once, is a path: it starts with one `/`, and holds no `//`, no `\` and no control character. */
function isPathOnce(path: string): boolean {
  if (!path.startsWith('/') || path.includes('//') || path.includes('\\')) return false
  for (const sign of path) if (sign.charCodeAt(0) < 32 || sign.charCodeAt(0) === 127) return false
  return true
}

/**
 * Whether a text is a path of an app: it starts with one `/`, and holds no `//`, no `\` and no control character.
 * The rule is held on the text as it is written, and once more with its percent signs read, and a text whose
 * percent signs stand for nothing is no path. So nothing that is handed in as a path leads out of the app: as a
 * link, as an address that is asked for, or as the place a pass leads to.
 */
export function isPath(path: string): boolean {
  if (!isPathOnce(path)) return false
  try {
    return isPathOnce(decodeURIComponent(path))
  } catch {
    return false
  }
}
