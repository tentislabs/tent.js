// The names of the characters from 160 to 255, in their order: the letters and the signs of the western languages.
const latin =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'

// The other named characters that a page of plain words is most often written with, each by its number. A name
// that is none of these is left as it stands.
const others: Record<string, number> = {
  amp: 38,
  lt: 60,
  gt: 62,
  quot: 34,
  apos: 39,
  trade: 8482,
  hellip: 8230,
  mdash: 8212,
  ndash: 8211,
  lsquo: 8216,
  rsquo: 8217,
  sbquo: 8218,
  ldquo: 8220,
  rdquo: 8221,
  bdquo: 8222,
  bull: 8226,
  euro: 8364,
  larr: 8592,
  rarr: 8594,
  minus: 8722,
  ne: 8800,
  le: 8804,
  ge: 8805,
  ensp: 8194,
  emsp: 8195,
  thinsp: 8201,
}

const named: Record<string, string> = Object.fromEntries([
  ...latin.split(' ').map((name, k) => [name, String.fromCodePoint(160 + k)]),
  ...Object.entries(others).map(([name, number]) => [name, String.fromCodePoint(number)]),
])

/** A numbered character, where its number names one. */
function numbered(number: number): string | undefined {
  if (!Number.isInteger(number) || number <= 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff))
    return undefined
  return String.fromCodePoint(number)
}

/** Decodes the named and the numbered characters of a text of a page. */
export function htmlDecoded(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return numbered(Number.parseInt(name.slice(2), 16)) ?? whole
    if (name.startsWith('#')) return numbered(Number.parseInt(name.slice(1), 10)) ?? whole
    return Object.hasOwn(named, name) ? named[name] : whole
  })
}

// The elements that begin a line of their own: after each a line ends.
const blocks =
  'address|article|aside|blockquote|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul'

/**
 * Takes the text of an HTML file. Answers its words only: `script`, `style` and `head` are dropped with what they
 * hold, a block element and a line break become a line break, every other tag goes, and named and numbered
 * characters are decoded. The lines keep no white space at their ends, and no more than one empty line stands
 * between two.
 */
export function wordsOfHtml(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    // An element of the three that is never closed holds the rest of the file.
    .replace(/<(script|style)\b[\s\S]*$/i, '')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(new RegExp(`</?(?:${blocks})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '')
  return htmlDecoded(text)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
