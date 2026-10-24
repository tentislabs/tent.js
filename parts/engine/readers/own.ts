import { wordsOfHtml } from './html.ts'
import { wordsOfWord } from './word.ts'

const wordKind = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const pdfKind = 'application/pdf'

// The kind that the ending of a name says, where the kind that is stored with a file says nothing.
const endings: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  docx: wordKind,
  pdf: pdfKind,
}

/**
 * The kind that a file is read as: the one that is stored with it, without what follows a semicolon, and the one
 * that the ending of its name says where the stored kind says nothing.
 */
export function readAs(kind: string, name: string): string {
  const stated = kind.split(';')[0].trim().toLowerCase()
  if (stated !== '' && stated !== 'application/octet-stream') return stated
  const ending = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return Object.hasOwn(endings, ending) ? endings[ending] : stated
}

/** Whether a kind is one that our own readers read. A PDF is read by a part of its own. */
export const isOwn = (kind: string): boolean =>
  kind.startsWith('text/') || kind === 'application/json' || kind === wordKind

/**
 * Takes a kind that our own readers read, the bytes of a file, and the most bytes that a packed file may open to.
 * Answers its words. Plain text, Markdown, CSV, JSON and any other `text/*` are taken as they are: UTF-8, with a
 * leading byte-order mark removed, and a byte that is not UTF-8 as the replacement character. HTML gives its
 * words only, and a Word document a line for each paragraph.
 */
export function readOwn(kind: string, bytes: Uint8Array, most: number): string {
  if (kind === wordKind) return wordsOfWord(bytes, most)
  const text = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(bytes)
  return kind === 'text/html' ? wordsOfHtml(text) : text
}
