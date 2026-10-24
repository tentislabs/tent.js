import { isStored, localIn, momentIn } from '../../core/internal.ts'

/** The attributes of a native control that the type of its field says, and what it holds now. */
export interface Attributes {
  type?: string
  min?: number | string
  max?: number | string
  step?: number
  minLength?: number
  maxLength?: number
  multiple?: boolean
  accept?: string
  value?: string
  checked?: boolean
}

/** The kind of what a list holds, or nothing for no list. */
const listOf = (type: Record<string, unknown>): string | undefined =>
  type.kind === 'list' && isStored(type.of) && typeof type.of.kind === 'string' ? type.of.kind : undefined

/** What a value is written as in a control of text: nothing as an empty text, anything else as its text. */
const textOf = (value: unknown): string =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value)

/**
 * Takes the type of a field, as it is stored, what the field holds, and the time zone of the page. Answers the
 * attributes of the native control it is spread on: its kind from the kind of the type, the limits of the type,
 * `multiple` for a list of choices, of links or of files, `accept` from the kinds of a file, and its value, or
 * whether it is checked. A moment is written in the zone of the page. A choice, a link, and a list, an object, a
 * `json` and a `vector` take no kind: a select, a group of radios or the fields inside them take them.
 */
export function attributesOf(type: unknown, value: unknown, zone: string): Attributes {
  const t = isStored(type) ? type : {}
  const many = listOf(t)
  if (many !== undefined) {
    const kinds = isStored(t.of) && Array.isArray(t.of.kinds) ? t.of.kinds.map(String) : []
    if (many === 'file') return { type: 'file', multiple: true, ...(kinds.length ? { accept: kinds.join(',') } : {}) }
    return many === 'choice' || many === 'link' ? { multiple: true } : {}
  }
  switch (t.kind) {
    case 'text':
      return {
        type: t.secret === true ? 'password' : 'text',
        ...(typeof t.min === 'number' ? { minLength: t.min } : {}),
        ...(typeof t.max === 'number' ? { maxLength: t.max } : {}),
        value: textOf(value),
      }
    case 'number':
      return {
        type: 'number',
        ...(typeof t.min === 'number' ? { min: t.min } : {}),
        ...(typeof t.max === 'number' ? { max: t.max } : {}),
        ...(t.whole === true ? { step: 1 } : {}),
        value: textOf(value),
      }
    case 'boolean':
      return { type: 'checkbox', checked: value === true }
    case 'date':
      return { type: 'datetime-local', value: value === undefined || value === null ? '' : localIn(value, zone) }
    case 'day':
      return { type: 'date', value: textOf(value).slice(0, 10) }
    case 'file': {
      const kinds = Array.isArray(t.kinds) ? t.kinds.map(String) : []
      return { type: 'file', ...(kinds.length ? { accept: kinds.join(',') } : {}) }
    }
    case 'choice':
    case 'link':
      return { value: textOf(value) }
    default:
      return {}
  }
}

/** The element of a native control, as an event of it is handed it. */
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/**
 * Takes a native control that changed, the type of its field and the time zone of the page. Answers what the field
 * holds now, by its type: a tick as true or false, a number as a number, a moment in the zone, the picked entries of
 * a list, and nothing for an empty control.
 */
export function heldBy(control: Control, type: unknown, zone: string): unknown {
  const t = isStored(type) ? type : {}
  if (listOf(t) !== undefined && 'selectedOptions' in control)
    return Array.from(control.selectedOptions, (one) => one.value)
  if (t.kind === 'boolean' && 'checked' in control) return control.checked
  const text = control.value
  if (text === '') return undefined
  if (t.kind === 'number') {
    const number = Number(text)
    return Number.isFinite(number) ? number : text
  }
  if (t.kind === 'date') return momentIn(text, zone) ?? text
  return text
}
