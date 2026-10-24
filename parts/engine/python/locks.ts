import type { Description, Locked } from '../../core/internal.ts'
import { pythonOfLock } from '../../core/internal.ts'
import { pinnedPythons } from './tools.ts'

/**
 * Takes a description, one of its locks, and how the text of a lock is read by its file. Answers the text of the
 * lock, or nothing where it is not there. Definitions that need no package have no lock to be read: theirs is the
 * text of a lock that holds no package, for the Python of the named lock, of the project, or the newest the engine pins.
 */
export function lockText(
  description: Description,
  lock: Locked,
  read: (file: string) => string | undefined,
): string | undefined {
  const text = read(lock.file)
  if (text !== undefined || lock.entries.length) return text
  const version = pythonOfLock(description, lock.lock) ?? pinnedPythons().versions[0]
  return `# python ${version}\n# packages []\n`
}
