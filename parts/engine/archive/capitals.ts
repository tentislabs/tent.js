import { lstat, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Asks a folder whether it tells two names that differ in capitals alone apart: it lays one name and looks for the
 * other. Answers true where the disk holds them as two, as a disk of Linux does.
 */
export async function tellsCapitalsApart(folder: string): Promise<boolean> {
  const laid = join(folder, '.tent-capitals')
  await writeFile(laid, '', { flag: 'wx' })
  try {
    return (await lstat(join(folder, '.TENT-CAPITALS')).catch(() => undefined)) === undefined
  } finally {
    await rm(laid, { force: true })
  }
}
