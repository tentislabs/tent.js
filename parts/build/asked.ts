import { posix } from 'node:path'

/** What may stand after the name of a file where the builder is asked for the file as something other than its code. */
const asBytes = ['raw', 'url', 'inline', 'no-inline', 'worker', 'sharedworker', 'worker-url', 'init']

/** Takes the name of a file as it was asked for. Answers the name alone, and what stood after it from the first `?` or `#` on. */
export function parted(asked: string): [name: string, after: string] {
  const at = asked.search(/[?#]/)
  return at < 0 ? [asked, ''] : [asked.slice(0, at), asked.slice(at)]
}

/** Whether what stands after the name of a file asks for the file as its text, as an address or as its bytes. */
export function asksForBytes(after: string): boolean {
  const query = after.replace(/#.*$/, '').replace(/^\?/, '')
  return [...new URLSearchParams(query).keys()].some((key) => asBytes.includes(key))
}

const styles = /\.(css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/

/** Whether a file is a style file, by its name. */
export const isStyle = (file: string): boolean => styles.test(parted(file)[0])

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// What may stand between two words of code and changes nothing: room, and a comment.
const room = '(?:\\s|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)'

// An address that a file makes from its own, as the builder reads it: with room and comments between its words.
const ownAddress = new RegExp(
  `new${room}+URL${room}*\\(${room}*(?:'([^'\\n]*)'|"([^"\\n]*)"|\`([^\`]*)\`)${room}*,${room}*import${room}*\\.${room}*meta${room}*\\.${room}*url`,
  'g',
)

/** What a search for the files that a text names is told: where the text lies, the folder of the project, the files that are held back, each by its real place, and what answers the real place of a path. */
export interface AskedIn {
  file: string
  root: string
  held: ReadonlySet<string>
  place(path: string): string
}

/** Where a written name leads from the file that holds it, as a path. */
function lies(written: string, around: AskedIn): string {
  const [name] = parted(written)
  return name.startsWith('/') ? posix.join(around.root, name) : posix.join(posix.dirname(around.file), name)
}

/** The held files that a written name stands for: one, or for a name with values in it every file that its form fits. */
function named(written: string, around: AskedIn): string[] {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(written)) return []
  if (!written.includes('${')) {
    const place = around.place(lies(written, around))
    return around.held.has(place) ? [place] : []
  }
  // The folder that stands before the first value is a real one: the form is held against real places from there on.
  const form = lies(written.replace(/\$\{[^}]*\}/g, '*'), around)
  const folder = form.slice(0, form.slice(0, form.indexOf('*')).lastIndexOf('/'))
  const real = `${around.place(folder)}${form.slice(folder.length)}`
  const fits = new RegExp(`^${real.split('*').map(escaped).join('.*')}$`)
  return [...around.held].filter((one) => fits.test(one))
}

/**
 * Takes the text of a file that the builder is about to read, and what stands around it. Finds every place where
 * the text asks for a held file in a way that no import passes: an address made from the file's own,
 * `new URL(..., import.meta.url)`, also with room, comments and values in it, and in a style file `url()`,
 * `@import` and any written text that names one. Tells `refuse` of each, with the file that was asked for and the
 * words that ask, and answers the text with each such place naming nothing, so that no byte of a held file is
 * read. Answers nothing where the text asks for none.
 */
export function cleaned(
  text: string,
  around: AskedIn,
  refuse: (held: string, words: string) => void,
): string | undefined {
  let found = false
  const asks = (written: string | undefined): boolean => {
    const hits = written === undefined ? [] : named(written, around)
    for (const one of hits) refuse(one, written ?? '')
    found ||= hits.length > 0
    return hits.length > 0
  }
  const [bare] = parted(around.file)
  if (styles.test(bare)) {
    const clean = text
      // An import of a style file is taken away whole: with nothing to name, the builder would fail on it.
      .replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?[^;\n]*;?/g, (whole, _, written) =>
        asks(written) ? '' : whole,
      )
      .replace(/url\(\s*([^'")\s][^)\s]*)\s*\)/g, (whole, plain) => (asks(plain) ? 'url("data:,")' : whole))
      .replace(/(['"])([^'"\n]+)\1/g, (whole, quote, written) => (asks(written) ? `${quote}data:,${quote}` : whole))
    return found ? clean : undefined
  }
  if (!text.includes('URL') || !text.includes('meta')) return undefined
  const clean = text.replace(ownAddress, (whole, single, double, valued) =>
    asks(single ?? double ?? valued) ? 'new URL("data:,", import.meta.url' : whole,
  )
  return found ? clean : undefined
}

/**
 * Takes the text of a file, what stands around it, and the real place of one held file. Answers the first written
 * name in the text that leads to that file, whatever stands around the name, or nothing. It is how the file that
 * asked is found where the builder told only which file it took in.
 */
export function namesIt(text: string, around: AskedIn, held: string): string | undefined {
  for (const found of text.matchAll(/(['"`])([^'"`\n]+)\1|url\(\s*([^'")\s]+)\s*\)/g)) {
    const written = found[2] ?? found[3]
    if (!/^\.{0,2}\//.test(written)) continue
    if (named(written, around).includes(held)) return written
  }
  return undefined
}
