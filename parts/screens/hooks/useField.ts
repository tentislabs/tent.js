import { isStored } from '../../core/internal.ts'
import { useContext, useEffect, useId, useState } from '../borrowed/react.ts'
import { FormContext, useFieldHeld, useStore } from '../page/context.ts'
import { isRequired } from '../../core/internal.ts'
import { asWords } from '../page/fields.ts'
import { attributesOf, heldBy } from '../page/input.ts'
import { spokenText } from '../page/spoken.ts'

/** What a field gives the native control it is spread on: `<input {...field.input} />`. */
export interface InputProps {
  name: string
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
  required?: boolean
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
  onChange(event: { currentTarget: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }): void
  ref(element: HTMLElement | null): void
}

/** What a control of the builder's own works with, inside a `Form`. */
export interface FieldOf {
  // What the field holds, and how it changes it.
  value: unknown
  set(value: unknown): void
  // The words that the form shows for it, and whether it failed.
  error: string | undefined
  invalid: boolean
  // True while the form is being sent.
  busy: boolean
  required: boolean
  label: string
  help: string | undefined
  // The type of that field of the input of what the form calls, as it is stored.
  type: unknown
  // Put on the element that takes the focus when the field fails.
  ref(element: { focus(): void } | null): void
  input: InputProps
  // The id that the view gives the element that holds the words of `error`.
  errorId: string
  // For a `file` field: how far the file that was picked is on its way, from 0 to 1, while it uploads.
  progress?: number
}

/**
 * Takes the name of a field of the input of what the form around calls. Answers what a control shows and changes:
 * a component that calls it inside a `Form` is a field of that form, is checked with it, and is told its error by
 * it, and `input` is what a native control is spread with, made from the type of the field. Outside a `Form` it
 * fails. A name that the input does not have holds nothing, and in the mode `development` the console names it.
 */
export function useField(name: string): FieldOf {
  const form = useContext(FormContext)
  const held = useFieldHeld(form, name)
  const store = useStore()
  const id = useId()
  const [progress, setProgress] = useState<number | undefined>(undefined)
  // The form takes what this field holds from it, and not from the control's own value, at a send.
  useEffect(() => form?.drives?.(name), [form, name])
  if (!form) throw new Error('`useField` is called inside a `Form`: outside one a field shows a state.')
  const known = Object.hasOwn(form.input, name)
  if (!known) form.unknown?.(name)
  const type = known ? form.input[name] : undefined
  const limits = isStored(type) ? type : {}
  const error = held?.error
  const value = known ? held?.value : undefined
  const zone = store.page.zone
  const errorId = `${id}-error`
  // A tick that is needed would have to be ticked: a `boolean` is false where it is not.
  const required = isRequired(type) && limits.kind !== 'boolean'
  const set = (next: unknown): void => {
    if (known) form.set(name, next)
  }
  const file = limits.kind === 'file' || (limits.kind === 'list' && isStored(limits.of) && limits.of.kind === 'file')
  return {
    value,
    set,
    error,
    invalid: error !== undefined,
    busy: form.busy,
    required: isRequired(type),
    // A label and a help that are a word are written in the language of the page.
    label: spokenText(limits.label, store.words, store.page.language) ?? asWords(name),
    help: spokenText(limits.help, store.words, store.page.language),
    type,
    ref: (element) => form.focusOf?.(name, element),
    input: {
      name,
      id,
      ...(error === undefined ? {} : { 'aria-invalid': true as const, 'aria-describedby': errorId }),
      ...(required ? { required: true } : {}),
      ...attributesOf(type, value, zone),
      onChange: (event) => {
        const control = event.currentTarget
        if (!file || !('files' in control) || !control.files) return set(heldBy(control, type, zone))
        const files = Array.from(control.files)
        control.value = ''
        if (!files.length || !form.upload) return
        setProgress(0)
        void form.upload(name, files, setProgress).then((ids) => {
          setProgress(undefined)
          if (ids.length) set(limits.kind === 'list' ? [...(Array.isArray(value) ? value : []), ...ids] : ids[0])
        })
      },
      ref: (element) => form.focusOf?.(name, element),
    },
    errorId,
    ...(progress === undefined ? {} : { progress }),
  }
}
