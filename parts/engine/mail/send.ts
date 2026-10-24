import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { hasFullAccess } from '../full.ts'
import type { Mailer, Who } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { mayDownload } from '../stored/access.ts'
import type { StoredFile } from '../stored/files.ts'
import { wholeBytes as bytesOf, fileRow } from '../stored/files.ts'
import { valuesOf } from '../values/ofApp.ts'
import { visitorNow } from '../visitor.ts'
import { keepInMailbox } from './mailbox.ts'
import { readMessage } from './message.ts'
import { mailSecret, shippedMailer } from './shipped.ts'
import { gather } from '../counts/gather.ts'
import { sentOut } from '../sentOut.ts'
import { sentBytes } from '../counts/outgoing.ts'

/** How one app sends its mail: the mailer that a maker made for it, and whether it sends where its mode would print. */
interface Sending {
  mailer?: Mailer
  send: boolean
}

/** A file of a message, read whole. */
type Attached = { name: string; kind: string; bytes: Uint8Array }

// How each app sends, kept under its handles: every record that the engine holds of one app shares those.
const kept = new WeakMap<object, Sending>()

/** Is told at the opening of an app how it sends its mail. */
export const keepMail = (o: Opened, how: Sending): void => void kept.set(o.handles, how)

/** One address as a line of a log writes it. */
const written = (who: Who): string => (who.name === undefined ? who.address : `${who.name} <${who.address}>`)

/** The address that the project states its mail is from, where it states one. */
function projectFrom(o: Opened): Who | undefined {
  const from: unknown = Reflect.get(Object(o.description.project.mail), 'from')
  if (typeof from === 'string') return { address: from }
  const [address, name]: unknown[] = [Reflect.get(Object(from), 'address'), Reflect.get(Object(from), 'name')]
  return typeof address === 'string' ? { address, ...(typeof name === 'string' ? { name } : {}) } : undefined
}

/** The file of an id for the caller of a call, by the rule of a download. Throws T0001: a file that is not theirs is not there. */
function attached(o: Opened, cx: CallContext, id: string): StoredFile {
  const file = fileRow(o, id)
  const visitor = visitorNow()
  const theirs = file && (hasFullAccess(cx) || mayDownload(o, cx.caller, file, visitor))
  if (!file || file.removedAt !== undefined || !theirs)
    throw new TentError('T0001', `No file has the id ${JSON.stringify(id).slice(0, 60)}.`, {
      fix: 'Attach a file that the caller of the call may download.',
    })
  return file
}

/** What a mail server answered, with the password of the mail secret taken out where it holds it. */
function withoutPassword(o: Opened, answer: string): string {
  const named = mailSecret(o)
  if (named === undefined) return answer
  try {
    const server = new URL(valuesOf(o).secrets.value(named))
    const hidden = [server.password, decodeURIComponent(server.password)].filter((one) => one !== '')
    return hidden.reduce((text, one) => text.split(one).join('[secret]'), answer)
  } catch {
    // A secret that has no value, or holds no address, hides nothing.
    return answer
  }
}

/** The words a line of the log starts with that holds a mail which the mode `development` did not send. */
const mailLine = 'Mail that is not sent in the mode development'

/**
 * Takes an app, the call that sends, and what `mail.send` was handed. Reads the message, holds each attached file
 * to the rule of a download for the caller, and does what the mode says: in the modes `development` and `test` the
 * message is kept in the mailbox of the app; in `development` its head, its text and the names of its files are
 * written to the log too and nothing is sent, unless the app was opened to send; otherwise the message is handed to
 * the mailer of the app, with each file read first, which a test makes of its own. Throws
 * T0002 for a message that does not fit or is from nobody, T0001 for a file that is not the caller's to have,
 * T0020 where there is no mailer, and T0021 where the server did not take the message, or took it for some. The
 * mailer that ships throws T0019, T0020 and T0022 as `shippedMailer` says.
 */
export async function sendMail(o: Opened, cx: CallContext, given: unknown): Promise<void> {
  const how = kept.get(o.handles) ?? { send: false }
  const read = readMessage(given)
  const files = read.attach.map((id) => attached(o, cx, id))
  const from = read.from ?? projectFrom(o)
  const { attach: _, ...head } = read
  const bytesOfAll = () =>
    Promise.all(files.map(async (file) => ({ name: file.name, kind: file.kind, bytes: await bytesOf(o, file) })))
  // The development mode keeps what the app sent in its mailbox, to be read at `/_t/mail` as its receiver would see it.
  if (o.mode === 'development') {
    const attach = await bytesOfAll()
    keepInMailbox(o, { ...head, ...(from ? { from } : {}), ...(attach.length ? { attach } : {}) })
  }
  if (o.mode === 'development' && !how.send) {
    const told = {
      ...(from ? { from: written(from) } : {}),
      to: head.to.map(written),
      ...(head.cc ? { cc: head.cc.map(written) } : {}),
      ...(head.bcc ? { bcc: head.bcc.map(written) } : {}),
      ...(head.replyTo ? { replyTo: written(head.replyTo) } : {}),
      subject: head.subject,
      ...(head.headers ? { headers: head.headers } : {}),
      ...(head.text === undefined ? {} : { text: head.text }),
      ...(head.html === undefined ? {} : { html: head.html }),
      ...(files.length ? { files: files.map((file) => file.name) } : {}),
    }
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'info',
      message: `${mailLine}: ${head.subject}`,
      data: JSON.stringify(told),
    })
    return
  }
  await sentOut(o, cx, { service: 'mail', call: 'send' }, () => handedOut(o, cx, how, { head, from, bytesOfAll }))
}

/**
 * Hands a message out as the mode says: in a test it is kept in the mailbox of the app, and handed to a mailer only
 * where the program gave one; otherwise to the mailer of the app. Throws as `sendMail` says.
 */
async function handedOut(
  o: Opened,
  cx: CallContext,
  how: Sending,
  m: {
    head: Omit<ReturnType<typeof readMessage>, 'attach'>
    from: Who | undefined
    bytesOfAll: () => Promise<Attached[]>
  },
): Promise<void> {
  const { head, from, bytesOfAll } = m
  // A test sends nothing: its message is kept in the mailbox of the app, and no mailer is needed.
  if (o.mode !== 'test' && !how.mailer && mailSecret(o) === undefined)
    throw new TentError('T0020', 'The app has no mailer: it connects none, and its project names no mail server.', {
      fix: 'State `mail` in `project`, with the secret that holds the address of the mail server, or connect a `Mailer` in `engine.ts`.',
    })
  if (!from)
    throw new TentError('T0002', 'The message is from nobody: it states no `from`, and the project states none.', {
      fields: { from: 'required' },
      fix: 'State `from` in the message, or `mail: { from }` in `project`.',
    })
  if (o.mode === 'test') {
    // A test keeps what its app sent in the mailbox of the app, the one that `app.mailbox` reads; a mailer that
    // the program handed it, as a workspace's that writes `mail.jsonl`, is that app's mailbox too.
    const attach = await bytesOfAll()
    const message = { ...head, from, ...(attach.length ? { attach } : {}) }
    keepInMailbox(o, message)
    if (!how.mailer) return
    await handOn(o, how.mailer, message, cx)
    return
  }
  // The mailer that ships looks the server up for this message, before anything is read.
  const mailer = how.mailer ?? (await shippedMailer(o))
  if (!mailer) throw new TentError('T0020', 'The app has no mailer.')
  const attach = await bytesOfAll()
  await handOn(o, mailer, { ...head, from, ...(attach.length ? { attach } : {}) }, cx)
}

/**
 * Hands a message to a mailer. A message that it takes is counted, for the caller of the call where one is given,
 * with the bytes of its head, its words and its files. Throws T0021 where it does not take the message, with its
 * answer in the log, and where it took it for some addresses alone.
 */
async function handOn(
  o: Opened,
  mailer: Mailer,
  message: Parameters<Mailer['send']>[0],
  cx?: CallContext,
): Promise<void> {
  const { attach = [], ...head } = message
  let answered: { refused?: string[] }
  try {
    answered = Object(await mailer.send(message))
  } catch (error) {
    const answer = withoutPassword(o, error instanceof Error ? error.message : String(error))
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'error',
      message: 'The mail server did not take a message.',
      data: JSON.stringify({ subject: head.subject, answer }),
    })
    throw new TentError('T0021', 'The mail server did not take the message. The log holds its answer.', {
      fix: 'Read the answer of the server in the log, with `tent logs`.',
    })
  }
  // A message that the server took is counted, with the bytes of its head, its words and its files.
  const bytesOut = sentBytes(JSON.stringify(head)) + attach.reduce((all, one) => all + one.bytes.byteLength, 0)
  if (cx) gather(o, 'mail', { mails: 1, bytesOut }, { caller: cx.caller })
  const refused = Array.isArray(answered.refused) ? answered.refused.map(String) : []
  if (refused.length)
    throw new TentError(
      'T0021',
      `The mail server took the message for some addresses, and not for: ${refused.join(', ').slice(0, 400)}.`,
      { fix: 'Send the message again to the addresses that the error names.' },
    )
}
