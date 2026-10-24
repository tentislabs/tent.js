import type { Description } from '../../core/internal.ts'
import { locksOf } from '../../core/internal.ts'
import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import { readBundle } from '../open.ts'
import { valuesHeldFor } from '../values/files.ts'
import { secretValues } from '../values/secrets.ts'
import type { Environment } from './environment.ts'
import { environmentOf } from './environment.ts'
import { lockText } from './locks.ts'
import type { PythonParts } from './tools.ts'
import { holdsFile, filePlaceOf, textAt as versionText } from '../files.ts'
import { startedProgram } from '../rooms/inProgram/program.ts'

/** How a secret of a data folder is opened, in a mode: that of live data, or that of test data. */
export function secretOpener(data: { folder: string; mode: Mode } | undefined): (name: string) => string {
  const values = data ? secretValues(data.folder, valuesHeldFor(data.mode)) : undefined
  return (name) => {
    if (values) return values.value(name)
    throw new TentError('T0019', `The secret ${name} that \`python.index\` names has no value here.`, {
      fix: `Name the data folder that holds it, or set it with \`tent secrets set ${name}\`.`,
    })
  }
}

/**
 * Takes a bundle by its folder, or a description with how the text of each of its locks is read by its file, where
 * the parts are taken from, and the data folder whose secrets an index names. Makes the environment of each lock
 * ahead of the first call, as `tent python install` does. Answers each environment by its lock, and each lock that
 * could not be made into one, with its error: T0016, T7020 for a lock that is not there, and T0019 for a secret
 * that has no value. Throws T0011 for a folder that holds no bundle.
 */
export async function installEnvironments(
  o: ({ bundle: string } | { description: Description; lock(file: string): string | undefined }) & {
    parts?: PythonParts
    data?: { folder: string; mode: Mode }
  },
): Promise<{ environments: (Environment & { lock: string })[]; failed: { lock: string; error: TentError }[] }> {
  const description = 'bundle' in o ? readBundle(o.bundle).description : o.description
  const read = (file: string) =>
    'bundle' in o
      ? holdsFile(filePlaceOf(o.bundle), `python/${file}`)
        ? versionText(filePlaceOf(o.bundle), `python/${file}`)
        : undefined
      : o.lock(file)
  const stated = Object(description.project.python)
  const secret = secretOpener(o.data)
  const time = storedLimit(description, 'pythonInstall')
  const done: Awaited<ReturnType<typeof installEnvironments>> = { environments: [], failed: [] }
  for (const one of locksOf(description)) {
    const { file } = one
    const lock = lockText(description, one, read)
    if (lock === undefined) {
      done.failed.push({
        lock: file,
        error: new TentError('T7020', `${file} is not there.`, { fix: 'Run `tent python lock`.' }),
      })
      continue
    }
    try {
      // Ahead of any app, the installer is the person's own program, on the computer they made it on.
      const parts = { mode: 'live' as const, ...o.parts }
      const made = await environmentOf({ lock, stated, parts, secret, time, program: startedProgram })
      done.environments.push({ lock: file, ...made })
    } catch (error) {
      if (!(error instanceof TentError)) throw error
      done.failed.push({ lock: file, error })
    }
  }
  return done
}
