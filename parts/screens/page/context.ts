import { createContext, useContext, useSyncExternalStore } from '../borrowed/react.ts'
import type { PageStore } from './store.ts'

/** The page that a tag is drawn in. Nothing is drawn outside one. */
export const StoreContext = createContext<PageStore | undefined>(undefined)

/** What a view was handed, for the hooks of a view. */
export const HandedContext = createContext<Record<string, unknown>>({})

/** What a `Form` gives the fields inside it. */
export interface FormHeld {
  // The function that the form calls, by its name.
  call?: string
  // The types of the input of what the form calls, each by the name of its field.
  input: Record<string, unknown>
  // What one field holds and the words of its failed check, as the form holds them now: the same answer while
  // neither changed. A field is drawn again for a change of its own, and no other part of the form is.
  field(name: string): FieldHeld
  // Is told each change of what a field holds or of its words. Answers what ends the telling.
  listen(heard: () => void): () => void
  busy: boolean
  set(name: string, value: unknown): void
  // A control of the builder's own tells the form the element that takes the focus when its field fails.
  focusOf?(name: string, element: { focus(): void } | null): void
  // Is told a name that a control of the builder's own asked for and the input does not have.
  unknown?(name: string): void
  // Is told that `useField` drives the field of a name, whose value the form then takes from it and not from the
  // controls of that name. Answers what ends it.
  drives?(name: string): () => void
  // Sends the files that were picked for a `file` field to the files door, telling `step` how far they are, and
  // answers the ids of those it stored.
  upload?(name: string, files: File[], step: (share: number) => void): Promise<string[]>
}
export const FormContext = createContext<FormHeld | undefined>(undefined)

/** What one field of a form holds, and the words of its failed check. */
export interface FieldHeld {
  value: unknown
  error: string | undefined
}

const listensNot = (): (() => void) => () => undefined

/** What one field of a form holds and its words, read so that the part that asks is drawn again when they change alone. */
export function useFieldHeld(form: FormHeld | undefined, name: string | undefined): FieldHeld | undefined {
  const read = (): FieldHeld | undefined => (form && name !== undefined ? form.field(name) : undefined)
  return useSyncExternalStore(form && name !== undefined ? form.listen : listensNot, read, read)
}

/** Inside a component that is drawn on the server alone, on a server: the mark of the draw, which names each place of a living child. */
export const PartContext = createContext<string | undefined>(undefined)

/** The page of the tag that asks, drawn again whenever what the page holds changes. */
export function useStore(): PageStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('A tag and a hook are drawn inside a page: `draw` and the page code make one.')
  useSyncExternalStore(store.listen, store.turn, store.turn)
  return store
}
