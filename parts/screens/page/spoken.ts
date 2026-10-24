import { isStored, pageWords } from '../../core/internal.ts'

/** The words of one language by their keys: a text, or a record of plural forms. */
export type Words = Record<string, string | Record<string, string>>

/** A message as a view holds it: its key, or the parts of its key, and the values of its places. */
export interface MessageHeld {
  message: string | readonly unknown[]
  with?: Record<string, unknown>
}

/** The framework's own words, in English, which a language file may give anew under the same keys. */
export const ownWords: Words = {
  ...pageWords,
  'tent.required': 'This is needed.',
  'tent.type': 'This is not a valid value.',
  'tent.min': 'At least {min}.',
  'tent.max': 'At most {max}.',
  'tent.pattern': 'This does not have the right form.',
  'tent.values': 'Pick one of the choices.',
  'tent.kinds': 'This kind of file is not accepted.',
  'tent.maxSize': 'The file is too large: at most {maxSize}.',
  'tent.unknown': 'This field is not known.',
  'tent.failed': 'Something went wrong. Try again.',
  'tent.noEngine': 'No engine stands behind this page: nothing can be called from it.',
  'tent.chat.outOfDate': 'This view is out of date: ask for it again in the chat.',
  'tent.chat.notShown': 'This view could not be shown.',
  'tent.chat.noConnection': 'The chat app lets this view connect to nothing, so this cannot be done here.',
}

// The languages that are written from right to left, by the first part of their code.
const leftward = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'ha', 'he', 'iw', 'ks', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi'])

/** Whether a language is written from right to left. */
export const isLeftward = (language: string): boolean => leftward.has(language.toLowerCase().split('-')[0])

/** Whether a value is a message, as `message(...)` makes it and a screen's arrows store it. */
export const isMessage = (value: unknown): value is MessageHeld =>
  isStored(value) &&
  (typeof value.message === 'string' || Array.isArray(value.message)) &&
  Object.keys(value).every((key) => key === 'message' || key === 'with')

/** The key of a message: its parts joined with dots. */
const keyOf = (held: MessageHeld): string =>
  typeof held.message === 'string' ? held.message : held.message.map((part) => String(part)).join('.')

/** The words that a file of words holds: each entry that is a text, or a record of texts. */
export function wordsIn(given: Record<string, unknown>): Words {
  const found: Words = {}
  for (const [key, one] of Object.entries(given)) {
    if (typeof one === 'string') found[key] = one
    else if (isStored(one))
      found[key] = Object.fromEntries(
        Object.entries(one).filter((form): form is [string, string] => typeof form[1] === 'string'),
      )
  }
  return found
}

/**
 * Takes the messages of the app by language, the language of the page, and the languages of the project. Answers
 * the words that a page in that language shows: its own, over those of the default language, over the framework's.
 */
export function wordsOf(messages: unknown, language: string, languages: readonly string[]): Words {
  const of = (code: string | undefined): Words =>
    code !== undefined && isStored(messages) && isStored(messages[code]) ? wordsIn(messages[code]) : {}
  return { ...ownWords, ...of(languages[0]), ...of(language) }
}

/**
 * Takes the words of a page, a key, the values of its places, and the language. Answers the text: a plural message
 * takes the form of `count` by the rules of the language, and the form `zero` for 0 where it gives one. A place
 * whose value is a number is written in the language. A key that no message has answers itself.
 */
export function textOf(words: Words, key: string, values: Record<string, unknown> = {}, language = 'en'): string {
  const entry = Object.hasOwn(words, key) ? words[key] : undefined
  if (entry === undefined) return key
  let text: string
  if (typeof entry === 'string') text = entry
  else {
    const count = Number(values.count)
    const form = count === 0 && entry.zero !== undefined ? 'zero' : new Intl.PluralRules(language).select(count)
    text = entry[form] ?? entry.other ?? ''
  }
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (place, name: string) => {
    if (!Object.hasOwn(values, name)) return place
    const value = values[name]
    return typeof value === 'number' ? new Intl.NumberFormat(language).format(value) : String(value ?? '')
  })
}

/** The text of a message in the language of the page. */
const messageText = (held: MessageHeld, words: Words, language: string): string =>
  textOf(words, keyOf(held), isStored(held.with) ? held.with : {}, language)

/** A text or a message, as one text in the language of the page, or nothing where it is neither. */
export function spokenText(value: unknown, words: Words, language: string): string | undefined {
  if (isMessage(value)) return messageText(value, words, language)
  return typeof value === 'string' ? value : undefined
}
