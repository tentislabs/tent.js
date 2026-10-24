import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TentError } from '../../core/index.ts'
import { writeOwnerOnly } from '../../core/internal.ts'

// The variable that gives the key on a server, so that the data folder alone opens nothing, and the file that
// holds it on a person's computer.
const variable = 'TENT_SECRET_KEY'
const fileName = 'secret.key'

/** Reads a key as it is written wherever it stands: 32 bytes in the standard base64 with its filling. */
function keyOf(written: string | undefined): Buffer | undefined {
  const text = written?.trim() ?? ''
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) return undefined
  const key = Buffer.from(text, 'base64')
  return key.length === 32 ? key : undefined
}

/** Writes a key as it is written wherever it stands. */
export const keyText = (key: Uint8Array): string => Buffer.from(key).toString('base64')

/** A new key: 32 random bytes. */
export const newKey = (): Buffer => randomBytes(32)

/** The file of a data folder that holds its key, `secret.key`, or the file beside it of that name with an ending. */
export const keyFile = (dataFolder: string, ending = ''): string => join(dataFolder, `${fileName}${ending}`)

/** Reads the key that a file holds, or nothing where the file is not there or holds none. */
export function secretKeyIn(file: string): Buffer | undefined {
  try {
    return existsSync(file) ? keyOf(readFileSync(file, 'utf8')) : undefined
  } catch {
    return undefined
  }
}

// The keys that `engine.open` was handed for the apps of this program, by their data folders.
const given = new Map<string, Buffer>()

/**
 * Takes a data folder and a key as it is written. Has the app of that folder use that key alone, in place of the
 * variable and of its file, until `forgetGivenKey`. Throws T0013 for a text that is no key.
 */
export function giveKey(dataFolder: string, written: string): void {
  const key = keyOf(written)
  if (!key)
    throw new TentError('T0013', '`secretKey` is no key of the secrets: 32 bytes in the standard base64.', {
      fix: 'Hand it a key that `tent secrets key` prints.',
    })
  given.set(resolve(dataFolder), key)
}

/** Lets go of the key that an app of a data folder was handed, once it is closed. */
export const forgetGivenKey = (dataFolder: string): void => void given.delete(resolve(dataFolder))

/**
 * Takes a data folder. Answers the key of its secrets that is at hand: the one its app was handed, which wins over
 * all, the one that the variable `TENT_SECRET_KEY` gives, which wins over the file, or the one of the file
 * `secret.key` of the folder. Nothing where none holds a key.
 */
export const secretKeyAt = (dataFolder: string): Buffer | undefined =>
  given.get(resolve(dataFolder)) ?? keyOf(process.env[variable]) ?? secretKeyIn(keyFile(dataFolder))

/** Whether the key of this program is given by the variable, and not by a file of the data folder. */
export const keyIsGiven = (): boolean => keyOf(process.env[variable]) !== undefined

/** Writes a key into a file of a data folder, followed by one line feed, readable by the current user alone. */
export const writeSecretKey = (file: string, key: Uint8Array): void => writeOwnerOnly(file, `${keyText(key)}\n`)

/** The error of a use that needs the key of the secrets, with none at hand. */
export const noKeyAtHand = (what: string): TentError =>
  new TentError('T0019', `${what} needs the key of the secrets, and none is at hand.`, {
    fix: 'Give the engine the key as `TENT_SECRET_KEY`, or as the file `secret.key` of its data folder: `tent secrets set` makes that file on a computer of your own, and `tent secrets key` prints a new key.',
  })
