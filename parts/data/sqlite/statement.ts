// What closes each kind of quoted text of SQLite: https://sqlite.org/lang_keywords.html
const closes: Record<string, string> = { "'": "'", '"': '"', '`': '`', '[': ']' }

/**
 * Takes a raw SQL text. Answers whether it is one statement: something stands in it, and after the semicolon that
 * ends its first statement only white space and comments follow. A semicolon ends a statement where it stands in
 * no quoted text - between single quotes, double quotes, backticks or square brackets - and in no comment of either
 * kind. The runtime would compile the first statement of a longer text and drop the rest without a word.
 */
export function isOneStatement(text: string): boolean {
  let holds = false
  let ended = false
  let at = 0
  while (at < text.length) {
    const sign = text[at]
    if (sign === '-' && text[at + 1] === '-') {
      const line = text.indexOf('\n', at)
      at = line < 0 ? text.length : line + 1
    } else if (sign === '/' && text[at + 1] === '*') {
      const close = text.indexOf('*/', at + 2)
      at = close < 0 ? text.length : close + 2
    } else if (/\s/.test(sign)) at++
    else if (ended) return false
    else if (sign === ';') {
      ended = true
      at++
    } else {
      holds = true
      // A doubled quote inside a quoted text closes it and opens it again at once, so it needs no rule of its own.
      const close = closes[sign] ? text.indexOf(closes[sign], at + 1) : at
      at = close < 0 ? text.length : close + 1
    }
  }
  return holds
}
