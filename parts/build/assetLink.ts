import { realpathSync, statSync } from 'node:fs'
import { sep } from 'node:path'

/** What the system says of a path: its real place, with every link on the way followed, and whether a file lies there. */
interface System {
  real(path: string): string
  isFile(path: string): boolean
}

const runtime: System = {
  real: (path) => realpathSync(path),
  isFile: (path) => statSync(path).isFile(),
}

/**
 * Takes the folder `assets/` of a project and an entry of it that is a link. Answers the file that the link leads
 * to, where that is a file inside `assets/`, by its real place. Answers why it is no asset otherwise: a link to
 * nothing, to a folder, or to a place out of `assets/`, as a backend file of the project or a file that a build
 * made. Nothing of what such a link leads to is read.
 */
export function linked(assets: string, entry: string, system: System = runtime): { file: string } | { why: string } {
  let place: string
  let inside: string
  try {
    place = system.real(entry)
    inside = system.real(assets)
  } catch {
    return { why: 'leads to nothing' }
  }
  const slash = place.includes('\\') || inside.includes('\\') ? sep : '/'
  if (place !== inside && !place.startsWith(inside.endsWith(slash) ? inside : `${inside}${slash}`))
    return { why: 'leads out of assets/' }
  let file = false
  try {
    file = system.isFile(place)
  } catch {
    return { why: 'leads to nothing' }
  }
  return file ? { file: place } : { why: 'leads to a folder' }
}
