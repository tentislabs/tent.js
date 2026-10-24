import type { Answered } from '../../screens/draw.ts'

// What ends a document that the page code draws: a streamed page sends it after its last part.
const end = '</body>\n</html>\n'

/** The first piece of a page that is streamed: its whole document but its end, which stays open for the parts. */
export const firstPiece = (html: string): string => (html.endsWith(end) ? html.slice(0, -end.length) : html)

/**
 * Takes a whole document. Answers what follows its head: all that stands after the opening of its body, which a
 * page whose head was sent first sends next.
 */
export function streamedBodyOf(html: string): string {
  const opened = /<body[^>]*>\n?/.exec(html)
  return opened ? html.slice(opened.index + opened[0].length) : html
}

/** The last piece of a page that is streamed. */
export const lastPiece = (): string => end

/**
 * Takes the HTML of a draw of a streamed page and the name of a use. Answers what the use drew where it came in
 * that draw - what stands inside the template that names it - and nothing where it waits still.
 */
export function partIn(html: string, name: string): string | undefined {
  const opened = `<template data-t-done="${name}">`
  const from = html.indexOf(opened)
  if (from < 0) return undefined
  // A template among what the use drew is passed over whole: the one that closes this one is the end of the part.
  let depth = 1
  const tags = /<template\b[^>]*>|<\/template>/g
  tags.lastIndex = from + opened.length
  for (let found = tags.exec(html); found; found = tags.exec(html)) {
    depth += found[0] === '</template>' ? -1 : 1
    if (depth === 0) return html.slice(from + opened.length, found.index)
  }
  return undefined
}

/** A value as the JSON of a block that the browser does not run, which no text of a row can end. */
const asBlock = (value: unknown): string =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (sign) => `\\u${sign.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )

/**
 * Takes the whole document of the shared part of a kept screen. Answers it with the place of each personal part
 * emptied, as it is sent whole: the page draws those parts once it has come alive.
 */
export const withoutPlaces = (html: string): string =>
  html.replace(/<template data-t-wait="([^"]+)"><\/template>[\s\S]*?<template data-t-end="\1"><\/template>/g, '')

// What puts a part in its place, once for a page: it takes what came with the part into the page record - the
// answers, which the page code reads as those of the first HTML, and what the record says of the page - takes out
// what stood in the place of each use it names, and puts the part there. A use that it names with no part of its
// own is left empty, for the page to draw.
const putter = [
  "self.tentPut=function(k,g){var d=document,s=d.querySelector('body>div[data-t-part=\"'+k+'\"]'),",
  "j=s&&s.querySelector('script[data-t-answers]'),m=s&&s.querySelector('script[data-t-page]'),",
  'p=d.querySelector(\'body>script[type="application/json"]#tent-page\');',
  'if(p&&(j||m)){var r=JSON.parse(p.textContent);if(m)Object.assign(r,JSON.parse(m.textContent));',
  'if(j){var a=JSON.parse(j.textContent),q=function(e){return JSON.stringify([e.what,e.input])};',
  'r.answers=r.answers.filter(function(e){return!a.some(function(b){return q(b)==q(e)})}).concat(a)}',
  'p.textContent=JSON.stringify(r)}if(j)j.remove();if(m)m.remove();',
  "(g||[k]).forEach(function(n){var w=d.querySelector('template[data-t-wait=\"'+n+'\"]');if(!w)return;",
  'for(var x=w.nextSibling;x&&!(x.nodeName=="TEMPLATE"&&x.getAttribute("data-t-end")==n);)',
  '{var y=x.nextSibling;x.remove();x=y}if(x)x.remove();',
  'if(n==k&&s)w.replaceWith.apply(w,[].slice.call(s.childNodes));else w.remove()});if(s)s.remove()};',
].join('')

/** One piece: what it carries at the end of the page, and the line of script that puts it in its place. */
function piece(
  name: string,
  html: string,
  o: { answers: Answered[]; page?: Record<string, unknown>; empties?: string[]; hidden?: boolean },
  nonce: string | undefined,
  first: boolean,
): string {
  const answers = o.answers.length
    ? `<script type="application/json" data-t-answers>${asBlock(o.answers)}</script>`
    : ''
  const page = o.page ? `<script type="application/json" data-t-page>${asBlock(o.page)}</script>` : ''
  const empties = o.empties ? `,${JSON.stringify(o.empties)}` : ''
  return [
    `<div data-t-part="${name}"${o.hidden ? ' hidden' : ''}>${html}${answers}${page}</div>`,
    `<script${nonce === undefined ? '' : ` nonce="${nonce}"`}>${first ? putter : ''}tentPut(${JSON.stringify(name)}${empties})</script>`,
    '',
  ].join('\n')
}

/**
 * Takes the name of a use that came, what it drew, the answers that came since the last piece, the nonce of the
 * page, whether this is the first piece of the page, and what the page record is to say beside them. Answers the
 * piece that is sent into the open answer: the part at the end of the page, as a browser with scripts switched off
 * shows it, and one line of script that puts it in its place.
 */
export function partPiece(
  name: string,
  html: string,
  answers: Answered[],
  nonce: string | undefined,
  first: boolean,
  page?: Record<string, unknown>,
): string {
  return piece(name, html, { answers, ...(page ? { page } : {}) }, nonce, first)
}

/**
 * Takes the uses whose places are emptied - those that still wait when the time of the stream is up, or that
 * failed to draw - their answers as the page is to ask them, the nonce of the page, whether this is the first piece,
 * and what the page record is to say. Answers the piece that empties their places and tells the page record.
 */
export function openPiece(
  names: string[],
  answers: Answered[],
  nonce: string | undefined,
  first: boolean,
  page?: Record<string, unknown>,
): string {
  if (!names.length && !answers.length && !page) return ''
  return piece('open', '', { answers, empties: names, hidden: true, ...(page ? { page } : {}) }, nonce, first)
}
