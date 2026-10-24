import { TentError } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import type { ValuesAsked } from '../engine/index.ts'
import { makeSecretKey, storedValues } from '../engine/index.ts'
import { guardOf } from './guarded.ts'
import type { Asked } from './reach.ts'
import { askedOfRunning, dataFolderOf } from './reach.ts'
import { valuesFar } from './valuesFar.ts'

/** What a command of the secrets or the settings is asked for, in the words of the admin channel. */
const wordsOf = (asked: ValuesAsked): object => ({
  do: asked.list ? 'list' : asked.remove ? 'remove' : 'set',
  ...(asked.name === undefined ? {} : { name: asked.name }),
  ...(asked.value === undefined ? {} : { value: asked.value }),
  ...(asked.live ? { live: true } : {}),
  ...(asked.written ? { written: true } : {}),
})

/**
 * Takes the folder of a project and the data folder that `--data` named, if any, and what is asked of its secrets
 * or its settings. With an engine running on the data folder, the value is handed to it over the admin channel:
 * the engine, which holds the key, writes the file and uses the new value. With none running the command writes
 * the file itself, and needs the project for it, which says what the settings are. The key file of the folder is
 * made only where no key is given, none lies there, and no secrets file is there yet: so no key file is ever made
 * on a server beside a running engine. Answers what the command prints, or as findings what stopped it.
 */
export async function valuesTold(
  o: { folder: string; data?: unknown; to?: unknown; insecure?: unknown },
  asked: ValuesAsked,
): Promise<Asked> {
  const dataFolder = dataFolderOf(o)
  const sets = asked.kind === 'secrets' && !asked.list && !asked.remove
  try {
    // With `--to` the value goes to the engine of a far server, which holds its own key.
    if (typeof o.to === 'string') return await valuesFar(o.to, o.insecure, asked)
    let running = await askedOfRunning(o, asked.kind, wordsOf(asked))
    // An engine makes no key: where it has none at hand, the command makes the file by the one rule, and asks again.
    if (running && Reflect.get(Object(running.value), 'key') === false) {
      if (!makeSecretKey(dataFolder)) return { findings: [noKey] }
      running = await askedOfRunning(o, asked.kind, wordsOf(asked))
    }
    if (running) return running
    // The build tools are loaded where a project is built, and a player that holds none runs every other way.
    const { buildProject } = await import('../build/index.ts')
    const built = await buildProject(o.folder, { for: 'dev', ...guardOf(o.folder, dataFolder) })
    if (built.findings.some((one) => one.level === 'error')) return { findings: built.findings }
    if (sets) makeSecretKey(dataFolder)
    return { value: storedValues(dataFolder, built.description, asked) }
  } catch (error) {
    if (!(error instanceof TentError)) throw error
    return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
  }
}

const noKey = finding('T0019', 'The secret was not set: no key of the secrets is at hand, and none was made.', {
  fix: 'Give the engine the key as `TENT_SECRET_KEY`. On a server the variable stands with the engine, and not in the shell of the person who types: `tent secrets key` prints a new key.',
})
