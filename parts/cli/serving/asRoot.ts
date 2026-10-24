import { runsElevated } from '../../core/internal.ts'

/**
 * Whether this program runs as root, or on Windows with an administrator's rights: by the level of its own rights,
 * which a program with every right has also where the system's service of shared folders is off.
 */
export function runsAsRoot(): boolean {
  if (process.platform !== 'win32') return process.getuid?.() === 0
  return runsElevated()
}
