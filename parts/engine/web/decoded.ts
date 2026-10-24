/** A part of an address with its percent signs read, or nothing where a percent sign stands for no character. */
export function decoded(part: string): string | undefined {
  try {
    return decodeURIComponent(part)
  } catch {
    return undefined
  }
}

/** The name that an address gives after its prefix, its percent signs read, or as written where one stands for none. */
export function nameAfter(path: string, prefix: string): string {
  const written = path.slice(prefix.length)
  return decoded(written) ?? written
}
