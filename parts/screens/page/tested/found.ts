import { fieldRoles, folded, isHidden, nameOf, pressRoles, roleOf, readText } from './named.ts'

/** What a test looks for on a screen: a field by its name or label, a press by its words, an element by its `id`, or words. */
export interface Asked {
  kind: 'field' | 'press' | 'block' | 'text'
  name: string
}

/** What a test is told of what it found: what it is, its name, its words, and its state. */
interface Found {
  role: string
  name: string
  text: string
  value?: string
  checked?: boolean
  disabled: boolean
}

/** What a finding answers: the one element, or that none or several fit, with what the screen holds. */
export type Finding = { found: Found } | { missed: 'none' | 'two'; count: number; holds: string }

// What the page code lays over a page of its own, and which is no part of the screen.
const notScreen = '#tent-overlay'

/** Every element of the page that a reader hears, but what the page code lays over it. */
const shown = (selector: string): Element[] =>
  [...document.querySelectorAll(selector)].filter((one) => !isHidden(one) && !one.closest(notScreen))

/** The fields of a screen: each control of a form, a group of buttons of one name counted once. */
function fields(): Element[] {
  const seen = new Set<string>()
  return shown('input, select, textarea, [role]').filter((one) => {
    if (!fieldRoles.has(roleOf(one))) return false
    if (one instanceof HTMLInputElement && one.type === 'radio' && one.name !== '') {
      if (seen.has(one.name)) return false
      seen.add(one.name)
    }
    return true
  })
}

/** The name that a field is found by: the name it is sent under. */
const fieldName = (element: Element): string => element.getAttribute('name') ?? ''

/** The presses of a screen: what a person presses, the innermost where one lies in another. */
function presses(): Element[] {
  const all = shown('button, a[href], input, [role]').filter((one) => pressRoles.has(roleOf(one)))
  return all.filter(
    (one) => !all.some((other) => other !== one && one.contains(other) && nameOf(other) === nameOf(one)),
  )
}

/** The words of an element as a person reads them on the screen. */
const textOf = (element: Element): string =>
  folded(element instanceof HTMLElement && element.innerText !== undefined ? element.innerText : readText(element))

/** The elements that hold exactly these words, the innermost of them. */
function textsOf(words: string): Element[] {
  const all = shown('body *').filter((one) => !(one instanceof HTMLScriptElement) && textOf(one) === folded(words))
  return all.filter((one) => !all.some((other) => other !== one && one.contains(other)))
}

/** The elements that fit what is asked. */
function candidates(asked: Asked): Element[] {
  if (asked.kind === 'field') {
    const all = fields()
    const byName = all.filter((one) => fieldName(one) === asked.name)
    return byName.length ? byName : all.filter((one) => nameOf(one) === folded(asked.name))
  }
  if (asked.kind === 'press') return presses().filter((one) => nameOf(one) === folded(asked.name))
  if (asked.kind === 'block') return shown('[id]').filter((one) => one.id === asked.name)
  return textsOf(asked.name)
}

/** A list of names in words, each quoted, or `none`. */
const listed = (names: string[]): string =>
  names.length ? [...new Set(names)].map((one) => JSON.stringify(one)).join(', ') : 'none'

/** What the screen holds, in words, for a test whose finding fitted no element or several. */
function holds(): string {
  return [
    `the presses ${listed(presses().map(nameOf))}`,
    `the fields ${listed(fields().map((one) => fieldName(one) || nameOf(one)))}`,
    `the ids ${listed(shown('[id]').map((one) => one.id))}`,
  ].join('; ')
}

/** What a test is told of an element. */
function toldOf(element: Element): Found {
  const value =
    element instanceof HTMLInputElement && element.type === 'radio' && element.name !== ''
      ? (document.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`)
          ?.value ?? '')
      : element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ? element.value
        : undefined
  const checked =
    element instanceof HTMLInputElement && element.type === 'checkbox'
      ? element.checked
      : element.getAttribute('aria-checked') === null
        ? undefined
        : element.getAttribute('aria-checked') === 'true'
  return {
    role: roleOf(element),
    name: nameOf(element),
    text: textOf(element),
    ...(value === undefined ? {} : { value }),
    ...(checked === undefined ? {} : { checked }),
    disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
  }
}

/** Finds what is asked on the screen that the page shows now: one element, or none, or several. */
export function find(asked: Asked): Finding {
  const found = candidates(asked)
  if (found.length === 1) return { found: toldOf(found[0]) }
  return { missed: found.length ? 'two' : 'none', count: found.length, holds: holds() }
}

/** The one element that fits what is asked, or nothing where none or several do. */
export function elementOf(asked: Asked): Element | undefined {
  const found = candidates(asked)
  return found.length === 1 ? found[0] : undefined
}
