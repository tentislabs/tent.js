import type { WireError } from '../../../core/index.ts'
import type { FieldCheck, SentFields } from '../../../core/internal.ts'
import {
  afterSet,
  checkedBy,
  fieldsReader,
  isPath,
  isStored,
  stateEntries,
  writeAddress,
} from '../../../core/internal.ts'
import type { Drawable, FormEvent } from '../../borrowed/react.ts'
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from '../../borrowed/react.ts'
import type { FormProps } from '../../tags/Form.tsx'
import type { Stub } from '../../travelled.ts'
import { addressOf, spokenIn } from '../address.ts'
import { named } from '../based.ts'
import type { FieldHeld, FormHeld } from '../context.ts'
import { FormContext, useStore } from '../context.ts'
import { scaledDown, sentName, uploaded } from '../upload.ts'
import { asWords, deepOf, fieldsOf, nestedOf, startOf, wordsFor } from '../fields.ts'
import { attributesOf } from '../input.ts'
import { holdPart, partHeld } from '../parts.ts'
import { placedAs } from '../placed.ts'
import { postOf } from '../postPress.ts'
import { calledBy, follow, seenOf } from '../press.ts'
import { textOf } from '../spoken.ts'
import { useViewState } from '../states.ts'
import type { CallState } from '../../handed.ts'
import type { PageStore } from '../store.ts'

/** The kinds of an input that are a field of one line, in which Enter sends the form. */
const oneLine = new Set([
  'text',
  'email',
  'number',
  'password',
  'search',
  'tel',
  'url',
  'date',
  'time',
  'datetime-local',
])

/** The tags of the browser's own controls that a form takes a field from. */
const controls = new Set(['input', 'select', 'textarea'])

/** A value of `with` as the hidden fields that carry it with no script: a list once for each entry, a record by dotted names. */
function carriedAs(name: string, value: unknown): [string, string][] {
  if (value === undefined || value === null || value === false) return []
  if (value === true) return [[name, 'on']]
  if (Array.isArray(value)) return value.flatMap((one) => carriedAs(name, one))
  if (isStored(value)) return Object.entries(value).flatMap(([key, one]) => carriedAs(`${name}.${key}`, one))
  return [[name, String(value)]]
}

/**
 * The address of the screen that a form is sent from, in the language of the page, with the states that its screen
 * and the project keep in the address: so the screen is drawn again as it was, and `then` is worked out with what
 * the page reads. Handed a `set`, the states are those after it.
 */
function atOf(store: PageStore, set?: Record<string, unknown>): string {
  const page = store.page
  const record = store.view(page.screen)
  const entries = { ...stateEntries(record?.shared), ...stateEntries(record?.state) }
  const values = set === undefined ? store.state : { ...store.state, ...afterSet(entries, store.state, set) }
  const search = new URLSearchParams(writeAddress(entries, values)).toString()
  return spokenIn(search ? `${page.path}?${search}` : page.path, page.language, page.languages)
}

/** Whether a value is the checks of a form, as the build writes them into a stub. */
const isChecks = (value: unknown): value is Record<string, FieldCheck> =>
  isStored(value) &&
  Object.values(value).every((one) => isStored(one) && typeof one.required === 'boolean' && isStored(one.type))

/** The type that the checks hold at the dotted name of a field, whose limits the words of its failure name. */
function typeAt(checks: Record<string, FieldCheck>, field: string): unknown {
  const [first, ...rest] = field.split('.')
  let at: unknown = Object.hasOwn(checks, first) ? checks[first].type : undefined
  for (const part of rest) {
    if (!isStored(at)) return undefined
    at = at.kind === 'object' && isStored(at.shape) ? at.shape[part] : at.of
  }
  return at
}

/** The words of a failure that names no field the form shows, after its last field, drawn again when they change alone. */
function FailedWords(given: {
  words: { listen(heard: () => void): () => void; failed(): string | undefined }
}): Drawable {
  const failed = useSyncExternalStore(given.words.listen, given.words.failed, given.words.failed)
  return failed === undefined ? null : <p role="alert">{failed}</p>
}

/** A native control of a form, as the browser holds it: one that takes the words of a failed check. */
type Native = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const isNative = (element: unknown): element is Native =>
  element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement

/** What the browser collects of a form, by the names of its controls, with each file left out. */
function sentOf(form: HTMLFormElement): SentFields {
  const sent = new URLSearchParams()
  for (const [name, value] of new FormData(form)) if (typeof value === 'string') sent.append(name, value)
  return sent
}

/** What a form reads of an element that the view wrote among its children. */
interface Written {
  children?: Drawable
  name?: unknown
  type?: unknown
  value?: unknown
  defaultValue?: unknown
  checked?: unknown
  defaultChecked?: unknown
}

/**
 * Gives each native control among the children that a field names, and that states no value of its own, what its
 * field starts with: a text, a tick, a picked option. Only the elements that the view wrote in place are reached,
 * through the elements that hold them, so that the first HTML holds each start as the browser draws it.
 */
function started(
  children: Drawable,
  startAt: (name: string) => { type: unknown; value: unknown } | undefined,
): Drawable {
  return Children.map(children, (child): Drawable => {
    if (!isValidElement<Written>(child)) return child
    const props = child.props
    const inner = props.children === undefined ? undefined : started(props.children, startAt)
    const tag = child.type === Fragment ? undefined : typeof child.type === 'string' ? child.type : null
    if (tag === null) return child
    const start =
      tag !== undefined && controls.has(tag) && typeof props.name === 'string' ? startAt(props.name) : undefined
    const own = [props.value, props.defaultValue, props.checked, props.defaultChecked].some((one) => one !== undefined)
    const given: Record<string, unknown> = {}
    if (start && !own) {
      const kind = typeof props.type === 'string' ? props.type : ''
      if (kind === 'radio') given.defaultChecked = String(props.value) === String(start.value ?? '')
      else if (kind === 'checkbox')
        given.defaultChecked = Array.isArray(start.value)
          ? start.value.map(String).includes(String(props.value ?? 'on'))
          : start.value === true
      else if (kind !== 'file' && kind !== 'hidden')
        given.defaultValue = Array.isArray(start.value)
          ? start.value.map(String)
          : (attributesOf(start.type, start.value, '').value ?? String(start.value ?? ''))
    }
    if (inner === undefined && !Object.keys(given).length) return child
    // The copy is the tag that the view wrote: the inspect mode tells it by the place of that tag.
    const copy = cloneElement(child, given, inner)
    placedAs(child.props, copy.props)
    return copy
  })
}

/**
 * The page code of `Form`: it collects its fields - each control whose name is a field of the function's input, as
 * the browser collects them, and each field that `useField` drives from what it holds - checks them by what the
 * build made of the function's input, and calls it with them, joined with `with`. Enter in a field of one line and
 * a button of the form send it. A form with an `id` is read in its view as `calls.<id>`. With no script it is a real
 * form that posts, with the hidden fields that say where it was sent from.
 */
export function FormDrawn<const What extends Stub>(given: FormProps<What>): Drawable {
  const {
    call,
    with: carried,
    values,
    then,
    reset,
    sendOnEnter,
    optimistic,
    id,
    children,
    onKeyDown,
    onInput,
    ...rest
  } = given
  const store = useStore()
  const view = useViewState()
  const name = calledBy(call)
  const posted = postOf(call)
  const stub = isStored(call) && isStored(Reflect.get(call, 'input')) ? call : store.stub(name ?? '')
  const input: Record<string, unknown> = isStored(stub) && isStored(stub.input) ? stub.input : {}
  // The fields of the form, a field of an object by its dotted name.
  const fields = useMemo(() => fieldsOf(input), [input])
  // What reads the native controls of the form by the types of the input, made when the form is drawn: a send reads no type.
  const reader = useMemo(() => fieldsReader(input), [input])
  // What the form checks before it sends, as the build made it of the function's input: a send reads no type.
  const written: unknown = isStored(stub) ? stub.checks : undefined
  const checks: Record<string, FieldCheck> = isChecks(written) ? written : {}
  // A form is named by its id, or else by its number among the forms of the draw.
  const [place] = useState(() => store.formPlace?.() ?? 0)
  const key = id ?? `#${place}`
  // The form that was sent with no script and failed, where it is this one: it is drawn with what was typed.
  const sent = store.page.form?.id === key ? store.page.form : undefined
  const starts: Record<string, unknown> = sent ? nestedOf(sent.values) : isStored(values) ? values : {}
  const told = sent ? Object.entries(sent.error.fields ?? {}).filter(([field]) => Object.hasOwn(fields, field)) : []
  // On a server that draws a screen before the call of a form that was sent there with no script, the form that
  // was sent says where its `then` goes with the answer: so it is known also where the call takes the form away.
  if (store.sending === key && store.thenFound) {
    const follows: unknown = then
    const stubOf = store.stub
    const page = store.page
    store.thenFound((answer) => {
      const next = typeof follows === 'function' ? Reflect.apply(follows, undefined, [answer]) : follows
      if (!isStored(next)) return undefined
      // A move goes to its address in the language of the page; a `set` alone back to the screen, as it sets it.
      const moved = next.goTo === undefined || next.goTo === null ? undefined : addressOf(next.goTo, next.with, stubOf)
      const address =
        moved !== undefined
          ? spokenIn(moved, page.language, page.languages)
          : isStored(next.set)
            ? atOf(store, next.set)
            : undefined
      return address !== undefined && isPath(address) ? address : undefined
    })
  }
  // What the fields that `useField` drives hold, the words of each failed check, and the words of a failure that
  // names no field the form shows. They are held apart from what the form draws: a change of one field draws that
  // field again, and no other part of the form.
  const [kept] = useState(() => ({
    touched: {} as Record<string, unknown>,
    errors: Object.fromEntries(
      told.map(([field, check]) => [field, wordsFor(check, fields[field], store.words, store.page.language)]),
    ) as Record<string, string>,
    failed:
      sent && !told.length
        ? sent.error.code.startsWith('T')
          ? textOf(store.words, 'tent.failed', {}, store.page.language)
          : sent.error.message
        : undefined,
    listeners: new Set<() => void>(),
    // What each field was last answered, so that a field that did not change is answered the same.
    answered: new Map<string, FieldHeld>(),
  }))
  // What a field starts at: what the form gives it, as it gives it now.
  const startsAt = useRef({ fields, starts })
  startsAt.current = { fields, starts }
  const valueOf = (field: string): unknown =>
    Object.hasOwn(kept.touched, field)
      ? kept.touched[field]
      : startOf(startsAt.current.fields[field], deepOf(startsAt.current.starts, field))
  /** Changes what the form holds, and tells each part that reads it. */
  const change = (next: { touched?: Record<string, unknown>; errors?: Record<string, string>; failed?: string }) => {
    if (next.touched) kept.touched = next.touched
    if (next.errors) kept.errors = next.errors
    if ('failed' in next) kept.failed = next.failed
    for (const heard of [...kept.listeners]) heard()
  }
  // What reads the words of a failure that names no field: the same for as long as the form is drawn.
  const [words] = useState(() => ({
    listen: (heard: () => void) => {
      kept.listeners.add(heard)
      return () => void kept.listeners.delete(heard)
    },
    failed: () => kept.failed,
  }))
  const [own, setOwn] = useState(false)
  // A send is under way: a second one, as a person's second press or a program's, is taken by nothing.
  const sending = useRef(false)
  // The fields that failed at the last send: the first of them takes the focus once the form is drawn with their
  // words. Held apart from what is drawn, so that moving the focus draws nothing again.
  const failing = useRef<string[]>([])
  const element = useRef<HTMLFormElement | null>(null)
  // The element of each field that `useField` drives that takes the focus, by the name of its field, and the names
  // of the fields that it drives.
  const builders = useRef(new Map<string, { focus(): void }>())
  const driven = useRef(new Map<string, number>())
  // The native controls a person changed since the form started, by their names: they keep what was typed.
  const touchedNative = useRef(new Set<string>())
  // What each native control of a `file` field sends, by its name: the id of the file it uploaded, or their list.
  const nativeFiles = useRef(new Map<string, string | string[]>())
  // The uploads of those controls that are under way, by their names, each answering whether the door took every
  // file: a send waits for them, since a native control shows nothing of an upload.
  const nativeUploads = useRef(new Map<string, Promise<boolean>>())
  const warned = useRef(new Set<string>())
  const busy = id === undefined ? own : store.calls[id]?.busy === true
  const keep = (next: CallState): void => {
    setOwn(next.busy)
    if (id === undefined) return
    store.calls[id] = next
    store.changed()
  }
  // The words of a failed check in the language of the page, whose limits the checks hold: a send reads no type.
  const wordsOf = (check: string, field: string): string =>
    wordsFor(check, typeAt(checks, field) ?? fields[field], store.words, store.page.language)
  /** The native controls of the form that a field names and no `useField` drives, by their names. */
  const nativesOf = (): Map<string, Native[]> => {
    const found = new Map<string, Native[]>()
    for (const one of Array.from(element.current?.elements ?? [])) {
      if (!isNative(one) || one.type === 'hidden' || !Object.hasOwn(fields, one.name) || driven.current.has(one.name))
        continue
      found.set(one.name, [...(found.get(one.name) ?? []), one])
    }
    return found
  }
  /** Tells each field that failed its words: one that `useField` drives through `error`, a native one through the browser's own validity. */
  function tell(wrong: [string, string][], unseen: string | undefined): void {
    const natives = nativesOf()
    for (const held of natives.values()) for (const one of held) one.setCustomValidity('')
    const shown = wrong.filter(([field]) => driven.current.has(field) || natives.has(field))
    for (const [field, said] of shown) natives.get(field)?.[0]?.setCustomValidity(said)
    // The focus is moved before anything is drawn, to the first failing field as the page shows it, so that the
    // browser lays the page out once, with the words of the check.
    focusFirst(shown.map(([field]) => field))
    change({
      failed: unseen,
      errors: Object.fromEntries(shown.filter(([field]) => driven.current.has(field))),
    })
  }
  /** The words of a failure that names no field of the form, in the language of the page where it gives them. */
  const failedWords = (error: WireError): string =>
    Object.hasOwn(store.words, `fail.${error.code}`)
      ? textOf(store.words, `fail.${error.code}`, error.fields ?? {}, store.page.language)
      : error.code.startsWith('T')
        ? textOf(store.words, 'tent.failed', {}, store.page.language)
        : error.message
  const send = (event: FormEvent): void => {
    event.preventDefault()
    // A form takes no second send while one is under way.
    if (sending.current || busy) return
    // A press of the engine's own, on a screen handed `grant` or `ask`, is sent by the part that the page loaded
    // for it, and the page loads whole the address that the engine answers.
    const engines = posted ? partHeld('posted')?.postedBy(call) : undefined
    if (engines) {
      sending.current = true
      keep({ busy: true })
      engines(store).then(
        (to) => store.goTo(to),
        (thrown: unknown) => {
          sending.current = false
          keep({ busy: false, error: seenOf(thrown) })
        },
      )
      return
    }
    if (name === undefined) return
    const waiting = [...nativeUploads.current.values()]
    if (!waiting.length) {
      sendNow(name)
      return
    }
    // A file still uploads: the form is busy until it is there, and a file the door refused sends nothing.
    sending.current = true
    keep({ ...(id === undefined ? {} : store.calls[id]), busy: true })
    void Promise.all(waiting).then((taken) => {
      sending.current = false
      keep({ ...(id === undefined ? {} : store.calls[id]), busy: false })
      if (taken.every(Boolean)) sendNow(name)
    })
  }
  /** Sends the form to the function it calls, by its name, once its fields pass their checks. */
  const sendNow = (name: string): void => {
    const form = element.current
    if (!form) return
    const zone = store.page.zone
    // What the browser collects of the native controls, each read by its type, what each driven field holds, and
    // for a field that no control shows what it starts with.
    const natives = reader(sentOf(form), zone)
    const controlled = nativesOf()
    const values = Object.keys(fields).map((field): [string, unknown] => [
      field,
      !driven.current.has(field) && controlled.has(field)
        ? (nativeFiles.current.get(field) ?? deepOf(natives, field))
        : valueOf(field),
    ])
    const filled = Object.fromEntries(values.filter(([, value]) => value !== undefined && value !== ''))
    const sent = { ...nestedOf(filled), ...(isStored(carried) ? carried : {}) }
    if (store.page.mode === 'development') warnUnknown(form)
    const wrong = Object.entries(checkedBy(checks, sent)).map(([field, check]): [string, string] => [
      field,
      wordsOf(check, field),
    ])
    // A field that fails and that the form does not show has no place for its words: they stand after the last field.
    const unseen = wrong.filter(([field]) => !driven.current.has(field) && !controlled.has(field))
    tell(wrong, unseen.length ? unseen.map(([field, said]) => `${asWords(field)}: ${said}`).join(' ') : undefined)
    if (wrong.length) return
    sending.current = true
    keep({ busy: true })
    // A call held for want of a connection says so in `calls.<id>`, and one with `optimistic={false}` shows nothing ahead.
    const held = { held: (on: boolean) => keep(on ? { busy: true, held: true } : { busy: true }) }
    // The screens shown when the send began: a move meanwhile drops what `then` says, and the call goes on.
    const shown = (): string => `${store.page.screen} ${store.upper?.()?.page.screen ?? ''}`
    const sentFrom = shown()
    store.call(name, sent, optimistic === false ? { ...held, optimistic: false } : held).then(
      (value) => {
        sending.current = false
        keep({ busy: false, value })
        // After a send that worked every field goes back to its start, or the ones that `reset` names.
        if (reset !== false) restart(Array.isArray(reset) ? reset : undefined)
        if (shown() === sentFrom) follow(store, then, value, view.set)
      },
      (thrown: unknown) => {
        sending.current = false
        const error = seenOf(thrown)
        keep({ busy: false, error })
        const named = Object.entries(error.fields ?? {}).filter(([field]) => Object.hasOwn(fields, field))
        // A `fail` of the app's own is shown in the words of the language files where they give it.
        const at = (field: string, check: string): string =>
          Object.hasOwn(store.words, `failAt.${error.code}.${field}`)
            ? textOf(store.words, `failAt.${error.code}.${field}`, error.fields ?? {}, store.page.language)
            : wordsOf(check, field)
        // A field takes no focus while the form is busy: the focus is given once the form is drawn as it ended.
        failing.current = named.map(([field]) => field)
        const failed = named.length ? undefined : failedWords(error)
        const said = named.map(([field, check]): [string, string] => [field, at(field, check)])
        const shown = nativesOf()
        for (const held of shown.values()) for (const one of held) one.setCustomValidity('')
        for (const [field, words] of said) shown.get(field)?.[0]?.setCustomValidity(words)
        change({ errors: Object.fromEntries(said.filter(([field]) => driven.current.has(field))), failed })
      },
    )
  }
  /** Puts the fields back at their start: every one, or those that are named. Each counts as untouched again. */
  function restart(names: readonly string[] | undefined): void {
    const touched = names
      ? Object.fromEntries(Object.entries(kept.touched).filter(([field]) => !names.includes(field)))
      : {}
    change({ touched })
    for (const [field, held] of nativesOf()) {
      if (names && !names.includes(field)) continue
      touchedNative.current.delete(field)
      nativeFiles.current.delete(field)
      nativeUploads.current.delete(field)
      for (const one of held) startAgain(one)
    }
  }
  /** In the mode `development` the console names a control whose name the function does not take: the check cannot see it. */
  function warnUnknown(form: HTMLFormElement): void {
    for (const one of Array.from(form.elements)) {
      if (!isNative(one) || one.name === '' || one.type === 'hidden' || one.type === 'submit') continue
      if (Object.hasOwn(fields, one.name) || warned.current.has(one.name)) continue
      if (isStored(carried) && Object.hasOwn(carried, one.name)) continue
      warned.current.add(one.name)
      console.warn(`Form: \`${name ?? ''}\` takes no field \`${one.name}\`: the control sends nothing.`)
    }
  }
  /** Gives the focus to the first of the fields, in the order the form shows them, and a native one its words. */
  function focusFirst(failed: string[]): void {
    if (!failed.length) return
    // The fields of the form in the order of the page: its own controls, and those that `useField` drives.
    const all: { name: string; at: Element | undefined; focus(): void }[] = Array.from(
      element.current?.elements ?? [],
    ).flatMap((one) =>
      isNative(one) && !driven.current.has(one.name)
        ? [{ name: one.name, at: one, focus: () => (one.validationMessage ? one.reportValidity() : one.focus()) }]
        : [],
    )
    for (const [field, held] of builders.current)
      all.push({ name: field, at: held instanceof Element ? held : undefined, focus: () => held.focus() })
    const ordered = all
      .filter((one) => failed.includes(one.name))
      .sort((a, b) =>
        a.at && b.at ? (a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1) : 0,
      )
    ordered[0]?.focus()
  }
  // A send that the engine refused gives the focus once the form is no longer busy, and its fields take it.
  useEffect(() => {
    if (!failing.current.length || busy) return
    focusFirst(failing.current)
    failing.current = []
  })
  // A native control that a person has not touched follows a later change of what its field starts with.
  useEffect(() => {
    for (const [field, held] of nativesOf())
      if (!touchedNative.current.has(field)) for (const one of held) startAgain(one)
  })
  // One answer for the parts inside while the form is as busy as it was and calls the same: a part reads its field
  // from it, and is drawn again for a change of that field alone.
  const made = useRef<{ held: FormHeld; busy: boolean; name: string | undefined; fields: Record<string, unknown> }>(
    undefined,
  )
  if (made.current?.busy !== busy || made.current.name !== name || made.current.fields !== fields)
    made.current = { held: heldOf(), busy, name, fields }
  const held = made.current.held
  /** What the form gives the parts inside it. */
  function heldOf(): FormHeld {
    return {
      ...(name === undefined ? {} : { call: name }),
      input: fields,
      field: (field) => {
        const value = valueOf(field)
        const error = kept.errors[field]
        const before = kept.answered.get(field)
        if (before && Object.is(before.value, value) && before.error === error) return before
        const answer = { value, error }
        kept.answered.set(field, answer)
        return answer
      },
      listen: (heard) => {
        kept.listeners.add(heard)
        return () => void kept.listeners.delete(heard)
      },
      busy,
      set: (field, value) => change({ touched: { ...kept.touched, [field]: value } }),
      focusOf: (field, element) => {
        if (element) builders.current.set(field, element)
        else builders.current.delete(field)
      },
      drives: (field) => {
        driven.current.set(field, (driven.current.get(field) ?? 0) + 1)
        return () => {
          const left = (driven.current.get(field) ?? 1) - 1
          if (left) driven.current.set(field, left)
          else driven.current.delete(field)
        }
      },
      // In the mode `development` the console names a field that the function does not take: the check cannot see it.
      unknown: (field) => {
        if (store.page.mode !== 'development' || warned.current.has(field)) return
        warned.current.add(field)
        console.warn(`useField: \`${name ?? ''}\` takes no field \`${field}\`: the field holds nothing.`)
      },
      upload,
    }
  }
  /**
   * Sends the files picked for a field to the files door, one after another, and answers the id of each it took. A
   * file that the door refuses is told to the person as the form's error.
   */
  async function upload(field: string, files: File[], step: (share: number) => void): Promise<string[]> {
    const ids: string[] = []
    for (const [at, file] of files.entries()) {
      const scaled = await scaledDown(file, false)
      const query = new URLSearchParams({ name: sentName(file, scaled), ...(name ? { for: name } : {}), field })
      const answer = await uploaded(
        named(store.page, `/_t/files?${query}`),
        scaled,
        (share) => step((at + share) / files.length),
        store.page.pass,
      )
      if ('id' in answer) ids.push(answer.id)
      else refused(seenOf({ code: 'T0009', name: 'failed', ...answer.error }))
    }
    return ids
  }
  /** Tells the refusal of an upload as the form's error: in `calls.<id>.error`, and in the words after its fields. */
  function refused(error: WireError): void {
    keep({ busy: sending.current, error })
    change({ failed: failedWords(error) })
  }
  /** Uploads the files picked in a native control of a `file` field, and holds their ids for the next send. */
  function picked(control: HTMLInputElement): void {
    const type = fields[control.name]
    const many = isStored(type) && type.kind === 'list'
    const kind = isStored(type) ? (many && isStored(type.of) ? type.of.kind : type.kind) : undefined
    if (kind !== 'file' || driven.current.has(control.name)) return
    const files = Array.from(control.files ?? [])
    const field = control.name
    nativeFiles.current.delete(field)
    nativeUploads.current.delete(field)
    if (!files.length) return
    const under: Promise<boolean> = upload(field, files, () => undefined).then((ids) => {
      // A later pick, or a restart of the form, took the place of this one.
      if (nativeUploads.current.get(field) !== under) return false
      nativeUploads.current.delete(field)
      if (ids.length) nativeFiles.current.set(field, many ? ids : ids[0])
      return ids.length === files.length
    })
    nativeUploads.current.set(field, under)
  }
  const startAt = (field: string): { type: unknown; value: unknown } | undefined =>
    Object.hasOwn(fields, field) ? { type: fields[field], value: valueOf(field) } : undefined
  // With no script a press of the engine's own posts its own form to its own address.
  const hidden: [string, string][] = posted
    ? Object.entries(posted.form)
    : [
        ['t-at', atOf(store)],
        // A page in the inspect mode keeps it through a form that is sent with no script.
        ...(partHeld('inspect')?.fields(store) ?? []),
        ['t-form', key],
        ['t-version', store.page.version],
        ...Object.entries(isStored(carried) ? carried : {}).flatMap(([field, value]) => carriedAs(field, value)),
      ]
  return (
    <form
      {...rest}
      id={id}
      ref={(one: HTMLFormElement | null) => {
        element.current = one
      }}
      noValidate
      // With no script the form posts itself, with the hidden fields that say where it was sent from.
      method="post"
      action={named(store.page, posted ? posted.post : `/_t/form/${encodeURIComponent(name ?? '')}`)}
      onSubmit={send}
      onInput={(event) => {
        onInput?.(event)
        // A control a person changed keeps what was typed, and is no longer held for the words of its last check.
        const target = event.target
        if (!isNative(target)) return
        touchedNative.current.add(target.name)
        target.setCustomValidity('')
        if (target instanceof HTMLInputElement && target.type === 'file') picked(target)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        // Enter in a field of one line sends the form, unless the form says `sendOnEnter={false}`.
        const target = event.target
        if (event.key !== 'Enter' || !(target instanceof HTMLInputElement) || !oneLine.has(target.type)) return
        event.preventDefault()
        if (sendOnEnter !== false) element.current?.requestSubmit()
      }}
      {...(busy ? { 'aria-busy': true } : {})}
    >
      {hidden.map(([field, value], at) => (
        <input key={`${field}.${String(at)}`} type="hidden" name={field} value={value} />
      ))}
      <FormContext.Provider value={held}>{started(children, startAt)}</FormContext.Provider>
      <FailedWords words={words} />
    </form>
  )
}

/** Puts a native control back at the start that the view gave it. */
function startAgain(one: Native): void {
  if (one instanceof HTMLSelectElement)
    for (const option of Array.from(one.options)) option.selected = option.defaultSelected
  else if (one instanceof HTMLInputElement && (one.type === 'checkbox' || one.type === 'radio'))
    one.checked = one.defaultChecked
  // A field of files holds no start of its own: the browser lets it be emptied alone.
  else if (one instanceof HTMLInputElement && one.type === 'file') one.value = ''
  else one.value = one.defaultValue
}

holdPart('form', { Form: FormDrawn })
