// What a command asks of the system before it can do anything, begun before the parts are loaded. The player loads
// this file alone first, so it imports nothing but `core`.
import { askAccount } from '../core/internal.ts'

/**
 * Takes the words that were typed after `tent`. Begins what the command they name asks of the system first, so that
 * it runs beside the loading of the parts: on Windows the account of `tent start`, which only a program of the
 * system tells. The command waits for the answer where it needs it.
 */
export function askFirst(words: string[]): void {
  if (process.platform === 'win32' && words.find((word) => word !== '--json') === 'start') void askAccount()
}
