import { existsSync } from 'node:fs'
import { TentError } from '../../core/index.ts'
import type { ValuesMode } from './files.ts'
import { readValues, valuesFile, writeValues } from './files.ts'
import { secretKeyAt, keyFile, secretKeyIn, keyText, noKeyAtHand } from './key.ts'
import { openText, sealText } from './sealing.ts'

/**
 * What a secret is bound to: the form of the file, the mode and the name, so that a value cannot be moved to
 * another name or to the other file.
 */
export const secretBound = (held: ValuesMode, name: string): string => `tent.secrets/1\n${held}\n${name}`

/** The words of the command that sets a secret of one of the two files. */
const commandOf = (held: ValuesMode, name: string): string =>
  `tent secrets set ${name}${held === 'live' ? ' --live' : ''}`

/** The secrets of one data folder, for test data or for live, as an engine or a command holds them. */
export interface SecretValues {
  /** The value of a secret. Throws T0019 for one that has no value, with no key at hand, and for a value that does not open. */
  value(name: string): string
  /** The names that are set. */
  names(): string[]
  /** Sets a secret, and writes the file. Throws T0019 with no key at hand, and where a value of the file does not open under the key. */
  set(name: string, value: string): void
  /** Takes a secret away, and writes the file. */
  remove(name: string): void
  /** Every value that opens, with the key itself as it is written, and the new key beside it: what is looked for in a log, and by the guard of a build. */
  known(): string[]
  /** Whether the file is there, and whether every value of it opens under the key at hand: with none at hand, none does. */
  state(): { there: boolean; opens: boolean }
  /** Reads the file anew, as after another program wrote it. */
  again(): void
}

/** Holds a name of a secret to a text that holds something. Throws T0002 for any other. */
function named(name: unknown): string {
  if (typeof name === 'string' && name !== '' && name !== 'then') return name
  throw new TentError('T0002', 'A secret is named by a text, and `then` names none.', { fields: { name: 'type' } })
}

/** Answers the secrets of a data folder, for test data or for live. Nothing is read before the first asking. */
export function secretValues(dataFolder: string, held: ValuesMode): SecretValues {
  const file = valuesFile(dataFolder, 'secrets', held)
  let sealed: Record<string, string> | undefined
  const read = (): Record<string, string> => {
    sealed ??= Object.fromEntries(
      Object.entries(readValues(file, 'secrets')).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
    return sealed
  }
  const opened = (name: string, key: Uint8Array): string | undefined =>
    Object.hasOwn(read(), name) ? openText(key, read()[name], secretBound(held, name)) : undefined
  /** The key, where every value of the file opens under it: a file that it does not open is written by nothing. */
  const keyOfFile = (what: string): Buffer => {
    const key = secretKeyAt(dataFolder)
    if (!key) throw noKeyAtHand(what)
    const closed = Object.keys(read()).filter((name) => opened(name, key) === undefined)
    if (closed.length)
      throw new TentError(
        'T0019',
        `The key at hand does not open ${file}: ${closed.join(', ')} ${closed.length === 1 ? 'was' : 'were'} sealed under another key. Nothing was written.`,
        {
          fix: 'Give the key that the file was written under, as `TENT_SECRET_KEY` or as `secret.key` of the data folder.',
        },
      )
    return key
  }
  return {
    value(name) {
      if (!Object.hasOwn(read(), name))
        throw new TentError('T0019', `The secret ${name} has no value on ${held} data.`, {
          fix: `Set it with \`${commandOf(held, name)}\`.`,
        })
      const key = secretKeyAt(dataFolder)
      if (!key) throw noKeyAtHand(`The secret ${name}`)
      // While a new key lies beside the key, a secret opens under the one of the two that fits it.
      const other = secretKeyIn(keyFile(dataFolder, '.next'))
      const value = opened(name, key) ?? (other ? opened(name, other) : undefined)
      if (value === undefined)
        throw new TentError(
          'T0019',
          `The secret ${name} does not open under this key, on ${held} data and under this name.`,
          { fix: `Give the key that it was set under, or set it again with \`${commandOf(held, name)}\`.` },
        )
      return value
    },
    names: () => Object.keys(read()).sort(),
    set(name, value) {
      const key = keyOfFile(`Setting the secret ${named(name)}`)
      writeValues(file, 'secrets', { ...read(), [name]: sealText(key, String(value), secretBound(held, name)) })
      sealed = undefined
    },
    remove(name) {
      const { [named(name)]: _, ...rest } = read()
      if (Object.keys(rest).length !== Object.keys(read()).length) writeValues(file, 'secrets', rest)
      sealed = undefined
    },
    known() {
      // While a new key lies beside the key the engine holds both, and every value that opens under either.
      const keys = [secretKeyAt(dataFolder), secretKeyIn(keyFile(dataFolder, '.next'))].filter(
        (key) => key !== undefined,
      )
      const values = Object.keys(read()).map((name) =>
        keys.map((key) => opened(name, key)).find((one) => one !== undefined),
      )
      return [...values.filter((value) => value !== undefined), ...keys.map(keyText)]
    },
    state() {
      const key = secretKeyAt(dataFolder)
      const names = Object.keys(read())
      return {
        there: existsSync(file),
        opens: names.length === 0 || (key !== undefined && names.every((name) => opened(name, key) !== undefined)),
      }
    },
    again() {
      sealed = undefined
    },
  }
}
