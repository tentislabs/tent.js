/**
 * Whether a text of JSON names one key twice in one record. `JSON.parse` keeps the last of two such keys without
 * a word, so a list of files that names one path twice would be read as naming it once. A text that is no JSON
 * answers false: the parse that follows refuses it.
 */
export function namesKeyTwice(text: string): boolean {
  // The keys of each record that is open, from the outermost in; a list stands as nothing.
  const open: (Set<string> | undefined)[] = []
  // Whether the next text read in a record is a key.
  let keyNext = false
  for (let k = 0; k < text.length; k++) {
    const c = text[k]
    if (c === '"') {
      let end = k + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      const keys = open.at(-1)
      if (keyNext && keys) {
        let key: string
        try {
          key = JSON.parse(text.slice(k, end + 1))
        } catch {
          return false
        }
        if (keys.has(key)) return true
        keys.add(key)
      }
      keyNext = false
      k = end
    } else if (c === '{') {
      open.push(new Set())
      keyNext = true
    } else if (c === '[') {
      open.push(undefined)
      keyNext = false
    } else if (c === '}' || c === ']') {
      open.pop()
      keyNext = false
    } else if (c === ',') keyNext = open.at(-1) !== undefined
  }
  return false
}
