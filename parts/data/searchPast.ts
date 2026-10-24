import type { Row } from './store.ts'

// A letter as the index of a table reads it, with no capitals: the index takes the marks off Latin letters alone,
// so a Greek letter with its accent and a Cyrillic one with its mark stay letters of their own.
const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()

// A word of the index holds a letter or a digit: a sign that is neither parts words, as a space does.
const holdsWord = /[\p{L}\p{N}\p{Co}]/u

const wordsOf = (text: string): string[] => plain(text).match(/[\p{L}\p{N}\p{Co}]+/gu) ?? []

/**
 * Whether one typed word is found in a text as the index of its table finds it: by words, as its parts one after
 * another; by pieces, as a piece of the text, and a word of one or two characters as the start of a word.
 */
function holds(text: string, word: string, pieces: boolean): boolean {
  if (!holdsWord.test(word) && (!pieces || [...word].length < 3)) return true
  if (pieces)
    return [...word].length >= 3
      ? plain(text).includes(plain(word))
      : wordsOf(text).some((one) => one.startsWith(plain(word)))
  const parts = wordsOf(word)
  const all = wordsOf(text)
  return all.some((_, at) => parts.every((part, next) => all[at + next] === part))
}

/**
 * Takes a row, the searched columns that the caller may read, what was typed, and whether the table is searched by
 * pieces. Answers whether each typed word is found in one of those columns: a column that its rule keeps from the
 * caller is left out of what a search matches.
 */
export function foundIn(row: Row, columns: string[], typed: string, pieces: boolean): boolean {
  const texts = columns.map((column) => row[column]).filter((value): value is string => typeof value === 'string')
  const words = typed.normalize('NFC').split(/\s+/).filter(Boolean)
  return words.every((word) => texts.some((text) => holds(text, word, pieces)))
}
