import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** The folder of a data folder where the words read of each file are kept, under its fingerprint and its kind. */
export const textFolder = (dataFolder: string): string => join(dataFolder, 'cache', 'text')

/**
 * Takes a data folder and the fingerprint of bytes that no file holds any more. Takes away the words that were
 * read of them, as every kind they were read as: what a removed person gave is kept nowhere.
 */
export function forgetText(dataFolder: string, fingerprint: string): void {
  const folder = textFolder(dataFolder)
  if (!existsSync(folder)) return
  for (const name of readdirSync(folder))
    if (name.startsWith(`${fingerprint}.`)) rmSync(join(folder, name), { force: true })
}
