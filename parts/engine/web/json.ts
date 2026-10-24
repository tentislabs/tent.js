import { TentError } from '../../core/index.ts'

// How deep a JSON value of a call may nest.
const deepest = 64

const refused = (words: string): TentError =>
  new TentError('T0002', `The body of the call is refused: ${words}.`, {
    fields: { '': 'type' },
    fix: 'Send one JSON value, written as the standard says, in UTF-8.',
  })

const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const space = /[ \t\n\r]*/y

/**
 * Takes the bytes of the body of a call. Reads them as one JSON value, by the strict rules of the door, and
 * answers the value. Throws T0002 for bytes that are no UTF-8, for text that is no JSON, for a value that nests
 * more than 64 deep, for a key named `__proto__`, for two keys of one name in one record, for a number that is
 * not finite once it is read, and for a text that holds half of a character.
 */
export function readJson(bytes: Uint8Array): unknown {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw refused('it is no UTF-8, or holds half of a character')
  }
  let at = 0
  const skip = (): void => {
    space.lastIndex = at
    space.exec(text)
    at = space.lastIndex
  }
  const quoted = (): string => {
    const from = at++
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    if (at >= text.length) throw refused('a text does not end')
    at++
    let read: unknown
    try {
      read = JSON.parse(text.slice(from, at))
    } catch {
      throw refused('a text is not written as JSON writes one')
    }
    if (typeof read !== 'string' || !read.isWellFormed()) throw refused('a text holds half of a character')
    return read
  }
  const value = (depth: number): unknown => {
    if (depth > deepest) throw refused(`it nests more than ${deepest} deep`)
    skip()
    const sign = text[at]
    if (sign === '"') return quoted()
    if (sign === '{') {
      at++
      const record: Record<string, unknown> = {}
      skip()
      if (text[at] === '}') {
        at++
        return record
      }
      for (;;) {
        skip()
        if (text[at] !== '"') throw refused('a record holds something that is no key')
        const key = quoted()
        if (key === '__proto__') throw refused('a key is named `__proto__`')
        if (Object.hasOwn(record, key)) throw refused(`the key \`${key.slice(0, 40)}\` stands twice in one record`)
        skip()
        if (text[at++] !== ':') throw refused('a key has no value')
        record[key] = value(depth + 1)
        skip()
        const next = text[at++]
        if (next === '}') return record
        if (next !== ',') throw refused('a record does not end')
      }
    }
    if (sign === '[') {
      at++
      const list: unknown[] = []
      skip()
      if (text[at] === ']') {
        at++
        return list
      }
      for (;;) {
        list.push(value(depth + 1))
        skip()
        const next = text[at++]
        if (next === ']') return list
        if (next !== ',') throw refused('a list does not end')
      }
    }
    for (const [word, meant] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const)
      if (text.startsWith(word, at)) {
        at += word.length
        return meant
      }
    number.lastIndex = at
    const digits = number.exec(text)?.[0]
    if (!digits) throw refused('it is no JSON')
    at += digits.length
    if (!Number.isFinite(Number(digits))) throw refused(`the number ${digits.slice(0, 40)} is too large to hold`)
    return Number(digits)
  }
  const read = value(1)
  skip()
  if (at < text.length) throw refused('something stands after its one value')
  return read
}
