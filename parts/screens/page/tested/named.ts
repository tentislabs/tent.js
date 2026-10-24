// What a reader of the screen is told an element is, and its name: a test finds a thing as a person does, and hears
// the page as a screen reader hears it. It follows the roles of HTML and ARIA (https://www.w3.org/TR/html-aria/) and
// the computation of an accessible name (https://www.w3.org/TR/accname-1.2/), in the share that a page of ours draws.

/** Words with their spaces folded to one, and none at either end. */
export const folded = (words: string | null | undefined): string => (words ?? '').replace(/\s+/g, ' ').trim()

/** The roles that a field of a form has, which a test finds as a field. */
export const fieldRoles = new Set([
  'textbox',
  'searchbox',
  'spinbutton',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'slider',
  'switch',
])

/** The roles that a person presses. */
export const pressRoles = new Set(['button', 'link', 'menuitem', 'tab', 'option'])

/** The roles whose name is made of the words they hold. */
const namedByWords = new Set([
  'button',
  'link',
  'heading',
  'menuitem',
  'tab',
  'option',
  'cell',
  'columnheader',
  'rowheader',
  'checkbox',
  'radio',
  'switch',
  'tooltip',
  'treeitem',
])

/** The role of an input, by its type. */
function inputRole(input: HTMLInputElement): string {
  const type = (input.getAttribute('type') ?? 'text').toLowerCase()
  if (type === 'checkbox') return 'checkbox'
  if (type === 'radio') return 'radio'
  if (type === 'range') return 'slider'
  if (type === 'number') return 'spinbutton'
  if (type === 'search') return 'searchbox'
  if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button'
  if (type === 'hidden') return 'none'
  return input.hasAttribute('list') ? 'combobox' : 'textbox'
}

/** What a reader is told an element is: the role it states, or the one its tag has. A plain holder is `generic`. */
export function roleOf(element: Element): string {
  const stated = folded(element.getAttribute('role')).split(' ')[0]
  if (stated) return stated
  const tag = element.tagName.toLowerCase()
  if (element instanceof HTMLInputElement) return inputRole(element)
  if (tag === 'a' || tag === 'area') return element.hasAttribute('href') ? 'link' : 'generic'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'select')
    return element.hasAttribute('multiple') || Number(element.getAttribute('size')) > 1 ? 'listbox' : 'combobox'
  const fixed: Record<string, string> = {
    button: 'button',
    textarea: 'textbox',
    img: element.getAttribute('alt') === '' ? 'presentation' : 'img',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    table: 'table',
    tr: 'row',
    td: 'cell',
    th: 'columnheader',
    dialog: 'dialog',
    option: 'option',
    progress: 'progressbar',
    hr: 'separator',
    p: 'paragraph',
    output: 'status',
    fieldset: 'group',
    article: 'article',
  }
  // A form and a section are a thing of their own to a reader where they are named, by a label or by what names them.
  const labelled = folded(element.getAttribute('aria-label')) !== '' || element.hasAttribute('aria-labelledby')
  if (tag === 'form' || tag === 'section') return labelled ? (tag === 'form' ? 'form' : 'region') : 'generic'
  return fixed[tag] ?? 'generic'
}

/** Whether a reader hears nothing of an element: it is hidden from it, or not drawn at all. */
export function isHidden(element: Element): boolean {
  if (element.closest('[aria-hidden="true"], [hidden], [inert]')) return true
  const style = getComputedStyle(element)
  return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
}

/** The words that an element holds, as a reader takes them: a picture by its words, and nothing that is hidden. */
export function readText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element) || isHidden(node)) return ''
  if (node instanceof HTMLImageElement) return node.getAttribute('alt') ?? ''
  const label = folded(node.getAttribute('aria-label'))
  if (label && node !== node.ownerDocument.body) return ` ${label} `
  // A block element stands apart from the words around it.
  const apart = getComputedStyle(node).display.startsWith('inline') ? '' : ' '
  return apart + [...node.childNodes].map(readText).join('') + apart
}

/** The words of the elements that a list of ids names, in its order. */
const wordsOfIds = (element: Element, ids: string): string =>
  ids
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id))
    .map((found) => (found ? folded(readText(found)) : ''))
    .filter((one) => one !== '')
    .join(' ')

/** The name that a reader is told of an element: what names it, its label, or the words it holds. */
export function nameOf(element: Element): string {
  const by = element.getAttribute('aria-labelledby')
  if (by) {
    const named = wordsOfIds(element, by)
    if (named) return named
  }
  const label = folded(element.getAttribute('aria-label'))
  if (label) return label
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const type = element instanceof HTMLInputElement ? (element.getAttribute('type') ?? 'text').toLowerCase() : ''
    if (['submit', 'button', 'reset'].includes(type)) return folded(element.value)
    const labels = [...(element.labels ?? [])].map((one) => folded(readText(one))).filter((one) => one !== '')
    if (labels.length) return labels.join(' ')
  }
  if (element instanceof HTMLImageElement) return folded(element.getAttribute('alt'))
  const role = roleOf(element)
  if (namedByWords.has(role)) {
    const words = folded(readText(element))
    if (words) return words
  }
  return folded(element.getAttribute('title'))
}
