/** One word of a text of code, with its place: a name, or a sign. Text, comments and patterns are passed over. */
interface Token {
  word: string
  at: number
}

const isNameStart = (c: string): boolean => /[A-Za-z_$]/.test(c)
const isNamePart = (c: string): boolean => /[\w$]/.test(c)

// The words after which a slash opens a pattern, as after a sign, and not a division, as after a name or a number.
const beforePattern = [
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
  'of',
]

/** Whether a slash after this word opens a pattern, whose quotes are no text. */
const opensPattern = (last: Token | undefined): boolean =>
  last === undefined ||
  beforePattern.includes(last.word) ||
  (!isNamePart(last.word[0] ?? '') && ![')', ']', '}'].includes(last.word))

/** The place after the pattern that starts at a place, and its flags: a slash inside a class of letters ends nothing. */
function afterPattern(text: string, from: number): number {
  let k = from + 1
  let inClass = false
  while (k < text.length && text[k] !== '\n' && (inClass || text[k] !== '/')) {
    if (text[k] === '[') inClass = true
    else if (text[k] === ']') inClass = false
    k += text[k] === '\\' ? 2 : 1
  }
  k++
  while (k < text.length && isNamePart(text[k])) k++
  return k
}

/** The words of a text of code, outside its quotes, its comments and the text of a text with values. */
function tokensOf(text: string): Token[] {
  const tokens: Token[] = []
  // The depth of curly brackets at which each open text with values goes on.
  const templates: number[] = []
  let depth = 0
  let k = 0
  while (k < text.length) {
    const c = text[k]
    if (c === '/' && text[k + 1] === '/') {
      while (k < text.length && text[k] !== '\n') k++
    } else if (c === '/' && text[k + 1] === '*') {
      const end = text.indexOf('*/', k + 2)
      k = end < 0 ? text.length : end + 2
    } else if (c === '/' && opensPattern(tokens.at(-1))) {
      k = afterPattern(text, k)
    } else if (c === "'" || c === '"') {
      k++
      while (k < text.length && text[k] !== c) k += text[k] === '\\' ? 2 : 1
      k++
    } else if (c === '`' || (c === '}' && templates.at(-1) === depth)) {
      if (c === '}') templates.pop()
      else k++
      if (c === '}') k++
      // Inside a text with values, until its end or the next value.
      while (k < text.length && text[k] !== '`' && !(text[k] === '$' && text[k + 1] === '{'))
        k += text[k] === '\\' ? 2 : 1
      if (text[k] === '$') {
        templates.push(depth)
        k += 2
      } else k++
    } else if (isNameStart(c)) {
      const start = k
      while (k < text.length && isNamePart(text[k])) k++
      tokens.push({ word: text.slice(start, k), at: start })
    } else if (/\s/.test(c)) k++
    else {
      if (c === '{') depth++
      if (c === '}') depth--
      if (text.startsWith('...', k)) {
        tokens.push({ word: '...', at: k })
        k += 3
      } else {
        tokens.push({ word: c, at: k })
        k++
      }
    }
  }
  return tokens
}

// The signs that open and close a bracket, of any of the three kinds.
const opens = ['{', '(', '[']
const closes = ['}', ')', ']']

/**
 * The names that the pattern of a declaration gives, from its first sign to the one that closes it: in `[A, B]`
 * each name, and in `{ a, b: c }` each name that no colon follows and that is no value given in its place.
 * Answers the names, and the place after the pattern.
 */
function patternNames(tokens: Token[], from: number): { names: string[]; next: number } {
  const names: string[] = []
  let depth = 0
  let k = from
  for (; k < tokens.length; k++) {
    const { word } = tokens[k]
    if (opens.includes(word)) depth++
    else if (closes.includes(word)) {
      depth--
      if (depth === 0) break
    } else if (isNameStart(word[0] ?? '') && tokens[k + 1]?.word !== ':' && tokens[k - 1]?.word !== '=')
      names.push(word)
  }
  return { names, next: k + 1 }
}

// A statement that imports, over as many lines as it is written on. The word is joined from two, since a builder
// that reads this file as a module reads such a text in it as an import of its own.
const importsOf = new RegExp(`(?:^|\\n)\\s*${['im', 'port'].join('')}\\s+([^;'"]*?)\\s+from\\s+['"]([^'"]+)['"]`, 'g')

/**
 * The top-level names that a file gives itself, and those it imports from anywhere but our own entries: a record
 * cannot give such a name back, since it stores the value that was read. A definition, which a record holds by
 * its name, is left out. The file is read whole, as words: an import over several lines, and a name taken out of
 * a list or a record, are seen as one on a line of its own is.
 */
function namesOfFile(file: string, definitions: ReadonlySet<string>): Set<string> {
  const names = new Set<string>()
  const tokens = tokensOf(file)
  let depth = 0
  for (let k = 0; k < tokens.length; k++) {
    const { word } = tokens[k]
    if (opens.includes(word)) depth++
    else if (closes.includes(word)) depth--
    if (depth !== 0) continue
    if (word === 'const' || word === 'let' || word === 'var') {
      const next = tokens[k + 1]?.word ?? ''
      if (next === '{' || next === '[') {
        const found = patternNames(tokens, k + 1)
        for (const one of found.names) names.add(one)
        k = found.next - 1
      } else if (isNameStart(next[0] ?? '')) names.add(next)
    } else if (word === 'function' || word === 'class') {
      const next = tokens[k + 1]?.word === '*' ? tokens[k + 2]?.word : tokens[k + 1]?.word
      if (next && isNameStart(next[0] ?? '')) names.add(next)
    }
  }
  for (const [, what, from] of file.matchAll(importsOf)) {
    if (from.startsWith('tentjs') || /^type\s/.test(what)) continue
    const whole = /^([A-Za-z_$][\w$]*)/.exec(what)
    if (whole) names.add(whole[1])
    const all = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(what)
    if (all) names.add(all[1])
    const listed = /\{([^}]*)\}/.exec(what)
    for (const one of listed ? listed[1].split(',') : []) {
      const [given, local = given] = one
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)
        .map((part) => part.trim())
      if (local && !(local === given && definitions.has(local))) names.add(local)
    }
  }
  names.delete('')
  return names
}

/** The line of a place in a text, counted from 1. */
const lineAt = (text: string, at: number): number => text.slice(0, at).split('\n').length

/**
 * Takes the text of a definition as it stands, the text of its file, and the names of the definitions of the
 * project. Answers what of the text its record cannot give back, with its line: a name of the file read where a
 * value is written, and a spread. Nothing where the text can be written anew from its record. A name inside an
 * arrow is held the same way, since what tells a read inside an arrow from one outside it needs the reader of
 * source: a definition is then left as it was, and never written wrong.
 */
export function notInRecord(
  text: string,
  file: string,
  definitions: ReadonlySet<string>,
  name: string,
): string | undefined {
  const own = namesOfFile(file, definitions)
  for (const definition of definitions) own.delete(definition)
  const tokens = tokensOf(text)
  // The head of the statement, `export const name =`, names the definition itself.
  const head = tokens.findIndex((token) => token.word === name)
  for (const [k, token] of tokens.entries()) {
    if (k <= head) continue
    if (token.word === '...') return `ours holds a spread on line ${lineAt(text, token.at)}, which no record holds`
    if (!own.has(token.word)) continue
    const before = tokens[k - 1]?.word
    const after = tokens[k + 1]?.word
    if (before === '.') continue
    if (after === ':' && (before === '{' || before === ',')) continue
    return `ours reads ${token.word} on line ${lineAt(text, token.at)}, which no record holds`
  }
  return undefined
}
