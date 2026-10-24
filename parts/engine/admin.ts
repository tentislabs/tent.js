import { TentError } from '../core/index.ts'
import type { Opened } from './opened.ts'

/**
 * A command of the admin channel: its name, and its work, which is handed what the engine holds of the app and
 * the words of the command by their names, and answers the value that the command prints.
 */
export interface Admin {
  name: string
  run(o: Opened, args: object): Promise<unknown>
}

/** The error of a word of a command that is missing or of another kind than the command takes. */
export const badWord = (name: string, takes: string): TentError =>
  new TentError('T0002', `The command takes ${takes} as \`${name}\`.`, { fields: { [name]: 'type' } })

/** Answers a word of a command that must be a text which holds something. Throws T0002 where it is not. */
export function wordOf(args: object, name: string, takes: string): string {
  const word: unknown = Reflect.get(args, name)
  if (typeof word !== 'string' || word === '') throw badWord(name, takes)
  return word
}
