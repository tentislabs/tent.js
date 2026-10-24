import type { TableLayout } from '../store.ts'
import { q } from './names.ts'

// The text search of the runtime's SQLite: https://sqlite.org/fts5.html
// By words the index is made with no word of its own, which reads a letter with a mark as the letter without it and
// leaves the dotless i of Turkish a letter of its own. By pieces of three characters the same holds with the marks
// taken away by its own word. Neither is ever made so that capitals count.
const byPieces = "tokenize='trigram remove_diacritics 1'"
// The second index of a table that is searched by pieces: by words, with the starts of one and two characters kept.
const byStarts = "prefix='1 2'"

const indexOf = (table: string): string => `${table}__search`

/** The name of the table that holds the search index of a table: it is there where the store keeps the index. */
export const searchIndexName = indexOf
const startsOf = (table: string): string => `${table}__starts`

/** The indexes of a table, each with the words it is made with. */
const indexesOf = (layout: TableLayout): [string, string][] =>
  layout.by === 'pieces'
    ? [
        [indexOf(layout.name), byPieces],
        [startsOf(layout.name), byStarts],
      ]
    : [[indexOf(layout.name), '']]

/**
 * Takes the layout of a table. Answers the statements that make its search index over the rows the table holds,
 * and the triggers by which the store keeps it in step with every row that is written. A table that is searched by
 * pieces has a second index beside the first, by words, for what was typed in one or two characters.
 */
export function searchSql(layout: TableLayout): string[] {
  if (!layout.search.length) return []
  const table = q(layout.name)
  const columns = layout.search.map(q).join(', ')
  const values = (row: string) => layout.search.map((column) => `${row}.${q(column)}`).join(', ')
  const indexes = indexesOf(layout)
  const take = indexes
    .map(
      ([name]) =>
        `INSERT INTO ${q(name)} (${q(name)}, rowid, ${columns}) VALUES ('delete', old."_n", ${values('old')});`,
    )
    .join(' ')
  const give = indexes
    .map(([name]) => `INSERT INTO ${q(name)} (rowid, ${columns}) VALUES (new."_n", ${values('new')});`)
    .join(' ')
  const trigger = (what: string, on: string, does: string) =>
    `CREATE TRIGGER ${q(`${indexOf(layout.name)}__${what}`)} AFTER ${on} ON ${table} BEGIN ${does} END`
  return [
    ...indexes.map(
      ([name, words]) =>
        `CREATE VIRTUAL TABLE ${q(name)} USING fts5(${columns}, content=${q(layout.name)}, content_rowid='_n'${words ? `, ${words}` : ''})`,
    ),
    trigger('add', 'INSERT', give),
    trigger('remove', 'DELETE', take),
    trigger('change', `UPDATE OF ${columns}`, `${take} ${give}`),
    ...indexes.map(([name]) => `INSERT INTO ${q(name)} (${q(name)}) VALUES ('rebuild')`),
  ]
}

/** Answers the statements that take the search index of a table away, with the triggers that kept it in step. */
export function dropSearchSql(table: string): string[] {
  return [
    ...['add', 'remove', 'change'].map((what) => `DROP TRIGGER IF EXISTS ${q(`${indexOf(table)}__${what}`)}`),
    ...[indexOf(table), startsOf(table)].map((name) => `DROP TABLE IF EXISTS ${q(name)}`),
  ]
}

/** A typed word as the index is asked for it: a text in double quotes, so that no sign in it is a word of the index's own. */
const asked = (word: string): string => `"${word.replaceAll('"', '""')}"`

// A word of the index holds a letter or a digit: a sign that is neither parts words, as a space does.
const holdsWord = /[\p{L}\p{N}\p{Co}]/u

/**
 * Takes the layout of a searched table, the name its rows are read under, and what was typed. Answers the joins
 * that keep the rows which hold each typed word, in any order and in any searched column, with the texts they ask
 * the indexes for, and the rank of each row by them, the best the least, as the index's own measure gives it
 * (`bm25`). Answers nothing where no typed word is left to look for: every row then fits.
 * By words, a typed word is looked for as its parts one after another. By pieces every character of a typed word
 * counts, and a word of one or two characters is asked of the second index, as the start of a word.
 */
export function searchJoins(
  layout: TableLayout,
  rows: string,
  typed: string,
): { sql: string; rank: string; values: string[] } | undefined {
  const words = typed.normalize('NFC').split(/\s+/).filter(Boolean)
  const pieces = layout.by === 'pieces'
  const whole = words.filter((word) => (pieces ? [...word].length >= 3 : holdsWord.test(word))).map(asked)
  const starts = pieces
    ? words.filter((word) => [...word].length < 3 && holdsWord.test(word)).map((word) => `${asked(word)}*`)
    : []
  const parts: [string, string[]][] = [
    [indexOf(layout.name), whole],
    [startsOf(layout.name), starts],
  ]
  const used = parts.filter(([, texts]) => texts.length)
  if (!used.length) return undefined
  // Each index is read once under a name of its own beside the rows: a row is found once in each.
  const named = used.map((_, k) => `${rows.slice(0, -1)}_found${k}"`)
  const sql = used
    .map(
      ([name], k) =>
        ` JOIN (SELECT rowid AS "n", rank AS "rank" FROM ${q(name)} WHERE ${q(name)} MATCH ?) AS ${named[k]} ON ${named[k]}."n" = ${rows}."_n"`,
    )
    .join('')
  return {
    sql,
    rank: named.map((one) => `${one}."rank"`).join(' + '),
    values: used.map(([, texts]) => texts.join(' ')),
  }
}
