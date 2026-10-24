import { TentError } from '../../core/index.ts'
import type { Who } from '../makers.ts'
import { isStored } from '../../core/internal.ts'

/** A message as `mail.send` holds it once it is read: every address a record, every list a list, the files by their ids. */
export interface Read {
  to: Who[]
  from?: Who
  subject: string
  text?: string
  html?: string
  replyTo?: Who
  cc?: Who[]
  bcc?: Who[]
  headers?: Record<string, string>
  attach: string[]
}

const members = ['to', 'subject', 'text', 'html', 'from', 'replyTo', 'cc', 'bcc', 'headers', 'attach']

// The lines of the head that have a field of their own, and that `headers` may not name, whatever its capitals.
const own = ['to', 'cc', 'bcc', 'from', 'reply-to', 'subject']

const bad = (field: string, check: string, words: string): TentError =>
  new TentError('T0002', `The message does not fit: ${words}`, {
    fields: { [field]: check },
    fix: 'Hand `mail.send` one address in each address, and no line break in the head of the message.',
  })

/** Whether a text holds a control character, a line break among them. */
const hasControl = (text: string): boolean =>
  [...text].some((sign) => sign.charCodeAt(0) < 32 || sign.charCodeAt(0) === 127)

/**
 * Reads one address: a text, or `{ name, address }`. An address is exactly one address: one `@` with something on
 * each side, and no comma, semicolon, angle bracket, space or control character. A name holds no control
 * character, no quote and no angle bracket. Throws T0002.
 */
function whoOf(field: string, given: unknown): Who {
  const [address, name]: unknown[] = isStored(given) ? [given.address, given.name] : [given, undefined]
  const one =
    typeof address === 'string' &&
    address.split('@').length === 2 &&
    address.split('@').every((part) => part !== '') &&
    !/[,;<>\s]/.test(address) &&
    !hasControl(address)
  if (!one || typeof address !== 'string')
    throw bad(field, 'pattern', `\`${field}\` holds what is not exactly one address.`)
  if (name === undefined) return { address }
  if (typeof name !== 'string' || hasControl(name) || /["<>]/.test(name))
    throw bad(field, 'pattern', `a name in \`${field}\` holds a control character, a quote or an angle bracket.`)
  return { address, name }
}

/** Reads one address or a list of them, as a list. */
const listOf = (field: string, given: unknown): Who[] =>
  (Array.isArray(given) ? given : [given]).map((one) => whoOf(field, one))

/**
 * Takes what `mail.send` was handed. Answers the message as it is read: every address as `{ address, name }`,
 * every list as a list. Nothing that a person typed can add a receiver or a line to the head: an address that is
 * not exactly one address, a subject or a header with a line break, a header that names a line which has a field
 * of its own, and a member that no message has are all T0002.
 */
export function readMessage(given: unknown): Read {
  if (!isStored(given)) throw bad('message', 'type', '`mail.send` takes a record.')
  for (const member of Object.keys(given))
    if (!members.includes(member)) throw bad(member, 'unknown', `\`${member}\` is no member of a message.`)
  const to = given.to === undefined ? [] : listOf('to', given.to)
  if (!to.length) throw bad('to', 'required', 'it names nobody in `to`.')
  const { subject, text, html } = given
  if (typeof subject !== 'string') throw bad('subject', 'required', 'it has no `subject`.')
  if (hasControl(subject)) throw bad('subject', 'pattern', 'its `subject` holds a line break or a control character.')
  for (const [field, value] of Object.entries({ text, html }))
    if (value !== undefined && typeof value !== 'string') throw bad(field, 'type', `\`${field}\` is no text.`)
  if (typeof text !== 'string' && typeof html !== 'string')
    throw bad('text', 'required', 'it has neither `text` nor `html`.')
  const headers: Record<string, string> = {}
  if (given.headers !== undefined) {
    if (!isStored(given.headers)) throw bad('headers', 'type', '`headers` is a record of lines.')
    for (const [name, value] of Object.entries(given.headers)) {
      if (!/^[A-Za-z0-9-]+$/.test(name))
        throw bad('headers', 'pattern', 'the name of a header is letters, digits and hyphens.')
      if (own.includes(name.toLowerCase()))
        throw bad('headers', 'values', `\`${name}\` has a field of its own, and is no line of \`headers\`.`)
      if (typeof value !== 'string' || hasControl(value))
        throw bad('headers', 'pattern', `the header \`${name}\` holds a line break, or is no text.`)
      headers[name] = value
    }
  }
  const attach = given.attach === undefined ? [] : given.attach
  if (!Array.isArray(attach) || !attach.every((one) => typeof one === 'string'))
    throw bad('attach', 'type', '`attach` is a list of the ids of files.')
  return {
    to,
    ...(given.from === undefined ? {} : { from: whoOf('from', given.from) }),
    subject,
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof html === 'string' ? { html } : {}),
    ...(given.replyTo === undefined ? {} : { replyTo: whoOf('replyTo', given.replyTo) }),
    ...(given.cc === undefined ? {} : { cc: listOf('cc', given.cc) }),
    ...(given.bcc === undefined ? {} : { bcc: listOf('bcc', given.bcc) }),
    ...(Object.keys(headers).length ? { headers } : {}),
    attach: attach.map(String),
  }
}
