import type { Drawable, FormHTMLAttributes, ReactElement } from '../borrowed/react.ts'
import { createElement } from '../borrowed/react.ts'
import { usePart } from '../page/parts.ts'
import type { AnswerOf, InputOf, Stub } from '../travelled.ts'
import type { LinkProps, Target } from './Link.tsx'

/** What follows a call that worked: a change of state, a move to a screen, or leaving for an address it answered. */
export interface Followed {
  goTo?: Target
  with?: Record<string, unknown>
  set?: Record<string, unknown>
  above?: LinkProps['above']
  href?: string
}

/** What follows a send that worked, or an arrow that is handed the answer of the call and answers it. */
export type Then<Answer> = Followed | ((answer: Answer) => Followed)

/** The properties of `Form`: those of a `<form>` but how it is sent, and what it calls with what. */
export interface FormProps<What extends Stub>
  extends Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'method' | 'onSubmit'> {
  // A change, an action, a flow that is offered, an agent or a member of one.
  call: What
  // Values the person does not type.
  with?: Partial<InputOf<What>>
  // What its fields start with.
  values?: Partial<InputOf<What>>
  then?: Then<AnswerOf<What>>
  // What is emptied after a send that worked: true when left out.
  reset?: boolean | readonly string[]
  // True when left out.
  sendOnEnter?: boolean
  optimistic?: false
  // Read as `calls.<id>`; it names the form in a send with no script.
  id?: string
  children?: Drawable
}

/**
 * A form over a function: any named control inside it is a field, and a component that calls `useField`. It
 * checks each value against the check the build made from the types of the function's input before it calls,
 * tells a field its failure, and with no script is a real form that posts. It is drawn by the part of the page
 * code that holds forms, which a page with a form loads.
 */
export function Form<const What extends Stub>(given: FormProps<What>): ReactElement {
  const part = usePart('form')
  return part ? createElement(part.Form<What>, { ...given }) : createElement('form')
}
