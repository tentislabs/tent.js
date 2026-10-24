import { filesAt } from './based.ts'
import { isLeftward } from './spoken.ts'
import type { Page } from './types.ts'

/** A text as it stands in HTML: the characters that have a meaning there are written as their names. */
export const asText = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (sign) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[sign] ?? sign,
  )

// The two line separators, written by their numbers so that this file holds neither as itself.
const separators = String.fromCharCode(0x2028, 0x2029)
const unsafe = new RegExp(`[<>&${separators}]`, 'g')

/**
 * A value as the JSON of a block that the browser does not run: `<`, `>` and `&`, and the two line separators that
 * scripts treat as line ends, are written as their `\u` forms, so that no text of a row can end the block.
 */
export const asBlock = (value: unknown): string =>
  JSON.stringify(value).replace(unsafe, (sign) => `\\u${sign.charCodeAt(0).toString(16).padStart(4, '0')}`)

/** The address of a file of the bundle. */
const fileOf = (page: Page, file: string): string => `${filesAt(page)}${file}`

/**
 * Takes the page and its title. Answers the head of the document, up to and with the opening of its body: it names
 * every file that the page loads, so a browser fetches them while the body is drawn.
 */
export function documentHead(o: {
  page: Page
  title: string
  // What the page code is told of the app in the head: its name, where a browser keeps a state of it.
  app?: string
  // "keep" where every address of a screen ends in a slash, which the page then writes so.
  slash?: string
  // The lines of the head beside the title and the files: for search engines, the icon, and those of `head`.
  head?: string[]
  // The attributes that the project sets on `<html>` for a library, as `html` of the project names them.
  html?: Record<string, string>
}): string {
  const { page } = o
  const modules = [...new Set([page.load.screen, ...page.load.parts, page.load.error].filter((file) => file !== ''))]
  const own = Object.entries(o.html ?? {})
    .filter(([name]) => /^[a-z][a-z0-9-]*$/.test(name) && !name.startsWith('on'))
    .map(([name, value]) => ` ${name}="${asText(value)}"`)
    .join('')
  return [
    '<!doctype html>',
    // The page states its language, and for one written from right to left that too: the layout turns with it.
    `<html lang="${asText(page.language)}"${isLeftward(page.language) ? ' dir="rtl"' : ''}${own}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${asText(o.title)}</title>`,
    ...(o.app === undefined ? [] : [`<meta name="tent-app" content="${asText(o.app)}">`]),
    ...(o.slash === undefined ? [] : [`<meta name="tent-slash" content="${asText(o.slash)}">`]),
    ...(o.head ?? []),
    ...page.load.styles.map((file) => `<link rel="stylesheet" href="${asText(fileOf(page, file))}">`),
    ...modules.map((file) => `<link rel="modulepreload" href="${asText(fileOf(page, file))}">`),
    '</head>',
    '<body>',
    '',
  ].join('\n')
}

/**
 * Takes the page record, the drawing of its screen, the main file of the page code, the files of the page code that
 * run before it, and the lines that ask for what the drawing met ahead, as the pictures it loads with. Answers the
 * body of the document that follows its head: the element with the id `tent` holds the drawing, and the block with
 * the id `tent-page` the page record. Modules run in the order in which the document names them: one named before
 * the main file has run when the main file starts.
 */
export function documentBody(o: {
  page: Page
  drawing: string
  main: string | undefined
  before?: string[]
  ahead?: string[]
}): string {
  return [
    ...(o.ahead ?? []),
    `<div id="tent">${o.drawing}</div>`,
    `<script type="application/json" id="tent-page">${asBlock(o.page)}</script>`,
    ...(o.main === undefined ? [] : (o.before ?? [])).map(
      (file) => `<script type="module" src="${asText(fileOf(o.page, file))}"></script>`,
    ),
    ...(o.main === undefined ? [] : [`<script type="module" src="${asText(fileOf(o.page, o.main))}"></script>`]),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
