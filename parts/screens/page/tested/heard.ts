import { fieldRoles, folded, isHidden, nameOf, roleOf } from './named.ts'

// The roles that are no thing of their own to a reader: what they hold is heard in their place.
const plain = new Set(['generic', 'none', 'presentation', 'paragraph'])

/** What a reader is told of the state of an element, in square brackets. */
function statesOf(element: Element, role: string): string {
  const states: string[] = []
  const level = /^H([1-6])$/.exec(element.tagName)?.[1] ?? element.getAttribute('aria-level')
  if (role === 'heading' && level) states.push(`level=${level}`)
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio'))
    states.push(element.checked ? 'checked' : 'checked=false')
  else if (element.getAttribute('aria-checked') !== null) states.push(`checked=${element.getAttribute('aria-checked')}`)
  if (element.getAttribute('aria-pressed') !== null) states.push(`pressed=${element.getAttribute('aria-pressed')}`)
  if (element.getAttribute('aria-expanded') !== null) states.push(`expanded=${element.getAttribute('aria-expanded')}`)
  if (element.getAttribute('aria-selected') === 'true') states.push('selected')
  if (element.getAttribute('aria-invalid') === 'true') states.push('invalid')
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') states.push('disabled')
  if (element.matches(':required') || element.getAttribute('aria-required') === 'true') states.push('required')
  return states.length ? ` [${states.join(', ')}]` : ''
}

/** The value a reader is told of a field: the words in it, or the option that is picked. */
function valueOf(element: Element): string {
  if (element instanceof HTMLSelectElement) return folded(element.selectedOptions[0]?.textContent)
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return ''
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return folded(element.value)
  return ''
}

/** The lines of what a reader hears of one node and what it holds, at a depth. */
function linesOf(node: Node, depth: number, lines: string[]): void {
  const at = '  '.repeat(depth)
  if (node.nodeType === Node.TEXT_NODE) {
    const words = folded(node.textContent)
    if (words) lines.push(`${at}- text: ${JSON.stringify(words)}`)
    return
  }
  if (!(node instanceof Element) || isHidden(node) || node instanceof HTMLScriptElement || node.id === 'tent-overlay')
    return
  const role = roleOf(node)
  if (plain.has(role)) {
    for (const child of node.childNodes) linesOf(child, depth, lines)
    return
  }
  const name = nameOf(node)
  const value = fieldRoles.has(role) ? valueOf(node) : ''
  lines.push(
    `${at}- ${role}${name ? ` ${JSON.stringify(name)}` : ''}${statesOf(node, role)}${value ? `: ${JSON.stringify(value)}` : ''}`,
  )
  // A thing whose name is the words it holds, and a field, holds nothing more for a reader.
  if (fieldRoles.has(role) || role === 'img' || (name !== '' && folded(node.textContent) === name)) return
  for (const child of node.childNodes) linesOf(child, depth + 1, lines)
}

/**
 * The tree that a screen reader hears of the page: each thing with its role, its name and its state, one on a line,
 * what it holds under it, and the words between them. A plain holder adds no line of its own.
 */
export function heardTree(): string {
  const lines: string[] = []
  for (const child of document.body.childNodes) linesOf(child, 0, lines)
  return `${lines.join('\n')}\n`
}
