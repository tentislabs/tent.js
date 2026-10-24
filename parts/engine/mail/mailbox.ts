import { randomBytes } from 'node:crypto'
import { openedOf } from '../app.ts'
import type { Mailer, Who } from '../makers.ts'
import type { Opened } from '../opened.ts'

/** A message as a `Mailer` is handed it, where the mode `development` may keep one that is from nobody yet. */
export type Unsent = Omit<Parameters<Mailer['send']>[0], 'from'> & { from?: Who }

/** A message as `/_t/mail` and `tent logs --mail` show it: who it is from and to, its words, and the names of its files. */
export interface KeptMail {
  id: string
  at: number
  from?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  files?: string[]
}

// How many messages the mode `development` keeps, where a program runs for days: the newest. A test keeps all.
const most = 100

// The mailbox of each app, in the order its messages were kept, under its handles: one for all its versions.
const boxes = new WeakMap<object, { id: string; at: number; message: Unsent }[]>()

/**
 * Keeps a message that an app sent where nothing is sent, in the mode `development` and `test`, in its mailbox:
 * the one place that `/_t/mail`, `tent logs --mail` and `app.mailbox` of a test read.
 */
export function keepInMailbox(o: Opened, message: Unsent): void {
  const box = boxes.get(o.handles) ?? []
  boxes.set(o.handles, box)
  box.push({ id: randomBytes(12).toString('base64url'), at: o.clock.now(), message })
  if (o.mode === 'development' && box.length > most) box.splice(0, box.length - most)
}

/** Takes an app of the engine. Answers the messages of its mailbox, in the order they were kept, each as a `Mailer` is handed it. */
export function mailboxOf(app: object): Unsent[] {
  const o = openedOf(app)
  return o ? (boxes.get(o.handles) ?? []).map((one) => one.message) : []
}

/** One address as a line writes it. */
const written = (who: Who): string => (who.name === undefined ? who.address : `${who.name} <${who.address}>`)

/** The messages of the mailbox of an app as they are shown, the newest first. */
export function sentMail(o: Opened): KeptMail[] {
  return [...(boxes.get(o.handles) ?? [])].reverse().map(({ id, at, message }) => ({
    id,
    at,
    ...(message.from ? { from: written(message.from) } : {}),
    to: message.to.map(written),
    ...(message.cc ? { cc: message.cc.map(written) } : {}),
    ...(message.bcc ? { bcc: message.bcc.map(written) } : {}),
    subject: message.subject,
    ...(message.text === undefined ? {} : { text: message.text }),
    ...(message.html === undefined ? {} : { html: message.html }),
    ...(message.attach?.length ? { files: message.attach.map((one) => one.name) } : {}),
  }))
}
