import { realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { lookedPlace } from './lookups.ts'

/**
 * Takes a path, however it is written. Answers the real place it names on the disk, written with `/`: with every
 * link on the way followed, each name in the case the disk holds it in, and no short name of the disk. Of a path
 * that names nothing, the part that is there is answered so, with the rest as it was written. Two paths name the
 * same file exactly where their places are the same text.
 */
export function placeOf(path: string): string {
  return lookedPlace('place', path, placeFound)
}

/** The real place of a path, as the disk answers it. */
function placeFound(path: string): string {
  const whole = resolve(path)
  try {
    return realpathSync.native(whole).replaceAll('\\', '/')
  } catch {
    const above = dirname(whole)
    // The top of a disk that is not there has nothing above it.
    if (above === whole) return whole.replaceAll('\\', '/')
    return `${placeOf(above).replace(/\/$/, '')}/${basename(whole)}`
  }
}
