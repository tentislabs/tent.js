import { join } from 'node:path'
import { readSecrets, unreadSecrets } from '../engine/index.ts'

/**
 * Takes the folder of a project, and the data folder where another than its `.tent/` is meant. Answers what the
 * guard of a build is handed: the values of both secrets files of the data folder that this computer can open,
 * and the names of the files that it cannot open, of whose values the guard then searches for none.
 */
export function guardOf(
  folder: string,
  dataFolder: string = join(folder, '.tent'),
): { secrets: string[]; unsearched: string[] } {
  return { secrets: readSecrets(dataFolder), unsearched: unreadSecrets(dataFolder) }
}
