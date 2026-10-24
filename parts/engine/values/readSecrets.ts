import type { ValuesMode } from './files.ts'
import { secretValues } from './secrets.ts'

const both: ValuesMode[] = ['test', 'live']

/**
 * Takes a data folder. Answers the values of both secrets files that this computer can open, for the guard of a
 * build: with no key at hand, and for a file that the key does not open, none of that file.
 */
export function readSecrets(dataFolder: string): string[] {
  const values = new Set<string>()
  for (const held of both) {
    const secrets = secretValues(dataFolder, held)
    try {
      if (!secrets.state().opens) continue
      for (const name of secrets.names()) values.add(secrets.value(name))
    } catch {
      // A file that cannot be read holds nothing that can be looked for: `unreadSecrets` names it.
    }
  }
  return [...values]
}

/**
 * Takes a data folder. Answers the names of its secrets files that are there and that this computer cannot open:
 * the guard of a build then searched for none of their values, and the build says so.
 */
export function unreadSecrets(dataFolder: string): string[] {
  const closed: string[] = []
  for (const held of both) {
    const secrets = secretValues(dataFolder, held)
    try {
      const { there, opens } = secrets.state()
      if (there && !opens) closed.push(`secrets.${held}`)
    } catch {
      closed.push(`secrets.${held}`)
    }
  }
  return closed
}
