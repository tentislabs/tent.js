import type { Description } from '../../core/internal.ts'
import { isStored, pageLink, pageLook, pageWords, projectLanguages } from '../../core/internal.ts'

/** Writes a text as text in HTML: each character that means something there as its name. */
const asText = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (one) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[one] ?? one,
  )

/** The pages that the engine draws itself where the project has no screen for them. */
export type OwnKind = 'notFound' | 'error' | 'signIn' | 'tooMany' | 'outOfDate'

/** A message of the project in a language, and the engine's own where the project gives none. */
function ownWord(description: Description, language: string, key: string): string {
  const held: unknown = Reflect.get(Object(description.messages), language)
  const given = isStored(held) && typeof held[key] === 'string' ? held[key] : undefined
  return given ?? pageWords[key] ?? key
}

/**
 * The one style of every page of the engine, written from the one look that the built-in screens of the page code
 * carry too: a page of status in its parts, and a page that asks a person with its heading, its words and its presses.
 */
export function ownStyle(): string {
  return [
    'body{margin:0}',
    `main{${pageLook.window}}`,
    `div>h1{${pageLook.status}}`,
    `div>h2{${pageLook.words}}`,
    `div>span{${pageLook.code}}`,
    `div>pre{${pageLook.told}}`,
    `div>a{${pageLook.link}}`,
    `main>h1{${pageLook.heading}}`,
    `main p,main ul{${pageLook.text}}`,
    `button{${pageLook.press}}`,
  ].join('')
}

/** The headers of a page of the engine: no script, no file, and no site that may show it in a frame. */
export const ownHeaders = (): Record<string, string> => ({
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
})

/**
 * Takes the description, the language, the status, the kind of page, and in the modes `development` and `test` the
 * error it answers. Answers the whole page: the status large, the page's words under it, as the messages of the
 * project give them, and one link, back to the start or to the same address again; with an error, its code in a pill
 * and its place and words under it. In plain HTML with its one style.
 */
export function ownPage(o: {
  description: Description
  language: string
  status: number
  kind: OwnKind
  error?: { code: string; message: string; where?: { file: string; line: number } }
}): string {
  const words = ownWord(o.description, o.language, `tent.${o.kind}.title`)
  const error = o.error
  const place = error?.where ? `${error.where.file}:${error.where.line}\n` : ''
  // A refusal tells its code alone: its words could name a screen that the caller may not know of.
  const failure = o.kind === 'error' && error ? `<pre>${asText(`${place}${error.message}`)}</pre>` : ''
  const told = error === undefined ? '' : `<span>${asText(error.code)}</span>${failure}`
  // The start is the app's own, in the language of the page; again is the address that was asked, as it was asked.
  const first = projectLanguages(o.description.project)[0]
  const link =
    pageLink(o.kind) === 'start'
      ? `<a href="${o.language === first ? '/' : `/${asText(o.language)}`}">${asText(ownWord(o.description, o.language, 'tent.page.start'))}</a>`
      : `<a href="">${asText(ownWord(o.description, o.language, 'tent.page.again'))}</a>`
  return [
    '<!doctype html>',
    `<html lang="${asText(o.language)}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${o.status}: ${asText(words)}</title>`,
    `<style>${ownStyle()}</style></head>`,
    `<body><main><div><h1>${o.status}</h1><h2>${asText(words)}</h2>${told}${link}</div></main></body>`,
    '</html>',
    '',
  ].join('\n')
}
