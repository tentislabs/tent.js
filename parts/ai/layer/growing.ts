/** A value read from the text so far, and whether the text ended inside it: a value that may not be whole yet. */
type Read = { value: unknown; cut: boolean } | undefined

/** What is read of the text from a place, and the place after it. */
interface At {
  text: string
  at: number
}

const space = (c: string | undefined): boolean => c === ' ' || c === '\n' || c === '\r' || c === '\t'

function skip(p: At): void {
  while (space(p.text[p.at])) p.at++
}

/**
 * Reads a text from its opening quote. One that the text ends inside is given as far as it has come, without an
 * escape that is cut in half.
 */
function readText(p: At): { value: string; cut: boolean } {
  p.at++
  let value = ''
  while (p.at < p.text.length) {
    const c = p.text[p.at]
    if (c === '"') {
      p.at++
      return { value, cut: false }
    }
    if (c !== '\\') {
      value += c
      p.at++
      continue
    }
    const next = p.text[p.at + 1]
    if (next === undefined) break
    if (next === 'u') {
      const hex = p.text.slice(p.at + 2, p.at + 6)
      if (hex.length < 4) break
      value += String.fromCharCode(Number.parseInt(hex, 16))
      p.at += 6
      continue
    }
    const escaped: Record<string, string> = {
      n: '\n',
      t: '\t',
      r: '\r',
      b: '\b',
      f: '\f',
      '/': '/',
      '\\': '\\',
      '"': '"',
    }
    value += escaped[next] ?? next
    p.at += 2
  }
  p.at = p.text.length
  return { value, cut: true }
}

/** Reads a number, `true`, `false` or `null`: one that reaches the end of the text may not be whole, and is cut. */
function readWord(p: At): Read {
  const from = p.at
  while (p.at < p.text.length && !/[\s,\]}]/.test(p.text[p.at])) p.at++
  const word = p.text.slice(from, p.at)
  if (p.at >= p.text.length) return { value: undefined, cut: true }
  if (word === 'true') return { value: true, cut: false }
  if (word === 'false') return { value: false, cut: false }
  if (word === 'null') return { value: null, cut: false }
  const n = Number(word)
  return word !== '' && Number.isFinite(n) ? { value: n, cut: false } : undefined
}

/** Reads one value from where it begins: an object or a list that is still open is closed where it stands. */
function readValue(p: At): Read {
  skip(p)
  const c = p.text[p.at]
  if (c === undefined) return { value: undefined, cut: true }
  if (c === '"') return readText(p)
  if (c === '{') return readObject(p)
  if (c === '[') return readList(p)
  return readWord(p)
}

function readObject(p: At): Read {
  p.at++
  const value: Record<string, unknown> = {}
  for (;;) {
    skip(p)
    const c = p.text[p.at]
    if (c === undefined) return { value, cut: true }
    if (c === '}') {
      p.at++
      return { value, cut: false }
    }
    if (c === ',') {
      p.at++
      continue
    }
    if (c !== '"') return undefined
    // A key that is cut, and one whose value has not begun, are left out.
    const key = readText(p)
    if (key.cut) return { value, cut: true }
    skip(p)
    if (p.text[p.at] === undefined) return { value, cut: true }
    if (p.text[p.at] !== ':') return undefined
    p.at++
    skip(p)
    if (p.text[p.at] === undefined) return { value, cut: true }
    const read = readValue(p)
    if (read === undefined) return undefined
    if (read.value !== undefined) value[key.value] = read.value
    if (read.cut) return { value, cut: true }
  }
}

function readList(p: At): Read {
  p.at++
  const value: unknown[] = []
  for (;;) {
    skip(p)
    const c = p.text[p.at]
    if (c === undefined) return { value, cut: true }
    if (c === ']') {
      p.at++
      return { value, cut: false }
    }
    if (c === ',') {
      p.at++
      continue
    }
    const read = readValue(p)
    if (read === undefined) return undefined
    if (read.value !== undefined) value.push(read.value)
    if (read.cut) return { value, cut: true }
  }
}

/**
 * Takes the text of a typed answer so far, as the model wrote it. Answers the value so far, or nothing until an
 * object or a list has begun: what stands before the first `{` or `[` is skipped. An object or a list that is still
 * open is closed where it stands, a text that is cut is given as far as it has come, and a number, `true`, `false`
 * or `null` that may not be whole yet, and a key whose value has not begun, are left out.
 */
export function valueSoFar(text: string): { value: unknown } | undefined {
  const begins = text.search(/[{[]/)
  if (begins < 0) return undefined
  const read = readValue({ text, at: begins })
  return read && read.value !== undefined ? { value: read.value } : undefined
}
