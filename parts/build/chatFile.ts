/** What one file of a screen in a chat holds. */
export interface ChatFile {
  language: string
  title: string
  styles: string[]
  // The screen, the app, the language and the words, which the part `chat` reads beside the records of the views.
  held: object
  scripts: string[]
}

/** A text as it stands in HTML. */
const asText = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** A script or a style as it stands inside its tag: nothing in it can end the tag or open a comment. */
const inside = (text: string, tag: string): string =>
  text.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1').replaceAll('<!--', '<\\!--')

/**
 * The text of the one file of a screen in a chat: its styles, the record of its page code's own data, and its
 * scripts, each inside the file, in the order they run. The layer writes the app's address and the version into
 * its head when it answers the reading of it.
 */
export function chatFile(o: ChatFile): string {
  const held = JSON.stringify(o.held).replaceAll('<', '\\u003c')
  return [
    '<!doctype html>',
    `<html lang="${asText(o.language)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${asText(o.title)}</title>`,
    ...o.styles.map((style) => `<style>${inside(style, 'style')}</style>`),
    '</head>',
    '<body>',
    '<div id="tent"></div>',
    `<script id="tent-views" type="application/json">${held}</script>`,
    ...o.scripts.map((script) => `<script>${inside(script, 'script')}</script>`),
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
