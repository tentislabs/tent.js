import { runsElevated } from '../../core/internal.ts'

/**
 * Takes the words of `tent start` as a test types them, and whether the test's program runs with the rights of an
 * administrator, read from the program itself where it is not given. Answers them with `--as-root` right after
 * `start` where it does, since such a start is refused without it, and as they are where it does not. Throws for
 * words that hold no `start`.
 */
export function startWords(words: string[], elevated = process.platform === 'win32' && runsElevated()): string[] {
  const at = words.indexOf('start')
  if (at < 0) throw new Error(`the words of tent start hold start: ${words.join(' ')}`)
  return elevated ? [...words.slice(0, at + 1), '--as-root', ...words.slice(at + 1)] : words
}
